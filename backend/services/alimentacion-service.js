const Alimento = require('../models/Alimento');
const Racion = require('../models/Racion');
const AsignacionRacionLote = require('../models/AsignacionRacionLote');
const SuministroAlimentacion = require('../models/SuministroAlimentacion');
const AsignacionPlanAlimentacion = require('../models/AsignacionPlanAlimentacion');
const PertenenciaLote = require('../models/PertenenciaLote');
const Lote = require('../models/Lote');
const CorteForraje = require('../models/CorteForraje');
const EventoLote = require('../models/EventoLote');
const PlanAlimentacion = require('../models/PlanAlimentacion');
const { normalizarPropositoLote } = require('../config/lotes');
const { obtenerFincaActual, obtenerOrganizacionActual } = require('../context/organizacion-context');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');
const { claveDiaEnZona } = require('./fechaZonaHoraria-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');

const ALIMENTOS_INICIALES = [
    ['Cuba OM-22', 'FORRAJE'], ['King Grass', 'FORRAJE'], ['Maralfalfa', 'FORRAJE'], ['Caña de azúcar', 'FORRAJE'],
    ['Cratylia', 'FORRAJE'], ['Maíz', 'GRANO'], ['Sorgo', 'GRANO'], ['Melaza', 'SUBPRODUCTO'],
    ['Harina de coquito', 'SUBPRODUCTO'], ['Concentrado bovino', 'CONCENTRADO'],
    ['Concentrado porcino desarrollo', 'CONCENTRADO'], ['Concentrado porcino engorde', 'CONCENTRADO'], ['Sal mineral', 'MINERAL']
];
const crearError = (mensaje, status = 400, codigo) => Object.assign(new Error(mensaje), { status, codigo });
const redondear = (valor, decimales = 3) => Number(Number(valor).toFixed(decimales));

const inicializarCatalogo = async () => {
    const organizacionId = obtenerOrganizacionActual();
    const fincaId = obtenerFincaActual();
    if (!organizacionId || !fincaId) throw crearError('No se pudo determinar la finca activa.', 400, 'CONTEXTO_FINCA_REQUERIDO');
    const operaciones = ALIMENTOS_INICIALES.map(([nombre, tipo]) => ({
        updateOne: {
            filter: { organizacionId, fincaId, nombreNormalizado: nombre.toLocaleLowerCase('es') },
            update: { $setOnInsert: { organizacionId, fincaId, nombre, nombreNormalizado: nombre.toLocaleLowerCase('es'), tipo, activo: true } },
            upsert: true
        }
    }));
    try {
        await Alimento.bulkWrite(operaciones, { ordered: false });
    } catch (error) {
        if (error?.code !== 11000) throw error;
        try {
            await Alimento.bulkWrite(operaciones, { ordered: false });
        } catch (reintento) {
            if (reintento?.code !== 11000) throw reintento;
        }
    }
};

const crearAlimento = (datos, usuarioId) => Alimento.create({ ...datos, creadoPor: usuarioId });

const actualizarAlimento = async (id, datos) => {
    const alimento = await Alimento.findById(id);
    if (!alimento) throw crearError('Alimento no encontrado.', 404);
    if (datos.presentaciones) {
        const idsRecibidos = new Set(datos.presentaciones.map((item) => String(item._id || '')).filter(Boolean));
        const historicasOmitidas = alimento.presentaciones
            .filter((item) => !idsRecibidos.has(String(item._id)))
            .map((item) => ({ ...item.toObject(), activo: false }));
        alimento.presentaciones = [...datos.presentaciones, ...historicasOmitidas];
    }
    ['nombre', 'tipo', 'catalogoPasto', 'descripcion', 'activo', 'metadataNutricional'].forEach((campo) => {
        if (datos[campo] !== undefined) alimento[campo] = datos[campo];
    });
    return alimento.save();
};

