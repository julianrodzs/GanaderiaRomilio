const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { validarClavesMongo } = require('./reproduccion-dto-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');
const { validarRelacionGenealogica } = require('./genealogiaService');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');
const { upsertEventoAnimal } = require('./eventoAnimal-service');
const { prepararMetodoCiclo, validarMetodo, sumarDias, error } = require('./metodoReproductivo-service');
const { obtenerDuracionGestacionBovina } = require('./duracionGestacion-service');
const { obtenerFincaActual } = require('../context/organizacion-context');

const seleccionar = (datos, campos) => {
    validarClavesMongo(datos);
    const extra = Object.keys(datos).filter((k) => !campos.includes(k));
    if (extra.length) throw error(`Campos no permitidos: ${extra.join(', ')}`, 422);
    return { ...datos };
};
const fechaValida = (v, requerida = false) => {
    if (!v && !requerida) return null;
    if (!v || Number.isNaN(new Date(v).getTime())) throw error('Fecha invalida.');
    return new Date(v);
};
const validarAnimal = async (animalId, sexo, especie, session) => {
    if (!mongoose.isObjectIdOrHexString(animalId)) throw error('Identificador de animal invalido.');
    const animal = await Animal.findOne({ _id: animalId, sexo, especie }).session(session);
    if (!animal) throw error('El animal no existe en esta finca o no coincide con sexo y especie.');
    return animal;
};
const validarServicio = async (datos, r, usuarioId, session) => {
    const s = seleccionar(datos, ['metodo', 'submodalidad', 'fechaServicio', 'fechaServicioDesde', 'fechaServicioHasta', 'toroId', 'sementalExternoNombre', 'diioSemental', 'fichaSemenId', 'loteEmbrionId', 'monedaSemen', 'cantidadPajuelas', 'responsable', 'embrion', 'claveIdempotencia']);
    validarMetodo(s.metodo, r.especie);
    let loteEmbrion;
    if (s.loteEmbrionId) {
        if (s.metodo !== 'TRANSFERENCIA_EMBRIONES') throw error('Un embrion solo se utiliza en una transferencia.');
        if (!await require('./plan-service').tieneFeature('programaTransferencia')) throw Object.assign(error('El banco de embriones requiere Pro.', 403), { code: 'PLAN_UPGRADE_REQUIRED' });
        loteEmbrion = await require('./bancoEmbriones-service').buscarLote(s.loteEmbrionId, session);
        const oficiales = require('./programaTE-service').datosServicioLote(loteEmbrion, r.animal, s.fechaServicio);
        Object.assign(s, { toroId: oficiales.toroId, sementalExternoNombre: oficiales.sementalExternoNombre, diioSemental: oficiales.diioSemental, embrion: oficiales.embrion });
    }
    if (s.metodo === 'DESCONOCIDO') throw error('Una gestacion sin servicio se registra sin crear un servicio ficticio.');
    s.fechaServicio = fechaValida(s.fechaServicio);
    s.fechaServicioDesde = fechaValida(s.fechaServicioDesde);
    s.fechaServicioHasta = fechaValida(s.fechaServicioHasta);
    if (s.fechaServicio && (s.fechaServicioDesde || s.fechaServicioHasta)) throw error('Seleccione fecha exacta o rango, no ambos.');
    if (Boolean(s.fechaServicioDesde) !== Boolean(s.fechaServicioHasta) || s.fechaServicioDesde > s.fechaServicioHasta) throw error('El rango de servicio debe estar completo y ordenado.');
    if (s.metodo !== 'MONTA_NATURAL' && !s.fechaServicio) throw error('Este metodo requiere fecha exacta de servicio.');
    if (s.metodo === 'MONTA_NATURAL') {
        s.submodalidad ||= 'CONTROLADA';
        if (!['CONTROLADA', 'LIBRE'].includes(s.submodalidad)) throw error('Submodalidad de monta invalida.');
    } else if (s.submodalidad || s.fechaServicioDesde) throw error('El rango y la submodalidad solo corresponden a monta natural.');
    s.responsable ||= r.asignadoA || usuarioId;
    await validarUsuarioAsignable(s.responsable, 'Reproduccion');
    if (s.toroId) await validarAnimal(s.toroId, 'Macho', r.especie, session);
    if (s.toroId && s.sementalExternoNombre) throw error('Seleccione semental interno o externo.');
    if (s.fichaSemenId) {
        if (!['IATF', 'IA_CONVENCIONAL', 'TRANSFERENCIA_EMBRIONES'].includes(s.metodo)) throw error('Una monta natural no consume semen del banco.');
        const { tieneFeature } = require('./plan-service');
        if (!await tieneFeature('iatfReproductivo')) throw error('El banco de semen requiere plan Pro.', 403);
        const { consumirSemen } = require('./semen-reproductivo-service');
        // El registro basico de TE no consume semen: el embrion ya esta producido.
        if (s.metodo !== 'TRANSFERENCIA_EMBRIONES') {
            const consumo = await consumirSemen({ semenId: s.fichaSemenId, cantidad: s.cantidadPajuelas ?? 1, moneda: s.monedaSemen, fechaInseminacion: s.fechaServicio, especie: r.especie, usuarioId, session });
            s.toroId = consumo.snapshot.toroId;
            s.diioSemental = consumo.snapshot.codigoToro;
            s.sementalExternoNombre = consumo.snapshot.esExterno ? consumo.snapshot.toro : undefined;
            if (consumo.bancoSemen) r.bancoSemenId = consumo.insumo._id;
            else { r.semenUtilizado = consumo.insumo._id; s.insumoLegadoId = consumo.insumo._id; delete s.fichaSemenId; }
            r.semenSnapshot = consumo.snapshot;
            s.semenSnapshot = consumo.snapshot;
            s.cantidadPajuelas = consumo.cantidad;
            r.cantidadPajuelas = consumo.cantidad;
        } else {
            const { BancoSemen } = require('../models/BancoSemen');
            const ficha = await BancoSemen.findOne({ _id: s.fichaSemenId, especie: 'Bovino' }).session(session);
            if (!ficha) throw error('Ficha de semen no encontrada.');
            s.toroId = ficha.toroId; s.diioSemental = ficha.diio;
            s.sementalExternoNombre = ficha.esExterno ? ficha.nombreSemental : undefined;
        }
    }
    if (s.metodo === 'TRANSFERENCIA_EMBRIONES') {
        const e = seleccionar(s.embrion || {}, ['donanteId', 'donanteExternaNombre', 'donanteDiio', 'donanteRegistro', 'donanteRaza', 'origenEmbrion', 'estadoEmbrion', 'edadDias', 'grado', 'estadio', 'codigoEmbrion', 'proveedor', 'costo', 'moneda']);
        if (!e.donanteId && !String(e.donanteExternaNombre || '').trim()) throw error('La transferencia requiere donante interna o externa.');
        if (e.donanteId && e.donanteExternaNombre) throw error('Seleccione donante interna o externa.');
        if (e.donanteId) {
            await validarAnimal(e.donanteId, 'Hembra', 'Bovino', session);
            if (String(e.donanteId) === String(r.animal?._id || r.animal)) throw error('Donante y receptora deben ser distintas.');
        }
        if (!['IN_VIVO', 'FIV'].includes(e.origenEmbrion) || !['FRESCO', 'CONGELADO', 'VITRIFICADO'].includes(e.estadoEmbrion)) throw error('Origen o estado del embrion invalido.');
        if (e.costo != null && (!Number.isFinite(Number(e.costo)) || Number(e.costo) < 0 || !['CRC', 'USD'].includes(e.moneda))) throw error('Costo o moneda del embrion invalido.');
        await validarRelacionGenealogica(null, s.toroId, e.donanteId, 'Bovino', { session });
        s.embrion = { ...e, receptoraId: r.animal?._id || r.animal };
    } else if (s.embrion) throw error('Solo una transferencia puede incluir datos de embrion.');
    if (loteEmbrion) {
        const banco = require('./bancoEmbriones-service');
        await banco.cambiarSaldo(loteEmbrion, 'REPRODUCTIVO', 'TRANSFERIDO', 1, session);
        s.embrion.loteEmbrionId = loteEmbrion._id;
        s.embrion.costosUnitarios = loteEmbrion.costosUnitarios.toObject();
        await banco.registrarMovimiento({ loteId: loteEmbrion._id, tipo: 'TRANSFERENCIA_RECEPTORA', origen: 'REPRODUCTIVO', destino: 'TRANSFERIDO', cantidad: 1, registroId: r._id, usuarioId, claveIdempotencia: `puntual:${r._id}:${r.servicios.length}` }, session);
    }
    return s;
};

