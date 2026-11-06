const { Types } = require('mongoose');
const { createHash } = require('crypto');
const Organizacion = require('../models/Organizacion');
const Pago = require('../models/PagoSuscripcion');
const Auditoria = require('../models/Auditoria');
const Finca = require('../models/Finca');
const Animal = require('../models/Animal');
const { Membresia } = require('../models/Membresia');
const Invitacion = require('../models/Invitacion');
const Reserva = require('../models/ReservaCuotaPlan');
const { planesConfig } = require('../config/planes');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');
const { validarClavesSeguras } = require('./animal-dto');
const { resolverSuscripcion, modoFacturacion, establecerPeriodo, sumarMeses, DIA } = require('./suscripcion-estado-service');

const error = (mensaje, status = 422, code = 'SUBSCRIPTION_INVALID', detalles) => Object.assign(new Error(mensaje), { status, code, detalles });
const idValido = (id) => { if (!Types.ObjectId.isValid(id)) throw error('Identificador no válido.'); return id; };
const dto = (entrada, campos) => {
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw error('Se requiere un objeto de datos.');
    validarClavesSeguras(entrada);
    const desconocidos = Object.keys(entrada).filter((c) => !campos.includes(c));
    if (desconocidos.length) throw error(`Campos no permitidos: ${desconocidos.join(', ')}.`);
    return entrada;
};
const texto = (v, max = 2000) => {
    if (v !== undefined && typeof v !== 'string') throw error('Los textos deben ser cadenas.');
    const t = String(v || '').trim(); if (t.length > max) throw error('El texto excede la longitud permitida.'); return t;
};
const entero = (v, defecto, min, max) => {
    if (v !== undefined && typeof v !== 'string' && typeof v !== 'number') throw error('El valor debe ser numérico.');
    const n = v === undefined || v === '' ? defecto : Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw error(`Se requiere un entero entre ${min} y ${max}.`);
    return n;
};
const fechaValida = (v, zonaHoraria = 'America/Costa_Rica') => {
    if (typeof v !== 'string' && !(v instanceof Date)) throw error('Fecha no válida.');
    // Las fechas sin hora son civiles, hasta el fin del dia de Costa Rica (UTC-6).
    const { rangoInstantesEnZona } = require('./fechaZonaHoraria-service');
    const f = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? rangoInstantesEnZona({ fechaInicio: v, fechaFin: v, zonaHoraria }).fin : new Date(v);
    if (!Number.isFinite(+f)) throw error('Fecha no válida.'); return f;
};
const snapshot = (org) => Object.fromEntries(['plan', 'estadoSuscripcion', 'fechaInicioPeriodoActual', 'fechaProximoVencimiento', 'fechaFinPeriodoActual',
    'diasGracia', 'notasFacturacion', 'revisionSuscripcion', 'ultimoPagoSuscripcion', 'avisoVencimientoCiclo', 'avisoCarteraCiclo'].map((c) => [c, org.toObject ? org.toObject()[c] ?? null : org[c] ?? null]));
const auditar = (org, usuario, evento, antes, despues, session) => Auditoria.create([{
    organizacionId: org._id, usuario: usuario || undefined, usuarioRol: usuario ? 'Superadministrador' : 'Sistema',
    accion: evento, evento, modulo: 'Administracion SaaS', metodo: usuario ? 'POST' : 'CRON',
    ruta: `/api/admin/organizaciones/${org._id}/suscripcion`, recursoTipo: 'Organizacion', recursoId: String(org._id),
    estado: 'Exitoso', datos: { antes, despues }
}], { session });
const obtenerOrg = async (id, session) => {
    const org = await Organizacion.findById(idValido(id)).session(session);
    if (!org) throw error('Organización no encontrada.', 404);
    if (modoFacturacion(org) !== 'MANUAL') throw error('La suscripción se administra en Stripe. No se permite modificarla como manual.', 409, 'SUBSCRIPTION_STRIPE_MANAGED');
    return org;
};

