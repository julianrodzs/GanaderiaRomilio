const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');
const AsignacionPlanAlimentacion = require('../models/AsignacionPlanAlimentacion');
const {
    agregarAnimalesAlLote,
    cerrarLote,
    cambiarEtapa,
    crearTareaLote,
    moverLoteAPotrero,
    obtenerDetalleLote,
    registrarEventoOperativoLote,
    registrarPesajesLote,
    retirarAnimalesDelLote,
    proyectarDetalleLotePorPlan
} = require('../services/lote-service');
const HistorialEtapaLote = require('../models/HistorialEtapaLote');
const { ejecutarNotificacionSegura, notificarTareaAsignada } = require('../services/tarea-notificacion-service');
const { normalizarPropositoLote } = require('../config/lotes');
const { asegurarPuedeUsarEspecie, tieneFeature } = require('../services/plan-service');
const { respuestaErrorPlan } = require('../middleware/plan');

const responderError = (res, error) => res.status(error.status || 400).json({ mensaje: error.message, codigo: error.codigo });

const listar = async (req, res) => {
    try {
        const incluirAnalitica = await tieneFeature('analiticaProductiva', req.organizacionId);
        const filtro = {};
        if (req.query.especie) filtro.especie = req.query.especie;
        if (req.query.estado) filtro.estado = req.query.estado;
        if (req.query.proposito) filtro.proposito = normalizarPropositoLote(req.query.proposito) || req.query.proposito;
        if (req.query.etapa) filtro.etapaOperativa = req.query.etapa;
        if (req.query.potrero) filtro.ubicacionActual = req.query.potrero;
        if (req.query.buscar) filtro.$or = [
            { codigo: { $regex: req.query.buscar, $options: 'i' } },
            { nombre: { $regex: req.query.buscar, $options: 'i' } }
        ];
        const lotes = await Lote.find(filtro).populate('ubicacionActual', 'codigo nombre').sort({ estado: 1, createdAt: -1 }).lean();
        const enriquecidos = await Promise.all(lotes.map(async (lote) => {
            const [cantidadAnimales, asignacion, detalle] = await Promise.all([
                PertenenciaLote.countDocuments({ lote: lote._id, activo: true }),
                AsignacionPlanAlimentacion.findOne({ lote: lote._id, activo: true }).populate('plan', 'nombre etapa activo').lean(),
                obtenerDetalleLote(lote._id)
            ]);
            const visible = proyectarDetalleLotePorPlan(detalle, incluirAnalitica);
            return { ...lote, gmdObjetivoKgDia: visible.gmdObjetivoKgDia, cantidadAnimales, resumen: visible.resumen, planAlimentacionActual: asignacion?.plan || null };
        }));
        res.json(enriquecidos);
    } catch (error) { if (!respuestaErrorPlan(error, res)) responderError(res, error); }
};

const crear = async (req, res) => {
    try {
        const { ubicacionActual, animales, ...datos } = req.body;
        await asegurarPuedeUsarEspecie(datos.especie, req.organizacionId);
        if (datos.proposito) datos.proposito = normalizarPropositoLote(datos.proposito) || datos.proposito;
        const lote = await Lote.create({ ...datos, creadoPor: req.usuario?.id });
        if (lote.etapaOperativa) await HistorialEtapaLote.create({ lote: lote._id, etapa: lote.etapaOperativa, fechaInicio: lote.fechaInicio, registradoPor: req.usuario?.id });
        await registrarEventoOperativoLote({ lote: lote._id, tipo: 'LOTE_CREADO', titulo: 'Lote creado', descripcion: lote.nombre, fecha: lote.fechaInicio, usuarioId: req.usuario?.id });
        if (animales?.length) {
            await agregarAnimalesAlLote(lote._id, { animales, motivoEntrada: 'Creación del lote' }, req.usuario?.id);
        }
        if (ubicacionActual) await moverLoteAPotrero(lote._id, { potrero: ubicacionActual, fechaEntrada: lote.fechaInicio }, req.usuario?.id);
        res.status(201).json(await obtenerDetalleLote(lote._id));
    } catch (error) { if (!respuestaErrorPlan(error, res)) responderError(res, error); }
};

const obtener = async (req, res) => {
    try {
        const incluirAnalitica = await tieneFeature('analiticaProductiva', req.organizacionId);
        res.json(proyectarDetalleLotePorPlan(await obtenerDetalleLote(req.params.id), incluirAnalitica));
    } catch (error) { if (!respuestaErrorPlan(error, res)) responderError(res, error); }
};