const validarDetallesRacion = async (detalles = [], datosRacion = {}) => {
    if (!detalles.length) throw crearError('La ración debe incluir al menos un alimento.');
    const ids = [...new Set(detalles.map((item) => String(item.alimento)))];
    const alimentos = await Alimento.find({ _id: { $in: ids }, activo: true });
    if (alimentos.length !== ids.length) throw crearError('Uno o más alimentos no existen o están inactivos.');
    detalles.forEach((detalle) => {
        if (detalle.baseCalculo !== 'LIBRE_ACCESO' && (!Number.isFinite(Number(detalle.cantidad)) || Number(detalle.cantidad) <= 0)) throw crearError('Cada componente planificado requiere una cantidad mayor a cero.');
        const alimento = alimentos.find((item) => String(item._id) === String(detalle.alimento));
        const presentacion = detalle.presentacion ? alimento?.presentaciones.id(detalle.presentacion) : null;
        if (detalle.presentacion && (!presentacion || !presentacion.activo)) throw crearError(`La presentación de ${alimento?.nombre || 'un alimento'} no existe o está inactiva.`);
        if (presentacion && presentacion.unidad !== detalle.unidad) throw crearError(`La presentación seleccionada corresponde a ${presentacion.unidad}, no a ${detalle.unidad}.`);
        if (!['KG', 'TONELADA'].includes(detalle.unidad) && !presentacion && detalle.baseCalculo !== 'LIBRE_ACCESO') {
            throw crearError(`La unidad ${detalle.unidad} requiere una presentación válida.`);
        }
    });
    if (datosRacion.planAlimentacion) {
        const plan = await PlanAlimentacion.findById(datosRacion.planAlimentacion);
        if (!plan) throw crearError('El plan de alimentación relacionado no existe.', 404);
        if (!plan.activo) throw crearError('El plan de alimentación relacionado está inactivo.', 409);
        if (datosRacion.especie && plan.especie !== datosRacion.especie) throw crearError('La especie de la ración no coincide con su plan.', 409);
        if (datosRacion.proposito && plan.proposito !== datosRacion.proposito) throw crearError('El propósito de la ración no coincide con su plan.', 409);
    }
};

const crearRacion = async (datos, usuarioId) => {
    await validarDetallesRacion(datos.detalles, datos);
    return Racion.create({ ...datos, proposito: normalizarPropositoLote(datos.proposito) || datos.proposito, creadoPor: usuarioId });
};

const actualizarRacion = async (id, datos) => {
    if (datos.proposito) datos.proposito = normalizarPropositoLote(datos.proposito) || datos.proposito;
    const racion = await Racion.findById(id);
    if (!racion) throw crearError('Ración no encontrada.', 404);
    if (datos.detalles || datos.planAlimentacion || datos.especie || datos.proposito) await validarDetallesRacion(datos.detalles || racion.detalles, {
        especie: datos.especie || racion.especie,
        proposito: datos.proposito || racion.proposito,
        planAlimentacion: datos.planAlimentacion === undefined ? racion.planAlimentacion : datos.planAlimentacion
    });
    const cambiaCompatibilidad = (datos.especie && datos.especie !== racion.especie) || (datos.proposito && datos.proposito !== racion.proposito);
    if (cambiaCompatibilidad && await AsignacionRacionLote.exists({ racion: id, activo: true })) throw crearError('No se puede cambiar especie o propósito mientras la ración esté asignada.', 409);
    ['nombre', 'descripcion', 'especie', 'proposito', 'etapa', 'planAlimentacion', 'detalles', 'activo', 'observaciones'].forEach((campo) => {
        if (datos[campo] !== undefined) racion[campo] = datos[campo];
    });
    return racion.save();
};

const validarCompatibilidadRacionLote = (racion, lote) => {
    if (!racion.activo) throw crearError('La ración está inactiva.', 409);
    if (lote.estado !== 'ACTIVO') throw crearError('El lote no está activo.', 409);
    if (racion.especie !== lote.especie) throw crearError('La especie de la ración no coincide con el lote.', 409, 'ESPECIE_INCOMPATIBLE');
    if (racion.proposito !== lote.proposito) throw crearError('El propósito de la ración no coincide con el lote.', 409, 'PROPOSITO_INCOMPATIBLE');
};