const registrarEventosMetodo = async (r, usuarioId, session) => {
    const animal = r.animal?._id || r.animal;
    const evento = (clave, tipoEvento, fecha, titulo, metadata) => upsertEventoAnimal({ animal, tipoEvento, fecha: fecha || r.createdAt || new Date(), titulo, descripcion: titulo,
        moduloOrigen: 'Reproduccion', referenciaId: r._id, creadoPor: usuarioId,
        claveIdempotencia: `reproduccion:${r._id}:${clave}`, metadata: { metodo: r.metodo, estadoAtribucion: r.estadoAtribucion, ...metadata }
    }, { session });
    for (const s of r.servicios || []) {
        const nombre = require('./metodoReproductivo-service').catalogo[s.metodo].nombre;
        await evento(`servicio:${s._id}`, 'Monta', s.fechaServicio || s.fechaServicioDesde, `${nombre}${!s.fechaServicio ? ' · Fecha de servicio desconocida o en rango' : ''}`, { servicio: s.toObject ? s.toObject() : s });
        if (s.embrion?.donanteId) await upsertEventoAnimal({
            animal: s.embrion.donanteId, tipoEvento: 'Observacion', fecha: s.fechaServicio, titulo: 'Transferencia de embrion de donante',
            descripcion: 'Progenie genetica en receptora; no representa un parto de la donante.', moduloOrigen: 'Reproduccion', referenciaId: r._id,
            claveIdempotencia: `reproduccion:${r._id}:donante:${s._id}`, creadoPor: usuarioId, metadata: { receptoraId: animal, servicioId: s._id, metodo: s.metodo }
        }, { session });
    }
    for (const d of r.historialDiagnosticos || []) await evento(`diagnostico:${d._id}`, 'Diagnostico de gestacion', d.fecha, `Diagnostico: ${d.resultado}`, { diagnostico: d.toObject ? d.toObject() : d });
    if (r.resultado?.tipo) await evento('resultado', r.resultado.tipo === 'PARTO' ? 'Parto' : 'Observacion', r.resultado.fecha, `Resultado: ${r.resultado.tipo}`, { resultado: r.resultado.toObject ? r.resultado.toObject() : r.resultado });
};
const aplicarDiagnostico = (r, entrada, usuarioId) => {
    const d = seleccionar(entrada, ['fecha', 'resultado', 'metodo', 'diasGestacionEstimados', 'fechaProbableParto', 'observaciones', 'claveIdempotencia']);
    if (!['PENDIENTE', 'PRENADA', 'PREÑADA', 'VACIA', 'DUDOSA'].includes(d.resultado)) throw error('Resultado diagnostico invalido.');
    if (d.claveIdempotencia && r.historialDiagnosticos.some((h) => h.claveIdempotencia === d.claveIdempotencia)) { r.$locals.repetida = true; return; }
    d.fecha = fechaValida(d.fecha, true);
    d.resultado = d.resultado === 'PRENADA' ? 'PREÑADA' : d.resultado;
    if (!['PALPACION', 'ECOGRAFIA', 'LABORATORIO', 'OTRO'].includes(d.metodo)) throw error('Indique el metodo del diagnostico.');
    if (d.diasGestacionEstimados != null && (!Number.isFinite(Number(d.diasGestacionEstimados)) || Number(d.diasGestacionEstimados) < 0 || Number(d.diasGestacionEstimados) > r.diasGestacionReferencia)) throw error('Dias de gestacion estimados invalidos.');
    d.fechaProbableParto = fechaValida(d.fechaProbableParto) || (d.diasGestacionEstimados != null ? sumarDias(d.fecha, r.diasGestacionReferencia - Number(d.diasGestacionEstimados)) : null);
    r.historialDiagnosticos.push({ ...d, registradoPor: usuarioId });
    r.resultadoDiagnosticoGestacion = d.resultado === 'PENDIENTE' ? undefined : d.resultado;
    r.fechaUltimoDiagnosticoGestacion = d.fecha;
    r.gestacionConfirmada = d.resultado === 'PREÑADA';
    if (r.gestacionConfirmada && d.fechaProbableParto) r.fechaPartoEstimada = d.fechaProbableParto;
};
const aplicarResultado = (r, entrada) => {
    const v = seleccionar(entrada, ['tipo', 'fecha', 'observaciones']);
    if (!['PARTO', 'PERDIDA_GESTACIONAL', 'ABORTO', 'REABSORCION', 'OTRO'].includes(v.tipo)) throw error('Resultado reproductivo invalido.');
    v.fecha = fechaValida(v.fecha, true);
    if (r.resultado?.tipo) {
        if (r.resultado.tipo !== v.tipo || +r.resultado.fecha !== +v.fecha) throw error('El resultado ya registrado requiere una correccion trazable.', 409);
        r.$locals.repetida = true; return;
    }
    r.resultado = v;
    if (v.tipo === 'PARTO') r.fechaPartoReal = v.fecha;
    else if (['PERDIDA_GESTACIONAL', 'ABORTO', 'REABSORCION'].includes(v.tipo)) { r.estadoCiclo = 'Cancelado'; r.gestacionConfirmada = false; r.fechaPartoEstimada = undefined; }
};
const agregarServicio = async (r, datos, usuarioId, session) => {
    if (datos.claveIdempotencia && r.servicios.some((s) => s.claveIdempotencia === datos.claveIdempotencia)) { r.$locals.repetida = true; return; }
    const s = await validarServicio(datos, r, usuarioId, session);
    r.servicios.push(s);
    r.atribucionConfirmadaPorUsuario = false;
    if (r.servicios.length === 1) {
        r.metodo = s.metodo;
        r.tipoRegistro = s.metodo === 'MONTA_NATURAL' ? 'Monta' : 'Inseminación/Monta';
        // La compatibilidad historica solo conserva fechas reales, nunca inventa una monta.
        if (s.metodo !== 'TRANSFERENCIA_EMBRIONES') r.fechaMonta = s.fechaServicio;
        if (!r.fechaPartoEstimada && s.fechaServicio) r.fechaPartoEstimada = sumarDias(s.fechaServicio, r.diasGestacionReferencia - (s.embrion?.edadDias ?? (s.metodo === 'TRANSFERENCIA_EMBRIONES' ? 7 : 0)));
    }
};
const crearUnificado = async ({ datos, animal, usuarioId }) => ejecutarEnTransaccion(async (session) => {
    const { crearNuevoCicloReproductivo } = require('./reproduccion-service');
    if (datos.claveIdempotencia !== undefined) {
        if (typeof datos.claveIdempotencia !== 'string' || !datos.claveIdempotencia.trim() || datos.claveIdempotencia.length > 120) throw error('Clave idempotente invalida.');
        const existente = await RegistroReproductivo.findOne({ claveRegistro: datos.claveIdempotencia }).session(session);
        if (existente) {
            if (String(existente.animal) !== String(animal._id)) throw error('La clave ya pertenece a otro animal.', 409);
            existente.$locals.repetida = true;
            return existente;
        }
    }
    const finca = await require('../models/Finca').findById(obtenerFincaActual()).session(session);
    const inicial = { animal: animal._id, especie: animal.especie, asignadoA: datos.asignadoA, metodo: 'DESCONOCIDO', observaciones: datos.observaciones,
        diasGestacionReferencia: animal.especie === 'Bovino' ? await obtenerDuracionGestacionBovina({ fincaId: obtenerFincaActual(), session }) : finca?.configuracionReproductiva?.diasGestacionPorcinaGeneral || 114,
        toleranciaAtribucionDias: finca?.configuracionReproductiva?.toleranciaAtribucionDias ?? 21 };
    const r = new RegistroReproductivo({ ...inicial, claveRegistro: datos.claveIdempotencia });
    if (datos.servicio) await agregarServicio(r, datos.servicio, usuarioId, session);
    else if (datos.metodo !== 'DESCONOCIDO') throw error('Faltan los datos del servicio.');
    if (datos.diagnostico) aplicarDiagnostico(r, datos.diagnostico, usuarioId);
    if (datos.resultado) aplicarResultado(r, datos.resultado);
    if (!r.servicios.length && !datos.diagnostico && !datos.resultado) throw error('La gestacion sin servicio requiere diagnostico o resultado.');
    if (datos.cerrarCicloAnterior === true) {
        const { obtenerCicloActivoPorAnimal } = require('./reproduccion-service');
        const anterior = await obtenerCicloActivoPorAnimal(animal._id, null, session);
        if (anterior) {
            anterior.estadoCiclo = 'Cerrado'; anterior.fechaCierre = new Date(); anterior.motivoCierre = 'Cerrado al registrar un nuevo ciclo';
            await anterior.save({ session });
            if (!(anterior.especie === 'Bovino' && anterior.fechaPartoReal)) await require('../models/Tarea').Tarea.updateMany({ referenciaId: anterior._id, moduloOrigen: 'Reproduccion', creadoAutomaticamente: true, estado: { $in: ['Pendiente', 'En proceso'] } }, { $set: { estado: 'Cancelada', cancelacionAutomaticaOrigen: 'CIERRE_CICLO_REPRODUCTIVO', observaciones: anterior.motivoCierre } }, { session });
            await upsertEventoAnimal({ animal: animal._id, tipoEvento: 'Observacion', fecha: anterior.fechaCierre, titulo: 'Ciclo reproductivo cerrado', descripcion: anterior.motivoCierre, moduloOrigen: 'Reproduccion', referenciaId: anterior._id, creadoPor: usuarioId, claveIdempotencia: `reproduccion:${anterior._id}:cierre-nuevo` }, { session });
        }
    }
    const guardado = await crearNuevoCicloReproductivo({ data: r.toObject(), animal, usuarioId, session });
    if (['PERDIDA_GESTACIONAL', 'ABORTO', 'REABSORCION'].includes(r.resultado?.tipo)) guardado.estadoCiclo = 'Cancelado';
    prepararMetodoCiclo(guardado); await guardado.save({ session });
    await registrarEventosMetodo(guardado, usuarioId, session);
    return guardado;
});
const operarCiclo = (id, accion, datos, usuarioId, sesionExistente = null) => {
  const operacion = async (session) => {
    const r = await RegistroReproductivo.findById(id).session(session);
    if (!r) throw error('Registro reproductivo no encontrado.', 404);
    prepararMetodoCiclo(r);
    if (accion === 'servicios') {
        if (r.estadoCiclo !== 'Activo' || r.fechaPartoReal) throw error('El ciclo ya no admite servicios.', 409);
        await agregarServicio(r, datos, usuarioId, session);
    } else if (accion === 'diagnosticos') {
        if (r.estadoCiclo !== 'Activo' || r.resultado?.tipo) throw error('El ciclo ya tiene resultado o esta cerrado.', 409);
        aplicarDiagnostico(r, datos, usuarioId);
    } else if (accion === 'resultado') aplicarResultado(r, datos);
    else if (accion === 'atribucion') {
        seleccionar(datos, ['servicioId']);
        const s = r.servicios.find((v) => String(v._id) === datos.servicioId);
        if (!s || !r.serviciosCandidatos.some((v) => String(v) === datos.servicioId)) throw error('Seleccione un servicio candidato compatible.');
        r.servicioAtribuidoId = s._id; r.atribucionConfirmadaPorUsuario = true;
    }
    if (r.$locals.repetida) return r;
    await r.save({ session });
    if (r.campanaIATF) {
        const Campana = require('../models/CampanaIATF');
        await Campana.updateOne({ _id: r.campanaIATF, 'participantes.registroReproductivo': r._id }, { $set: {
            'participantes.$.estadoAtribucion': r.estadoAtribucion,
            'participantes.$.metodoGestacion': r.metodo
        } }, { session });
    }
    await registrarEventosMetodo(r, usuarioId, session);
    return r;
  };
  return sesionExistente ? operacion(sesionExistente) : ejecutarEnTransaccion(operacion);
};
module.exports = { crearUnificado, operarCiclo, validarServicio, aplicarDiagnostico, aplicarResultado, registrarEventosMetodo, seleccionar };
