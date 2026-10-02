const Alimento = require('../models/Alimento');
const Racion = require('../models/Racion');
const AsignacionRacionLote = require('../models/AsignacionRacionLote');
const SuministroAlimentacion = require('../models/SuministroAlimentacion');
const AsignacionPlanAlimentacion = require('../models/AsignacionPlanAlimentacion');
const PertenenciaLote = require('../models/PertenenciaLote');
const Lote = require('../models/Lote');
const CorteForraje = require('../models/CorteForraje');
const EventoLote = require('../models/EventoLote');
const { normalizarPropositoLote } = require('../config/lotes');

const ALIMENTOS_INICIALES = [
    ['Cuba OM-22', 'FORRAJE'], ['King Grass', 'FORRAJE'], ['Maralfalfa', 'FORRAJE'], ['Caña de azúcar', 'FORRAJE'],
    ['Cratylia', 'FORRAJE'], ['Maíz', 'GRANO'], ['Sorgo', 'GRANO'], ['Melaza', 'SUBPRODUCTO'],
    ['Harina de coquito', 'SUBPRODUCTO'], ['Concentrado bovino', 'CONCENTRADO'],
    ['Concentrado porcino desarrollo', 'CONCENTRADO'], ['Concentrado porcino engorde', 'CONCENTRADO'], ['Sal mineral', 'MINERAL']
];
const crearError = (mensaje, status = 400, codigo) => Object.assign(new Error(mensaje), { status, codigo });
const redondear = (valor, decimales = 3) => Number(Number(valor).toFixed(decimales));