const asignarRacionLote = async (loteId, datos, usuarioId, opciones = {}) => {
    if (!opciones.session) {
        return ejecutarEnTransaccion((session) => asignarRacionLote(loteId, datos, usuarioId, { session }));
    }
    const { session } = opciones;
    const [lote, racion] = await Promise.all([
        Lote.findById(loteId).session(session),
        Racion.findById(datos.racion).session(session)
    ]);
    if (!lote || !racion) throw crearError('Lote o ración no encontrado.', 404);
    validarCompatibilidadRacionLote(racion, lote);
    const fechaInicio = new Date(datos.fechaInicio || Date.now());
    if (Number.isNaN(fechaInicio.getTime())) throw crearError('La fecha inicial de la asignación no es válida.');
    if (lote.fechaInicio && fechaInicio < new Date(lote.fechaInicio)) throw crearError('La ración no puede iniciar antes que el lote.', 400, 'FECHA_ASIGNACION_INVALIDA');
    const anterior = await AsignacionRacionLote.findOne({ lote: loteId, activo: true }).session(session);
    if (anterior && String(anterior.racion) === String(racion._id)) return anterior;
    if (anterior && fechaInicio < new Date(anterior.fechaInicio)) throw crearError('La nueva ración no puede iniciar antes que la asignación vigente.', 400, 'FECHA_ASIGNACION_INVALIDA');
    if (anterior) { anterior.activo = false; anterior.fechaFin = fechaInicio; await anterior.save({ session }); }
    const [asignacion] = await AsignacionRacionLote.create([{ lote: loteId, racion: racion._id, fechaInicio, asignadoPor: usuarioId, observaciones: datos.observaciones }], { session, ordered: true });
    await EventoLote.create([{ lote: loteId, tipo: anterior ? 'RACION_CAMBIADA' : 'RACION_ASIGNADA', fecha: fechaInicio, titulo: anterior ? 'Ración cambiada' : 'Ración asignada', descripcion: racion.nombre, referenciaId: asignacion._id, entidadTipo: 'AsignacionRacionLote', registradoPor: usuarioId }], { session, ordered: true });
    return asignacion;
};

const obtenerRacionActual = (loteId, opciones = {}) => {
    const consulta = AsignacionRacionLote.findOne({ lote: loteId, activo: true })
        .populate({ path: 'racion', populate: [{ path: 'detalles.alimento' }, { path: 'planAlimentacion' }] });
    if (opciones.session) consulta.session(opciones.session);
    return consulta.lean();
};

const convertirAKg = ({ cantidad, unidad, presentacion, factorConversionKg }) => {
    const valor = Number(cantidad);
    if (!Number.isFinite(valor) || valor <= 0) throw crearError('La cantidad ingresada debe ser mayor a cero.');
    if (unidad === 'KG') return { cantidadKg: valor, factor: 1, estimado: false };
    if (unidad === 'TONELADA') return { cantidadKg: valor * 1000, factor: 1000, estimado: false };
    const factor = Number(presentacion?.cantidadBaseKg || factorConversionKg);
    if (!Number.isFinite(factor) || factor <= 0) throw crearError(`La unidad ${unidad} necesita una presentación o factor de conversión a kg.`);
    return { cantidadKg: valor * factor, factor, estimado: Boolean(presentacion?.estimada) };
};

const conversionHistoricaSinCambios = (original, detalle = {}) => Boolean(
    original
    && Number(original.cantidadIngresada) === Number(detalle.cantidadIngresada)
    && original.unidadIngresada === detalle.unidadIngresada
    && String(original.presentacionId || '') === String(detalle.presentacionId || '')
    && (detalle.factorConversionKg === undefined || detalle.factorConversionKg === ''
        || Number(detalle.factorConversionKg) === Number(original.factorConversionKgSnapshot))
);