const validarPlanDestino = async (org, codigo, especiePlan, session) => {
    const destino = planesConfig[codigo];
    if (!destino) throw error('Plan no válido.');
    const especie = codigo === 'ESENCIAL' ? (especiePlan || org.plan.especiePlan) : null;
    if (codigo === 'ESENCIAL' && !['Bovino', 'Porcino'].includes(especie)) throw error('Selecciona la especie del plan Esencial.');
    if (codigo === org.plan.codigo && especie === (org.plan.especiePlan || null)) return especie;
    // Serializar el cambio con reservas en curso; una alta posterior relee el plan vigente.
    for (const recurso of ['animales', 'usuarios', 'fincas']) {
        await Reserva.findOneAndUpdate({ organizacionId: org._id, recurso }, { $setOnInsert: { recurso }, $inc: { revisionPlan: 1 } }, { upsert: true, session });
    }
    if (await Reserva.exists({ organizacionId: org._id, reservas: { $elemMatch: { expiraEn: { $gt: new Date() } } } }).session(session)) {
        throw error('Hay altas en curso. Reintenta el cambio de plan al finalizar.', 409, 'SUBSCRIPTION_QUOTA_BUSY');
    }
    const limites = destino.limites, excesos = [];
    const fincas = await Finca.find({ estado: 'Activa' }).session(session).lean();
    const usuarios = await Membresia.countDocuments({ organizacionId: org._id, estado: 'Activo' }).session(session)
        + await Invitacion.countDocuments({ organizacionId: org._id, estado: 'Pendiente', expiraEn: { $gt: new Date() } }).session(session);
    const grupos = await Animal.aggregate([{ $match: { estado: 'Activo' } }, { $group: { _id: { $ifNull: ['$especie', 'Bovino'] }, cantidad: { $sum: 1 } } }]).session(session);
    // Incluye crias colectivas, no solo los animales individualizados del inventario.
    const { contarCriasColectivasVivas } = require('./plan-service');
    const colectivas = await contarCriasColectivasVivas({ session });
    const bovinos = grupos.find((g) => g._id === 'Bovino')?.cantidad || 0;
    const porcinos = (grupos.find((g) => g._id === 'Porcino')?.cantidad || 0) + colectivas;
    const agregar = (recurso, actual, limite) => { if (limite !== null && limite !== undefined && actual > limite) excesos.push({ recurso, actual, limite }); };
    agregar('fincas', fincas.length, limites.fincas); agregar('usuarios', usuarios, limites.usuarios);
    agregar('animales', codigo === 'ESENCIAL' ? especie === 'Bovino' ? bovinos : porcinos : bovinos + porcinos,
        codigo === 'ESENCIAL' ? especie === 'Bovino' ? limites.bovinosSiSeleccionados : limites.porcinosSiSeleccionados : limites.animalesActivosTotal);
    if (codigo === 'ESENCIAL' && ((especie === 'Bovino' ? porcinos : bovinos) > 0 || fincas.some((f) => f.lineasProductivas?.some((l) => l.activa !== false && l.especie !== especie)))) {
        excesos.push({ recurso: 'especies', permitida: especie, mensaje: 'Existen animales o líneas productivas de la otra especie.' });
    }
    if (excesos.length) throw error('La organización supera los límites del plan destino. Resuelve los excesos antes del cambio.', 409, 'SUBSCRIPTION_DOWNGRADE_CONFLICT', excesos);
    return especie;
};