const inicializarCatalogo = async () => {
    const existe = await Alimento.exists({});
    if (existe) return;
    await Alimento.insertMany(ALIMENTOS_INICIALES.map(([nombre, tipo]) => ({ nombre, nombreNormalizado: nombre.toLocaleLowerCase('es'), tipo })));
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

const validarDetallesRacion = async (detalles = []) => {
    if (!detalles.length) throw crearError('La ración debe incluir al menos un alimento.');
    const ids = [...new Set(detalles.map((item) => String(item.alimento)))];
    const alimentos = await Alimento.find({ _id: { $in: ids }, activo: true });
    if (alimentos.length !== ids.length) throw crearError('Uno o más alimentos no existen o están inactivos.');
    detalles.forEach((detalle) => {
        if (detalle.baseCalculo !== 'LIBRE_ACCESO' && (!Number.isFinite(Number(detalle.cantidad)) || Number(detalle.cantidad) < 0)) throw crearError('Cada componente planificado requiere una cantidad válida.');
    });
};

const crearRacion = async (datos, usuarioId) => {
    await validarDetallesRacion(datos.detalles);
    return Racion.create({ ...datos, proposito: normalizarPropositoLote(datos.proposito) || datos.proposito, creadoPor: usuarioId });
};

const actualizarRacion = async (id, datos) => {
    if (datos.proposito) datos.proposito = normalizarPropositoLote(datos.proposito) || datos.proposito;
    const racion = await Racion.findById(id);
    if (!racion) throw crearError('Ración no encontrada.', 404);
    if (datos.detalles) await validarDetallesRacion(datos.detalles);
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

const asignarRacionLote = async (loteId, datos, usuarioId) => {
    const [lote, racion] = await Promise.all([Lote.findById(loteId), Racion.findById(datos.racion)]);
    if (!lote || !racion) throw crearError('Lote o ración no encontrado.', 404);
    validarCompatibilidadRacionLote(racion, lote);
    const fechaInicio = datos.fechaInicio || new Date();
    const anterior = await AsignacionRacionLote.findOne({ lote: loteId, activo: true });
    if (anterior && String(anterior.racion) === String(racion._id)) return anterior;
    if (anterior) { anterior.activo = false; anterior.fechaFin = fechaInicio; await anterior.save(); }
    const asignacion = await AsignacionRacionLote.create({ lote: loteId, racion: racion._id, fechaInicio, asignadoPor: usuarioId, observaciones: datos.observaciones });
    await EventoLote.create({ lote: loteId, tipo: anterior ? 'RACION_CAMBIADA' : 'RACION_ASIGNADA', fecha: fechaInicio, titulo: anterior ? 'Ración cambiada' : 'Ración asignada', descripcion: racion.nombre, referenciaId: asignacion._id, entidadTipo: 'AsignacionRacionLote', registradoPor: usuarioId });
    return asignacion;
};

const obtenerRacionActual = (loteId) => AsignacionRacionLote.findOne({ lote: loteId, activo: true }).populate({ path: 'racion', populate: [{ path: 'detalles.alimento' }, { path: 'planAlimentacion' }] }).lean();

const convertirAKg = ({ cantidad, unidad, presentacion, factorConversionKg }) => {
    const valor = Number(cantidad);
    if (!Number.isFinite(valor) || valor < 0) throw crearError('La cantidad ingresada debe ser cero o mayor.');
    if (unidad === 'KG') return { cantidadKg: valor, factor: 1, estimado: false };
    if (unidad === 'TONELADA') return { cantidadKg: valor * 1000, factor: 1000, estimado: false };
    const factor = Number(presentacion?.cantidadBaseKg || factorConversionKg);
    if (!Number.isFinite(factor) || factor <= 0) throw crearError(`La unidad ${unidad} necesita una presentación o factor de conversión a kg.`);
    return { cantidadKg: valor * factor, factor, estimado: Boolean(presentacion?.estimada) };
};

const prepararDetallesSuministro = async (detalles = [], opciones = {}) => {
    if (!detalles.length) throw crearError('Registra al menos un alimento suministrado.');
    const ids = [...new Set(detalles.map((item) => String(item.alimento)))];
    const alimentos = await Alimento.find({ _id: { $in: ids } });
    if (alimentos.length !== ids.length) throw crearError('Uno o más alimentos no existen.');
    return Promise.all(detalles.map(async (detalle) => {
        const alimento = alimentos.find((item) => String(item._id) === String(detalle.alimento));
        if (!alimento.activo && !opciones.alimentosHistoricos?.has(String(alimento._id))) throw crearError(`${alimento.nombre} está inactivo y no admite nuevos suministros.`);
        const presentacion = detalle.presentacionId ? alimento.presentaciones.id(detalle.presentacionId) : null;
        if (detalle.presentacionId && (!presentacion || !presentacion.activo)) throw crearError(`La presentación de ${alimento.nombre} no existe o está inactiva.`);
        const conversion = convertirAKg({ cantidad: detalle.cantidadIngresada, unidad: detalle.unidadIngresada, presentacion, factorConversionKg: detalle.factorConversionKg });
        const sobrante = detalle.sobranteKg === '' || detalle.sobranteKg === undefined || detalle.sobranteKg === null ? null : Number(detalle.sobranteKg);
        if (sobrante !== null && (!Number.isFinite(sobrante) || sobrante < 0 || sobrante > conversion.cantidadKg)) throw crearError(`El sobrante de ${alimento.nombre} debe estar entre 0 y lo suministrado.`);
        if (detalle.origenTipo === 'CORTE_FORRAJE' && !await CorteForraje.exists({ _id: detalle.origenReferenciaId })) throw crearError('El corte de forraje seleccionado no existe.');
        return {
            alimento: alimento._id, alimentoNombreSnapshot: alimento.nombre,
            cantidadIngresada: Number(detalle.cantidadIngresada), unidadIngresada: detalle.unidadIngresada,
            presentacionId: presentacion?._id || null, presentacionNombreSnapshot: presentacion?.nombre,
            factorConversionKgSnapshot: conversion.factor, cantidadKg: redondear(conversion.cantidadKg),
            tipoMedicion: conversion.estimado ? 'ESTIMADA' : detalle.tipoMedicion,
            sobranteKg: sobrante, origenTipo: detalle.origenTipo || null,
            origenReferenciaId: detalle.origenReferenciaId || null, observaciones: detalle.observaciones
        };
    }));
};

const construirTotales = (detalles, cantidadAnimales) => {
    const total = detalles.reduce((suma, item) => suma + item.cantidadKg, 0);
    const consumoCompleto = detalles.every((item) => item.sobranteKg !== null && item.sobranteKg !== undefined);
    const consumo = consumoCompleto ? detalles.reduce((suma, item) => suma + item.cantidadKg - item.sobranteKg, 0) : null;
    return { totalKgSuministrados: redondear(total), totalConsumoEstimadoKg: consumo === null ? null : redondear(consumo), kgSuministradosPorCabeza: redondear(total / cantidadAnimales), consumoEstimadoPorCabeza: consumo === null ? null : redondear(consumo / cantidadAnimales) };
};

const crearSuministro = async (datos, usuarioId) => {
    const lote = await Lote.findById(datos.lote);
    if (!lote) throw crearError('Lote no encontrado.', 404);
    if (lote.estado !== 'ACTIVO') throw crearError('No se puede alimentar un lote cerrado.', 409);
    const cantidadAnimales = await PertenenciaLote.countDocuments({ lote: lote._id, activo: true });
    if (!cantidadAnimales) throw crearError('No se puede registrar alimentación para un lote sin animales activos.', 409, 'LOTE_VACIO');
    const [planAsignado, racionAsignada, detalles] = await Promise.all([
        AsignacionPlanAlimentacion.findOne({ lote: lote._id, activo: true }).populate('plan').lean(),
        obtenerRacionActual(lote._id),
        prepararDetallesSuministro(datos.detalles)
    ]);
    if (datos.racion && String(datos.racion) !== String(racionAsignada?.racion?._id || '')) throw crearError('La ración enviada no es la ración activa del lote.', 409);
    const totales = construirTotales(detalles, cantidadAnimales);
    const suministro = await SuministroAlimentacion.create({
        lote: lote._id, fechaHora: datos.fechaHora || new Date(),
        planAlimentacion: planAsignado?.plan?._id || null,
        planAlimentacionSnapshot: planAsignado?.plan ? { id: planAsignado.plan._id, nombre: planAsignado.plan.nombre, etapa: planAsignado.plan.etapa, tipoManejoAlimenticio: planAsignado.plan.tipoManejoAlimenticio } : null,
        racion: racionAsignada?.racion?._id || null,
        racionSnapshot: racionAsignada?.racion ? { id: racionAsignada.racion._id, nombre: racionAsignada.racion.nombre, etapa: racionAsignada.racion.etapa, detalles: racionAsignada.racion.detalles.map((item) => ({ alimento: item.alimento?._id, nombre: item.alimento?.nombre, cantidad: item.cantidad, unidad: item.unidad, baseCalculo: item.baseCalculo })) } : null,
        etapaOperativaSnapshot: lote.etapaOperativa, cantidadAnimalesSnapshot: cantidadAnimales,
        detalles, ...totales, responsable: datos.responsable || usuarioId, observaciones: datos.observaciones, registradoPor: usuarioId
    });
    await EventoLote.create({ lote: lote._id, tipo: 'SUMINISTRO_ALIMENTACION', fecha: suministro.fechaHora, titulo: 'Alimentación registrada', descripcion: `${suministro.totalKgSuministrados} kg suministrados`, referenciaId: suministro._id, entidadTipo: 'SuministroAlimentacion', registradoPor: usuarioId, metadata: { cantidadAnimalesSnapshot: cantidadAnimales, totalKg: suministro.totalKgSuministrados } });
    return suministro;
};

const actualizarSuministro = async (id, datos, usuarioId) => {
    const suministro = await SuministroAlimentacion.findById(id);
    if (!suministro) throw crearError('Suministro no encontrado.', 404);
    if (!datos.motivoCorreccion?.trim()) throw crearError('Indica el motivo de la corrección.');
    const alimentosHistoricos = new Set(suministro.detalles.map((item) => String(item.alimento)));
    const detalles = datos.detalles ? await prepararDetallesSuministro(datos.detalles, { alimentosHistoricos }) : suministro.detalles;
    const totales = construirTotales(detalles, suministro.cantidadAnimalesSnapshot);
    suministro.historialCorrecciones.push({
        usuario: usuarioId,
        motivo: datos.motivoCorreccion,
        valorAnterior: { fechaHora: suministro.fechaHora, detalles: suministro.detalles, observaciones: suministro.observaciones },
        valorNuevo: { fechaHora: datos.fechaHora || suministro.fechaHora, detalles, observaciones: datos.observaciones ?? suministro.observaciones }
    });
    suministro.detalles = detalles; Object.assign(suministro, totales);
    if (datos.fechaHora) suministro.fechaHora = datos.fechaHora;
    if (datos.observaciones !== undefined) suministro.observaciones = datos.observaciones;
    suministro.actualizadoPor = usuarioId; suministro.motivoCorreccion = datos.motivoCorreccion;
    return suministro.save();
};

module.exports = { inicializarCatalogo, crearAlimento, actualizarAlimento, crearRacion, actualizarRacion, asignarRacionLote, obtenerRacionActual, convertirAKg, prepararDetallesSuministro, construirTotales, crearSuministro, actualizarSuministro, validarCompatibilidadRacionLote };