const prepararDetallesSuministro = async (detalles = [], opciones = {}) => {
    if (!detalles.length) throw crearError('Registra al menos un alimento suministrado.');
    const ids = [...new Set(detalles.map((item) => String(item.alimento)))];
    const consultaAlimentos = Alimento.find({ _id: { $in: ids } });
    if (opciones.session) consultaAlimentos.session(opciones.session);
    const alimentos = await consultaAlimentos;
    if (alimentos.length !== ids.length) throw crearError('Uno o más alimentos no existen.');
    const originales = new Map((opciones.detallesOriginales || []).map((item) => [String(item._id), item]));
    return Promise.all(detalles.map(async (detalle) => {
        const alimento = alimentos.find((item) => String(item._id) === String(detalle.alimento));
        if (!alimento.activo && !opciones.alimentosHistoricos?.has(String(alimento._id))) throw crearError(`${alimento.nombre} está inactivo y no admite nuevos suministros.`);
        const original = detalle._id ? originales.get(String(detalle._id)) : null;
        const conservarConversion = conversionHistoricaSinCambios(original, detalle);
        const presentacion = detalle.presentacionId ? alimento.presentaciones.id(detalle.presentacionId) : null;
        if (!conservarConversion && detalle.presentacionId && (!presentacion || !presentacion.activo)) throw crearError(`La presentación de ${alimento.nombre} no existe o está inactiva.`);
        if (!conservarConversion && presentacion && presentacion.unidad !== detalle.unidadIngresada) {
            throw crearError(`La presentación seleccionada corresponde a ${presentacion.unidad}, no a ${detalle.unidadIngresada}.`);
        }
        if (!conservarConversion && ['KG', 'TONELADA'].includes(detalle.unidadIngresada) && detalle.presentacionId) {
            throw crearError(`${detalle.unidadIngresada} no admite una presentación adicional.`);
        }
        const conversion = conservarConversion
            ? { cantidadKg: Number(original.cantidadKg), factor: Number(original.factorConversionKgSnapshot), estimado: original.tipoMedicion === 'ESTIMADA' }
            : convertirAKg({ cantidad: detalle.cantidadIngresada, unidad: detalle.unidadIngresada, presentacion, factorConversionKg: detalle.factorConversionKg });
        const sobrante = detalle.sobranteKg === '' || detalle.sobranteKg === undefined || detalle.sobranteKg === null ? null : Number(detalle.sobranteKg);
        if (sobrante !== null && (!Number.isFinite(sobrante) || sobrante < 0 || sobrante > conversion.cantidadKg)) throw crearError(`El sobrante de ${alimento.nombre} debe estar entre 0 y lo suministrado.`);
        if (detalle.origenTipo === 'CORTE_FORRAJE') {
            const consultaCorte = CorteForraje.findById(detalle.origenReferenciaId);
            if (opciones.session) consultaCorte.session(opciones.session);
            const corte = await consultaCorte;
            if (!corte) throw crearError('El corte de forraje seleccionado no existe.');
            if (alimento.tipo !== 'FORRAJE') throw crearError('Un corte de forraje solo puede asociarse a un alimento de tipo FORRAJE.');
            if (opciones.fechaHora && corte.fechaCorte > opciones.fechaHora) throw crearError('El corte de forraje no puede ser posterior al suministro.');
        }
        return {
            ...(original?._id ? { _id: original._id } : {}),
            alimento: alimento._id, alimentoNombreSnapshot: alimento.nombre,
            cantidadIngresada: Number(detalle.cantidadIngresada), unidadIngresada: detalle.unidadIngresada,
            presentacionId: conservarConversion ? original.presentacionId : (presentacion?._id || null),
            presentacionNombreSnapshot: conservarConversion ? original.presentacionNombreSnapshot : presentacion?.nombre,
            factorConversionKgSnapshot: conversion.factor, cantidadKg: redondear(conversion.cantidadKg),
            tipoMedicion: conservarConversion ? original.tipoMedicion : (conversion.estimado ? 'ESTIMADA' : detalle.tipoMedicion),
            sobranteKg: sobrante, origenTipo: detalle.origenTipo || null,
            origenReferenciaId: detalle.origenReferenciaId || null, observaciones: detalle.observaciones
        };
    }));
};

const construirTotales = (detalles, cantidadAnimales) => {
    if (!Number.isInteger(Number(cantidadAnimales)) || Number(cantidadAnimales) <= 0) throw crearError('La población del lote debe ser mayor a cero.');
    const total = detalles.reduce((suma, item) => suma + item.cantidadKg, 0);
    const consumoCompleto = detalles.every((item) => item.sobranteKg !== null && item.sobranteKg !== undefined);
    const consumo = consumoCompleto ? detalles.reduce((suma, item) => suma + item.cantidadKg - item.sobranteKg, 0) : null;
    return { totalKgSuministrados: redondear(total), totalConsumoEstimadoKg: consumo === null ? null : redondear(consumo), kgSuministradosPorCabeza: redondear(total / cantidadAnimales), consumoEstimadoPorCabeza: consumo === null ? null : redondear(consumo / cantidadAnimales) };
};

const validarFechaSuministro = (lote, valor, ahora = new Date()) => {
    const fechaHora = new Date(valor || ahora);
    if (Number.isNaN(fechaHora.getTime())) throw crearError('La fecha y hora del suministro no son válidas.');
    if (lote.fechaInicio && fechaHora < new Date(lote.fechaInicio)) throw crearError('La entrega no puede ser anterior al inicio del lote.', 400, 'FECHA_ANTERIOR_LOTE');
    if (fechaHora.getTime() > ahora.getTime() + 5 * 60 * 1000) throw crearError('La entrega no puede registrarse en una fecha futura.', 400, 'FECHA_FUTURA');
    return fechaHora;
};

