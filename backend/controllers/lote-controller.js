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
    proyectarDetalleLotePorPlan,
    obtenerResumenListadoLotes,
    listarEventosLote,
    normalizarFechaOperacion
} = require('../services/lote-service');
const HistorialEtapaLote = require('../models/HistorialEtapaLote');
const { ejecutarNotificacionSegura, notificarTareaAsignada } = require('../services/tarea-notificacion-service');
const { normalizarPropositoLote } = require('../config/lotes');
const { asegurarPuedeUsarEspecie, tieneFeature } = require('../services/plan-service');
const { respuestaErrorPlan } = require('../middleware/plan');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { sanitizarActualizacionLote, sanitizarCreacionLote } = require('../services/lote-integridad-service');

const responderError = (res, error) => res.status(error.status || 400).json({ mensaje: error.message, codigo: error.codigo });
const escaparRegex = (valor = '') => String(valor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
const detalleVisible = async (loteId, organizacionId, zonaHoraria) => proyectarDetalleLotePorPlan(
    await obtenerDetalleLote(loteId, { zonaHoraria }),
    await tieneFeature('analiticaProductiva', organizacionId)
);

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
            { codigo: { $regex: escaparRegex(req.query.buscar), $options: 'i' } },
            { nombre: { $regex: escaparRegex(req.query.buscar), $options: 'i' } }
        ];
        const lotes = await obtenerResumenListadoLotes(filtro);
        res.json(lotes.map((lote) => proyectarDetalleLotePorPlan(lote, incluirAnalitica)));
    } catch (error) { if (!respuestaErrorPlan(error, res)) responderError(res, error); }
};

const crear = async (req, res) => {
    try {
        const limpio = sanitizarCreacionLote(req.body);
        const { ubicacionActual, animales = [], ...datos } = limpio;
        await asegurarPuedeUsarEspecie(datos.especie, req.organizacionId);
        if (datos.proposito) datos.proposito = normalizarPropositoLote(datos.proposito) || datos.proposito;
        datos.fechaInicio = normalizarFechaOperacion(datos.fechaInicio, req.organizacion?.zonaHoraria);
        if (datos.fechaInicio > new Date()) {
            throw Object.assign(new Error('La fecha inicial del lote no puede estar en el futuro.'), { status: 400, codigo: 'FECHA_LOTE_FUTURA' });
        }
        const loteId = await ejecutarEnTransaccion(async (session) => {
            const [lote] = await Lote.create([{
                ...datos,
                estado: 'ACTIVO',
                fechaCierre: undefined,
                organizacionId: req.organizacionId,
                fincaId: req.fincaId,
                creadoPor: req.usuario?.id
            }], { session, ordered: true });
            if (lote.etapaOperativa) {
                await HistorialEtapaLote.create([{
                    lote: lote._id,
                    etapa: lote.etapaOperativa,
                    fechaInicio: lote.fechaInicio,
                    registradoPor: req.usuario?.id
                }], { session, ordered: true });
            }
            await registrarEventoOperativoLote({
                lote: lote._id,
                tipo: 'LOTE_CREADO',
                titulo: 'Lote creado',
                descripcion: lote.nombre,
                fecha: lote.fechaInicio,
                usuarioId: req.usuario?.id,
                session
            });
            if (animales.length) {
                await agregarAnimalesAlLote(lote._id, {
                    animales,
                    fechaEntrada: lote.fechaInicio,
                    motivoEntrada: 'Creación del lote'
                }, req.usuario?.id, { session, zonaHoraria: req.organizacion?.zonaHoraria });
                if (ubicacionActual) {
                    await moverLoteAPotrero(lote._id, {
                        potrero: ubicacionActual,
                        fechaEntrada: lote.fechaInicio
                    }, req.usuario?.id, { session });
                }
            }
            return lote._id;
        });
        res.status(201).json(await detalleVisible(loteId, req.organizacionId, req.organizacion?.zonaHoraria));
    } catch (error) { if (!respuestaErrorPlan(error, res)) responderError(res, error); }
};

const obtener = async (req, res) => {
    try {
        const incluirAnalitica = await tieneFeature('analiticaProductiva', req.organizacionId);
        res.json(proyectarDetalleLotePorPlan(await obtenerDetalleLote(req.params.id, { zonaHoraria: req.organizacion?.zonaHoraria }), incluirAnalitica));
    } catch (error) { if (!respuestaErrorPlan(error, res)) responderError(res, error); }
};

