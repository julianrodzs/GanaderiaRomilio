const PlanAlimentacion = require('../models/PlanAlimentacion');
const AsignacionPlanAlimentacion = require('../models/AsignacionPlanAlimentacion');
const { asignarPlanALotes, cambiarEstadoPlan } = require('../services/planAlimentacion-service');
const { normalizarPropositoLote } = require('../config/lotes');

const responderError = (res, error) => res.status(error.status || 400).json({ mensaje: error.message, codigo: error.codigo });

const listar = async (req, res) => {
    try {
        const filtro = {};
        if (req.query.especie) filtro.especie = req.query.especie;
        if (req.query.proposito) filtro.proposito = normalizarPropositoLote(req.query.proposito) || req.query.proposito;
        if (req.query.activo !== undefined) filtro.activo = req.query.activo === 'true';
        const planes = await PlanAlimentacion.find(filtro).sort({ activo: -1, nombre: 1 }).lean();
        const resultado = await Promise.all(planes.map(async (plan) => ({
            ...plan,
            lotesActivos: await AsignacionPlanAlimentacion.countDocuments({ plan: plan._id, activo: true })
        })));
        res.json(resultado);
    } catch (error) { responderError(res, error); }
};

const crear = async (req, res) => {
    try {
        if (req.body.proposito) req.body.proposito = normalizarPropositoLote(req.body.proposito) || req.body.proposito;
        const plan = await PlanAlimentacion.create({ ...req.body, creadoPor: req.usuario?.id });
        if (req.body.lotes?.length) await asignarPlanALotes(plan._id, { lotes: req.body.lotes }, req.usuario?.id);
        res.status(201).json(plan);
    } catch (error) { responderError(res, error); }
};

const obtener = async (req, res) => {
    try {
        const plan = await PlanAlimentacion.findById(req.params.id).lean();
        if (!plan) return res.status(404).json({ mensaje: 'Plan de alimentación no encontrado.' });
        const asignaciones = await AsignacionPlanAlimentacion.find({ plan: plan._id })
            .populate('lote', 'codigo nombre especie proposito estado').sort({ fechaInicio: -1 }).lean();
        res.json({ ...plan, asignaciones });
    } catch (error) { responderError(res, error); }
};

const actualizar = async (req, res) => {
    try {
        if (req.body.proposito) req.body.proposito = normalizarPropositoLote(req.body.proposito) || req.body.proposito;
        const plan = await PlanAlimentacion.findById(req.params.id);
        if (!plan) return res.status(404).json({ mensaje: 'Plan de alimentación no encontrado.' });
        await cambiarEstadoPlan(plan, req.body);
        const cambiaCompatibilidad = (req.body.especie && req.body.especie !== plan.especie)
            || (req.body.proposito && req.body.proposito !== plan.proposito);
        if (cambiaCompatibilidad && await AsignacionPlanAlimentacion.exists({ plan: plan._id, activo: true })) {
            return res.status(409).json({ mensaje: 'No se puede cambiar especie o propósito mientras el plan tenga lotes activos asignados.' });
        }
        const permitidos = ['nombre', 'descripcion', 'especie', 'proposito', 'etapa', 'tipoManejoAlimenticio', 'vigenciaInicio', 'vigenciaFin', 'activo', 'observaciones'];
        permitidos.forEach((campo) => { if (req.body[campo] !== undefined) plan[campo] = req.body[campo]; });
        await plan.save();
        res.json(plan);
    } catch (error) { responderError(res, error); }
};

const asignarLotes = async (req, res) => {
    try {
        const asignaciones = await asignarPlanALotes(req.params.id, req.body, req.usuario?.id);
        res.status(201).json({ asignados: asignaciones.length });
    } catch (error) { responderError(res, error); }
};

const asignarPlanLote = async (req, res) => {
    try {
        const asignaciones = await asignarPlanALotes(req.body.plan, { ...req.body, lotes: [req.params.id] }, req.usuario?.id);
        res.status(201).json(asignaciones[0]);
    } catch (error) { responderError(res, error); }
};

module.exports = { listar, crear, obtener, actualizar, asignarLotes, asignarPlanLote };