const contarAnimalesLoteEnFecha = async (loteId, fechaHora, opciones = {}) => {
    const hoy = claveDiaEnZona(opciones.ahora || new Date(), opciones.zonaHoraria || 'America/Costa_Rica');
    const fechaEsHoy = claveDiaEnZona(fechaHora, opciones.zonaHoraria || 'America/Costa_Rica') === hoy;
    const filtro = fechaEsHoy
        ? { lote: loteId, activo: true }
        : { lote: loteId, fechaEntrada: { $lte: fechaHora }, $or: [{ fechaSalida: null }, { fechaSalida: { $gt: fechaHora } }] };
    const consulta = PertenenciaLote.countDocuments(filtro);
    if (opciones.session) consulta.session(opciones.session);
    return consulta;
};

const crearSuministro = async (datos, usuarioId, opciones = {}) => {
    if (!datos.claveIdempotencia || !String(datos.claveIdempotencia).trim()) {
        throw crearError('La operación requiere una clave de idempotencia.', 400, 'IDEMPOTENCIA_REQUERIDA');
    }
    if (!opciones.session) {
        try {
            return await ejecutarEnTransaccion((session) => crearSuministro(datos, usuarioId, { ...opciones, session }));
        } catch (error) {
            if (error?.code === 11000) {
                const existente = await SuministroAlimentacion.findOne({ claveIdempotencia: String(datos.claveIdempotencia).trim() });
                if (existente) return existente;
            }
            throw error;
        }
    }
    const { session } = opciones;
    const claveIdempotencia = String(datos.claveIdempotencia).trim();
    const existente = await SuministroAlimentacion.findOne({ claveIdempotencia }).session(session);
    if (existente) return existente;
    const responsableId = datos.responsable || usuarioId;
    await validarUsuarioAsignable(responsableId, 'Alimentacion');
    const lote = await Lote.findById(datos.lote).session(session);
    if (!lote) throw crearError('Lote no encontrado.', 404);
    if (lote.estado !== 'ACTIVO') throw crearError('No se puede alimentar un lote cerrado.', 409);
    const fechaHora = validarFechaSuministro(lote, datos.fechaHora, opciones.ahora || new Date());
    const cantidadAnimales = await contarAnimalesLoteEnFecha(lote._id, fechaHora, { ...opciones, session });
    if (!cantidadAnimales) throw crearError('No se puede registrar alimentación para un lote sin animales activos.', 409, 'LOTE_VACIO');
    const consultaPlan = AsignacionPlanAlimentacion.findOne({ lote: lote._id, activo: true }).populate('plan');
    consultaPlan.session(session);
    const [planAsignado, racionAsignada, detalles] = await Promise.all([
        consultaPlan.lean(),
        obtenerRacionActual(lote._id, { session }),
        prepararDetallesSuministro(datos.detalles, { session, fechaHora })
    ]);
    if (datos.racion && String(datos.racion) !== String(racionAsignada?.racion?._id || '')) throw crearError('La ración enviada no es la ración activa del lote.', 409);
    const totales = construirTotales(detalles, cantidadAnimales);
    const [suministro] = await SuministroAlimentacion.create([{
        claveIdempotencia, lote: lote._id, fechaHora,
        planAlimentacion: planAsignado?.plan?._id || null,
        planAlimentacionSnapshot: planAsignado?.plan ? { id: planAsignado.plan._id, nombre: planAsignado.plan.nombre, etapa: planAsignado.plan.etapa, tipoManejoAlimenticio: planAsignado.plan.tipoManejoAlimenticio } : null,
        racion: racionAsignada?.racion?._id || null,
        racionSnapshot: racionAsignada?.racion ? { id: racionAsignada.racion._id, nombre: racionAsignada.racion.nombre, etapa: racionAsignada.racion.etapa, detalles: racionAsignada.racion.detalles.map((item) => ({ alimento: item.alimento?._id, nombre: item.alimento?.nombre, cantidad: item.cantidad, unidad: item.unidad, baseCalculo: item.baseCalculo })) } : null,
        etapaOperativaSnapshot: lote.etapaOperativa, cantidadAnimalesSnapshot: cantidadAnimales,
        detalles, ...totales, responsable: responsableId, observaciones: datos.observaciones, registradoPor: usuarioId
    }], { session, ordered: true });
    await EventoLote.create([{ lote: lote._id, tipo: 'SUMINISTRO_ALIMENTACION', fecha: suministro.fechaHora, titulo: 'Alimentación registrada', descripcion: `${suministro.totalKgSuministrados} kg suministrados`, referenciaId: suministro._id, entidadTipo: 'SuministroAlimentacion', registradoPor: usuarioId, metadata: { cantidadAnimalesSnapshot: cantidadAnimales, totalKg: suministro.totalKgSuministrados } }], { session, ordered: true });
    return suministro;
};