const actualizar = async (req, res) => {
    try {
        if (req.body.proposito) req.body.proposito = normalizarPropositoLote(req.body.proposito) || req.body.proposito;
        const lote = await Lote.findById(req.params.id);
        if (!lote) return res.status(404).json({ mensaje: 'Lote no encontrado.' });
        await asegurarPuedeUsarEspecie(req.body.especie || lote.especie, req.organizacionId);
        if (lote.estado !== 'ACTIVO' && (req.body.especie || req.body.proposito)) {
            return res.status(409).json({ mensaje: 'No se puede cambiar especie o propósito de un lote cerrado.' });
        }
        const cambiaClasificacion = (req.body.especie && req.body.especie !== lote.especie)
            || (req.body.proposito && req.body.proposito !== lote.proposito);
        if (cambiaClasificacion) {
            const [animalesActivos, planActivo] = await Promise.all([
                PertenenciaLote.countDocuments({ lote: lote._id, activo: true }),
                AsignacionPlanAlimentacion.exists({ lote: lote._id, activo: true })
            ]);
            if (animalesActivos || planActivo) {
                return res.status(409).json({ mensaje: 'Retira los animales y cierra el plan actual antes de cambiar especie o propósito.' });
            }
        }
        const etapaNueva = req.body.etapaOperativa;
        const permitidos = ['codigo', 'nombre', 'especie', 'proposito', 'fechaInicio', 'descripcion', 'pesoObjetivoKg', 'gmdObjetivoKgDia'];
        permitidos.forEach((campo) => { if (req.body[campo] !== undefined) lote[campo] = req.body[campo] || undefined; });
        await lote.save();
        if (etapaNueva !== undefined && etapaNueva !== lote.etapaOperativa) await cambiarEtapa(lote._id, etapaNueva || null, req.usuario?.id);
        res.json(await obtenerDetalleLote(lote._id));
    } catch (error) { if (!respuestaErrorPlan(error, res)) responderError(res, error); }
};

const agregarAnimales = async (req, res) => {
    try {
        const pertenencias = await agregarAnimalesAlLote(req.params.id, { ...req.body, permitirMover: false }, req.usuario?.id);
        res.status(201).json({ agregados: pertenencias.length, lote: await obtenerDetalleLote(req.params.id) });
    } catch (error) { responderError(res, error); }
};

const moverAnimales = async (req, res) => {
    try {
        const destinoId = req.body.loteDestino || req.params.id;
        const pertenencias = await agregarAnimalesAlLote(destinoId, { ...req.body, permitirMover: true }, req.usuario?.id);
        res.json({ movidos: pertenencias.length, lote: await obtenerDetalleLote(destinoId) });
    } catch (error) { responderError(res, error); }
};

const retirarAnimales = async (req, res) => {
    try {
        const pertenencias = await retirarAnimalesDelLote(req.params.id, req.body, req.usuario?.id);
        res.json({ retirados: pertenencias.length, lote: await obtenerDetalleLote(req.params.id) });
    } catch (error) { responderError(res, error); }
};

const cerrar = async (req, res) => {
    try { res.json(await cerrarLote(req.params.id, req.body, req.usuario?.id)); } catch (error) { responderError(res, error); }
};

const cambiarEtapaLote = async (req, res) => {
    try { await cambiarEtapa(req.params.id, req.body.etapaOperativa || null, req.usuario?.id, req.body.fechaCambio); res.json(await obtenerDetalleLote(req.params.id)); } catch (error) { responderError(res, error); }
};

const registrarPesajes = async (req, res) => {
    try { const pesajes = await registrarPesajesLote(req.params.id, req.body, req.usuario?.id); res.status(201).json({ registrados: pesajes.length, lote: await obtenerDetalleLote(req.params.id) }); } catch (error) { responderError(res, error); }
};

const programarTarea = async (req, res) => {
    try {
        const tarea = await crearTareaLote(req.params.id, req.body, req.usuario?.id);
        await tarea.populate('asignadoA', 'nombre apellido correo rol estado');
        await ejecutarNotificacionSegura(() => notificarTareaAsignada(tarea, req.usuario));
        res.status(201).json(tarea);
    } catch (error) { responderError(res, error); }
};

const cambiarPotrero = async (req, res) => {
    try { await moverLoteAPotrero(req.params.id, req.body, req.usuario?.id); res.json(await obtenerDetalleLote(req.params.id)); } catch (error) { responderError(res, error); }
};

const historial = async (req, res) => {
    try {
        const registros = await PertenenciaLote.find({ lote: req.params.id })
            .populate('animal', 'diio identificadorFinca nombre especie categoria')
            .populate('registradoPor', 'nombre correo')
            .sort({ fechaEntrada: -1 }).lean();
        res.json(registros);
    } catch (error) { responderError(res, error); }
};

const planActual = async (req, res) => {
    try {
        const asignacion = await AsignacionPlanAlimentacion.findOne({ lote: req.params.id, activo: true })
            .populate('plan').populate('asignadoPor', 'nombre correo').lean();
        res.json(asignacion || null);
    } catch (error) { responderError(res, error); }
};

const historialAlimentacion = async (req, res) => {
    try {
        const historial = await AsignacionPlanAlimentacion.find({ lote: req.params.id })
            .populate('plan', 'nombre etapa especie proposito activo')
            .populate('asignadoPor', 'nombre correo').sort({ fechaInicio: -1 }).lean();
        res.json(historial);
    } catch (error) { responderError(res, error); }
};

module.exports = { listar, crear, obtener, actualizar, agregarAnimales, moverAnimales, retirarAnimales, cerrar, cambiarEtapaLote, registrarPesajes, programarTarea, cambiarPotrero, historial, planActual, historialAlimentacion };