const actualizar = async (req, res) => {
    try {
        const datos = sanitizarActualizacionLote(req.body);
        if (datos.proposito) datos.proposito = normalizarPropositoLote(datos.proposito) || datos.proposito;
        await ejecutarEnTransaccion(async (session) => {
            const lote = await Lote.findById(req.params.id).session(session);
            if (!lote) throw Object.assign(new Error('Lote no encontrado.'), { status: 404 });
            await asegurarPuedeUsarEspecie(datos.especie || lote.especie, req.organizacionId);
            if (lote.estado !== 'ACTIVO') throw Object.assign(new Error('No se puede editar un lote cerrado.'), { status: 409 });
            const fechaInicioNueva = datos.fechaInicio
                ? normalizarFechaOperacion(datos.fechaInicio, req.organizacion?.zonaHoraria)
                : null;
            if (fechaInicioNueva && fechaInicioNueva > new Date()) {
                throw Object.assign(new Error('La fecha inicial del lote no puede estar en el futuro.'), { status: 400, codigo: 'FECHA_LOTE_FUTURA' });
            }
            const cambiaClasificacion = (datos.especie && datos.especie !== lote.especie)
                || (datos.proposito && datos.proposito !== lote.proposito);
            const cambiaInicio = fechaInicioNueva && fechaInicioNueva.getTime() !== new Date(lote.fechaInicio).getTime();
            if (cambiaClasificacion || cambiaInicio) {
                const [animalesActivos, planActivo, historial] = await Promise.all([
                    PertenenciaLote.countDocuments({ lote: lote._id, activo: true }).session(session),
                    AsignacionPlanAlimentacion.exists({ lote: lote._id, activo: true }).session(session),
                    HistorialEtapaLote.countDocuments({ lote: lote._id }).session(session)
                ]);
                if (animalesActivos || planActivo || (cambiaInicio && historial)) {
                    throw Object.assign(new Error('No se puede cambiar clasificación o fecha inicial mientras el lote tenga historia operativa.'), { status: 409 });
                }
            }
            const etapaNueva = Object.hasOwn(datos, 'etapaOperativa') ? datos.etapaOperativa : undefined;
            const campos = ['codigo', 'nombre', 'especie', 'proposito', 'fechaInicio', 'descripcion', 'pesoObjetivoKg', 'gmdObjetivoKgDia'];
            campos.forEach((campo) => {
                if (Object.hasOwn(datos, campo)) lote[campo] = campo === 'fechaInicio'
                    ? fechaInicioNueva
                    : datos[campo];
            });
            await lote.save({ session });
            if (etapaNueva !== undefined && etapaNueva !== lote.etapaOperativa) {
                await cambiarEtapa(lote._id, etapaNueva, req.usuario?.id, new Date(), {
                    session,
                    zonaHoraria: req.organizacion?.zonaHoraria
                });
            }
        });
        res.json(await detalleVisible(req.params.id, req.organizacionId, req.organizacion?.zonaHoraria));
    } catch (error) { if (!respuestaErrorPlan(error, res)) responderError(res, error); }
};

const agregarAnimales = async (req, res) => {
    try {
        const pertenencias = await agregarAnimalesAlLote(req.params.id, { ...req.body, permitirMover: false }, req.usuario?.id, { zonaHoraria: req.organizacion?.zonaHoraria });
        res.status(201).json({ agregados: pertenencias.length, lote: await detalleVisible(req.params.id, req.organizacionId, req.organizacion?.zonaHoraria) });
    } catch (error) { responderError(res, error); }
};

const moverAnimales = async (req, res) => {
    try {
        const destinoId = req.body.loteDestino || req.params.id;
        const pertenencias = await agregarAnimalesAlLote(destinoId, { ...req.body, permitirMover: true }, req.usuario?.id, { zonaHoraria: req.organizacion?.zonaHoraria });
        res.json({ movidos: pertenencias.length, lote: await detalleVisible(destinoId, req.organizacionId, req.organizacion?.zonaHoraria) });
    } catch (error) { responderError(res, error); }
};

const retirarAnimales = async (req, res) => {
    try {
        const pertenencias = await retirarAnimalesDelLote(req.params.id, req.body, req.usuario?.id, { zonaHoraria: req.organizacion?.zonaHoraria });
        res.json({ retirados: pertenencias.length, lote: await detalleVisible(req.params.id, req.organizacionId, req.organizacion?.zonaHoraria) });
    } catch (error) { responderError(res, error); }
};

const cerrar = async (req, res) => {
    try {
        await cerrarLote(req.params.id, req.body, req.usuario?.id, { zonaHoraria: req.organizacion?.zonaHoraria });
        res.json(await detalleVisible(req.params.id, req.organizacionId, req.organizacion?.zonaHoraria));
    } catch (error) { responderError(res, error); }
};

const cambiarEtapaLote = async (req, res) => {
    try {
        await cambiarEtapa(req.params.id, req.body.etapaOperativa || null, req.usuario?.id, req.body.fechaCambio, { zonaHoraria: req.organizacion?.zonaHoraria });
        res.json(await detalleVisible(req.params.id, req.organizacionId, req.organizacion?.zonaHoraria));
    } catch (error) { responderError(res, error); }
};

const registrarPesajes = async (req, res) => {
    try {
        const pesajes = await registrarPesajesLote(req.params.id, req.body, req.usuario?.id, { zonaHoraria: req.organizacion?.zonaHoraria });
        const incluirAnalitica = await tieneFeature('analiticaProductiva', req.organizacionId);
        const detalle = proyectarDetalleLotePorPlan(await obtenerDetalleLote(req.params.id, { zonaHoraria: req.organizacion?.zonaHoraria }), incluirAnalitica);
        res.status(201).json({ registrados: pesajes.length, lote: detalle });
    } catch (error) { if (!respuestaErrorPlan(error, res)) responderError(res, error); }
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
    try {
        await moverLoteAPotrero(req.params.id, req.body, req.usuario?.id, { zonaHoraria: req.organizacion?.zonaHoraria });
        res.json(await detalleVisible(req.params.id, req.organizacionId, req.organizacion?.zonaHoraria));
    } catch (error) { responderError(res, error); }
};

const eventos = async (req, res) => {
    try { res.json(await listarEventosLote(req.params.id, req.query)); } catch (error) { responderError(res, error); }
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

module.exports = { listar, crear, obtener, actualizar, agregarAnimales, moverAnimales, retirarAnimales, cerrar, cambiarEtapaLote, registrarPesajes, programarTarea, cambiarPotrero, historial, planActual, historialAlimentacion, eventos };