const registrarPagoEnTransaccion = async (org, entrada, usuarioId, session, ahora = new Date(), { pagoInicial = false } = {}) => {
    dto(entrada, ['metodoPago', 'moneda', 'monto', 'referenciaComprobante', 'mesesCubiertos', 'planOpcional', 'especiePlan', 'fechaFinPersonalizada', 'notas', 'claveIdempotencia']);
    const clave = texto(entrada.claveIdempotencia, 120);
    if (!clave) throw error('Se requiere una clave de operación para evitar cobros duplicados.');
    const hash = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(entrada).filter(([k, v]) => k !== 'claveIdempotencia' && v !== undefined && v !== '').sort(([a], [b]) => a.localeCompare(b))))).digest('hex');
    const anterior = await Pago.findOne({ claveIdempotencia: clave }).select('+solicitudHash').session(session);
    if (anterior) {
        const solicitado = { metodoPago: entrada.metodoPago, moneda: entrada.moneda, monto: Number(entrada.monto), mesesCubiertos: entero(entrada.mesesCubiertos, 1, 1, 120) };
        if (anterior.solicitudHash !== hash || anterior.estado !== 'REGISTRADO' || Object.entries(solicitado).some(([c, v]) => anterior[c] !== v)
            || (entrada.planOpcional && anterior.plan !== entrada.planOpcional)
            || (texto(entrada.referenciaComprobante, 200) !== (anterior.referenciaComprobante || ''))) {
            throw error('La clave de operación ya se utilizó con otros datos.', 409, 'SUBSCRIPTION_IDEMPOTENCY_CONFLICT');
        }
        return { organizacion: org, pago: anterior, duplicado: true };
    }
    if (!['SINPE_MOVIL', 'TRANSFERENCIA_IBAN', 'EFECTIVO', 'TARJETA_MANUAL', 'OTRO'].includes(entrada.metodoPago)) throw error('Método de pago manual no válido.');
    if (!['CRC', 'USD'].includes(entrada.moneda)) throw error('Moneda no válida.');
    if (typeof entrada.monto !== 'number' && typeof entrada.monto !== 'string') throw error('El monto debe ser numérico.');
    const monto = Number(entrada.monto);
    if (!Number.isFinite(monto) || monto <= 0 || monto > 1e12 || Math.abs(monto * 100 - Math.round(monto * 100)) > 0.0001) throw error('El monto debe ser positivo y tener como máximo dos decimales.');
    const referencia = texto(entrada.referenciaComprobante, 200);
    if (['SINPE_MOVIL', 'TRANSFERENCIA_IBAN'].includes(entrada.metodoPago) && !referencia) throw error('Indica el número de comprobante o transferencia.');
    const meses = entero(entrada.mesesCubiertos, 1, 1, 120);
    const antes = snapshot(org), actual = resolverSuscripcion(org, ahora);
    const inicio = !pagoInicial && actual.fechaProximoVencimiento > ahora && org.plan.estado !== 'Prueba' && !['VENCIDA', 'CANCELADA'].includes(actual.estadoSuscripcion)
        ? actual.fechaProximoVencimiento : ahora;
    const fin = entrada.fechaFinPersonalizada ? fechaValida(entrada.fechaFinPersonalizada, org.zonaHoraria) : sumarMeses(inicio, meses, org.zonaHoraria);
    if (fin <= inicio) throw error('El fin del período debe ser posterior al inicio.');
    const codigo = entrada.planOpcional || org.plan.codigo;
    const especie = await validarPlanDestino(org, codigo, entrada.especiePlan, session);
    org.plan.codigo = codigo; org.plan.especiePlan = especie;
    establecerPeriodo(org, inicio, fin);
    org.revisionSuscripcion = Number(org.revisionSuscripcion || 0) + 1;
    const [pago] = await Pago.create([{
        organizacionId: org._id, plan: codigo, metodoPago: entrada.metodoPago, moneda: entrada.moneda, monto,
        referenciaComprobante: referencia || undefined, mesesCubiertos: meses, periodoCubiertoInicio: inicio, periodoCubiertoFin: fin,
        fechaPago: ahora, registradoPor: usuarioId, notas: texto(entrada.notas), claveIdempotencia: clave,
        estadoPrevio: antes, revisionAplicada: org.revisionSuscripcion, solicitudHash: hash
    }], { session });
    org.ultimoPagoSuscripcion = pago._id;
    await org.save({ session });
    await auditar(org, usuarioId, 'Pago de suscripción registrado', antes, { pagoId: pago._id, ...snapshot(org) }, session);
    return { organizacion: org, pago, duplicado: false };
};

const registrarPago = (id, entrada, usuario, ahora) => ejecutarConOrganizacion(idValido(id), () => ejecutarEnTransaccion(async (session) =>
    registrarPagoEnTransaccion(await obtenerOrg(id, session), entrada, usuario, session, ahora)));