const actualizarSuministro = async (id, datos, usuarioId, opciones = {}) => {
    if (!opciones.session) {
        return ejecutarEnTransaccion((session) => actualizarSuministro(id, datos, usuarioId, { ...opciones, session }));
    }
    const { session } = opciones;
    const suministro = await SuministroAlimentacion.findById(id).session(session);
    if (!suministro) throw crearError('Suministro no encontrado.', 404);
    if (!datos.motivoCorreccion?.trim()) throw crearError('Indica el motivo de la corrección.');
    const lote = await Lote.findById(suministro.lote).session(session);
    if (!lote) throw crearError('El lote histórico del suministro no existe.', 409);
    const fechaHora = datos.fechaHora ? validarFechaSuministro(lote, datos.fechaHora, opciones.ahora || new Date()) : suministro.fechaHora;
    const cambiaFecha = new Date(fechaHora).getTime() !== new Date(suministro.fechaHora).getTime();
    const cantidadAnimales = cambiaFecha
        ? await contarAnimalesLoteEnFecha(lote._id, fechaHora, { ...opciones, session })
        : suministro.cantidadAnimalesSnapshot;
    if (!cantidadAnimales) throw crearError('No había animales en el lote en la nueva fecha indicada.', 409, 'LOTE_VACIO_EN_FECHA');
    const alimentosHistoricos = new Set(suministro.detalles.map((item) => String(item.alimento)));
    const detalles = datos.detalles ? await prepararDetallesSuministro(datos.detalles, {
        alimentosHistoricos,
        detallesOriginales: suministro.detalles,
        fechaHora,
        session
    }) : suministro.detalles;
    const totales = construirTotales(detalles, cantidadAnimales);
    suministro.historialCorrecciones.push({
        usuario: usuarioId,
        motivo: datos.motivoCorreccion,
        valorAnterior: { fechaHora: suministro.fechaHora, detalles: suministro.detalles, observaciones: suministro.observaciones },
        valorNuevo: { fechaHora, detalles, observaciones: datos.observaciones ?? suministro.observaciones }
    });
    suministro.detalles = detalles; Object.assign(suministro, totales);
    suministro.fechaHora = fechaHora;
    suministro.cantidadAnimalesSnapshot = cantidadAnimales;
    if (datos.observaciones !== undefined) suministro.observaciones = datos.observaciones;
    suministro.actualizadoPor = usuarioId; suministro.motivoCorreccion = datos.motivoCorreccion;
    await suministro.save({ session });
    const evento = await EventoLote.findOne({ referenciaId: suministro._id, entidadTipo: 'SuministroAlimentacion' }).session(session);
    const datosEvento = {
        lote: suministro.lote,
        tipo: 'SUMINISTRO_ALIMENTACION',
        fecha: suministro.fechaHora,
        titulo: 'Alimentación registrada',
        descripcion: `${suministro.totalKgSuministrados} kg suministrados`,
        referenciaId: suministro._id,
        entidadTipo: 'SuministroAlimentacion',
        registradoPor: suministro.registradoPor,
        metadata: { cantidadAnimalesSnapshot: cantidadAnimales, totalKg: suministro.totalKgSuministrados, corregido: true }
    };
    if (evento) {
        Object.assign(evento, datosEvento);
        await evento.save({ session });
    } else {
        await EventoLote.create([datosEvento], { session, ordered: true });
    }
    return suministro;
};

module.exports = { inicializarCatalogo, crearAlimento, actualizarAlimento, crearRacion, actualizarRacion, asignarRacionLote, obtenerRacionActual, convertirAKg, conversionHistoricaSinCambios, prepararDetallesSuministro, construirTotales, contarAnimalesLoteEnFecha, crearSuministro, actualizarSuministro, validarCompatibilidadRacionLote, validarFechaSuministro };