const cambiarSuscripcion = (id, entrada, usuario, ahora = new Date()) => ejecutarConOrganizacion(idValido(id), () => ejecutarEnTransaccion(async (session) => {
    dto(entrada, ['plan', 'especiePlan', 'estadoSuscripcion', 'fechaProximoVencimiento', 'diasPrueba', 'diasGracia', 'notasFacturacion', 'revision']);
    const org = await obtenerOrg(id, session), antes = snapshot(org);
    if (entrada.revision !== undefined && Number(entrada.revision) !== Number(org.revisionSuscripcion || 0)) throw error('La suscripción cambió. Actualiza antes de guardar.', 409);
    const codigo = entrada.plan || org.plan.codigo;
    org.plan.especiePlan = await validarPlanDestino(org, codigo, entrada.especiePlan, session);
    org.plan.codigo = codigo;
    if (entrada.diasGracia !== undefined) org.diasGracia = entero(entrada.diasGracia, 5, 0, 60);
    if (entrada.notasFacturacion !== undefined) org.notasFacturacion = texto(entrada.notasFacturacion);
    const estado = entrada.estadoSuscripcion;
    if (estado && !['ACTIVA', 'PRUEBA', 'SUSPENDIDA', 'CANCELADA'].includes(estado)) throw error('Estado manual no válido.');
    let fin = entrada.fechaProximoVencimiento ? fechaValida(entrada.fechaProximoVencimiento, org.zonaHoraria) : org.fechaProximoVencimiento;
    if (entrada.diasPrueba !== undefined) fin = new Date(Math.max(+ahora, +fin || 0) + entero(entrada.diasPrueba, 15, 1, 365) * DIA);
    if (!fin) throw error('Configura una fecha de vencimiento para esta cuenta manual.');
    if (['ACTIVA', 'PRUEBA'].includes(estado) && fin <= ahora) throw error('Para reactivar la suscripción indica un vencimiento futuro.');
    const esPrueba = estado === 'PRUEBA' || (!estado && org.plan.estado === 'Prueba');
    establecerPeriodo(org, org.fechaInicioPeriodoActual || ahora, fin, esPrueba ? 'Prueba' : 'Activo');
    if (['SUSPENDIDA', 'CANCELADA'].includes(estado)) {
        org.estadoSuscripcion = estado; org.plan.estado = estado === 'SUSPENDIDA' ? 'Suspendido' : 'Cancelado';
    } else if (!estado && ['SUSPENDIDA', 'CANCELADA'].includes(antes.estadoSuscripcion)) {
        org.estadoSuscripcion = antes.estadoSuscripcion; org.plan.estado = antes.plan.estado;
    }
    org.revisionSuscripcion = Number(org.revisionSuscripcion || 0) + 1;
    await org.save({ session });
    await auditar(org, usuario, 'Suscripción manual actualizada', antes, snapshot(org), session);
    return org;
}));

const anularPago = (id, pagoId, entrada, usuario) => ejecutarConOrganizacion(idValido(id), () => ejecutarEnTransaccion(async (session) => {
    dto(entrada, ['motivo']); const motivo = texto(entrada.motivo);
    if (!motivo) throw error('El motivo de anulación es obligatorio.');
    const org = await obtenerOrg(id, session);
    const pago = await Pago.findById(idValido(pagoId)).select('+estadoPrevio').session(session);
    if (!pago) throw error('Pago no encontrado en esta organización.', 404);
    if (pago.estado === 'ANULADO') return { pago, organizacion: org, duplicado: true };
    if (String(org.ultimoPagoSuscripcion) !== String(pago._id) || Number(org.revisionSuscripcion) !== pago.revisionAplicada) {
        throw error('Hay pagos o ajustes posteriores. Anúlalos en orden inverso antes de revertir este pago.', 409, 'SUBSCRIPTION_PAYMENT_HAS_SUCCESSORS');
    }
    const antes = snapshot(org);
    for (const [campo, valor] of Object.entries(pago.estadoPrevio)) org.set(campo, valor);
    // La revisión previa permite deshacer después el pago anterior, sin borrar el historial.
    pago.estado = 'ANULADO'; pago.motivoAnulacion = motivo; pago.fechaAnulacion = new Date(); pago.anuladoPor = usuario;
    pago.$locals.anularPago = true;
    await pago.save({ session }); await org.save({ session });
    await auditar(org, usuario, 'Pago de suscripción anulado', antes, { pagoId, motivo, ...snapshot(org) }, session);
    return { organizacion: org, pago, duplicado: false };
}));

const listarPagos = async (id, { pagina = 1, limite = 10 } = {}) => ejecutarConOrganizacion(idValido(id), async () => {
    const p = entero(pagina, 1, 1, 100000), n = entero(limite, 10, 1, 50);
    const total = await Pago.countDocuments({});
    const pagos = await Pago.find({}).sort({ fechaPago: -1, _id: -1 }).skip((p - 1) * n).limit(n).select('-claveIdempotencia -solicitudHash -estadoPrevio -revisionAplicada -__v').lean();
    return { pagos, total, pagina: p, limite: n, totalPaginas: Math.max(1, Math.ceil(total / n)) };
});

module.exports = { registrarPago, registrarPagoEnTransaccion, cambiarSuscripcion, anularPago, listarPagos,
    auditar, snapshot, dto, entero, error, fechaValida, validarPlanDestino };
