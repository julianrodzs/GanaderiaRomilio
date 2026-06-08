const planSanitarioCtrl = {};

const {
    PlanSanitario,
    calcularEstadoPlanSanitario
} = require('../models/PlanSanitario');
const Animal = require('../models/Animal');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('../services/eventoAnimal-service');

const obtenerAnimalesParaPlan = async (plan) => {
    if (plan.animalDiio) {
        const animal = await Animal.findOne({
            $or: [
                { diio: plan.animalDiio },
                { identificadorFinca: plan.animalDiio }
            ]
        });
        return animal ? [animal] : [];
    }

    if (plan.grupoGanado === 'Todo el ganado') {
        return Animal.find({ estado: { $nin: ['Muerto', 'Vendido'] } });
    }

    return [];
};

const registrarEventosSanidad = async (plan, usuarioId) => {
    await eliminarEventosPorReferencia({ moduloOrigen: 'Sanidad', referenciaId: plan._id });
    const animales = await obtenerAnimalesParaPlan(plan);

    await Promise.all(animales.map((animal) => upsertEventoAnimal({
        animal: animal._id,
        tipoEvento: 'Sanidad',
        fecha: plan.fechaAplicacion || new Date(),
        titulo: `${plan.actividad} / ${plan.producto}`,
        descripcion: plan.observaciones || `Aplicación sanitaria para ${plan.grupoGanado}.`,
        moduloOrigen: 'Sanidad',
        referenciaId: plan._id,
        creadoPor: usuarioId,
        metadata: {
            grupoGanado: plan.grupoGanado,
            animalDiio: plan.animalDiio,
            actividad: plan.actividad,
            producto: plan.producto,
            marca: plan.marca,
            dosis: plan.dosis,
            criterioPeso: plan.criterioPeso,
            responsable: plan.responsable,
            estado: plan.estado,
            proximaAplicacion: plan.proximaAplicacion
        }
    })));
};

const refrescarEstado = async (plan) => {
    const estadoCalculado = calcularEstadoPlanSanitario(plan.proximaAplicacion);

    if (plan.estado !== 'Aplicado' && plan.estado !== estadoCalculado) {
        plan.estado = estadoCalculado;
        await plan.save();
    }

    return plan;
};

planSanitarioCtrl.getPlanesSanitarios = async (req, res) => {
    try {
        const planes = await PlanSanitario.find().sort({ proximaAplicacion: 1 });
        const planesActualizados = await Promise.all(planes.map(refrescarEstado));
        res.json(planesActualizados);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener planes sanitarios', error: error.message });
    }
};

planSanitarioCtrl.createPlanSanitario = async (req, res) => {
    try {
        const nuevoPlan = new PlanSanitario(req.body);
        const planGuardado = await nuevoPlan.save();
        await registrarEventosSanidad(planGuardado, req.usuario?.id);
        res.status(201).json(planGuardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear plan sanitario', error: error.message });
    }
};

planSanitarioCtrl.getAlertasPlanSanitario = async (req, res) => {
    try {
        const planes = await PlanSanitario.find({ estado: { $ne: 'Aplicado' } }).sort({ proximaAplicacion: 1 });
        const actualizados = await Promise.all(planes.map(refrescarEstado));
        const alertas = actualizados.filter((plan) => ['Vencido', 'Próximo'].includes(plan.estado));

        res.json({
            total: alertas.length,
            vencidos: alertas.filter((plan) => plan.estado === 'Vencido'),
            proximos: alertas.filter((plan) => plan.estado === 'Próximo')
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener alertas sanitarias', error: error.message });
    }
};

planSanitarioCtrl.updatePlanSanitario = async (req, res) => {
    try {
        const plan = await PlanSanitario.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({ mensaje: 'Plan sanitario no encontrado' });
        }

        Object.assign(plan, req.body);
        const planActualizado = await plan.save();
        await registrarEventosSanidad(planActualizado, req.usuario?.id);

        res.json(planActualizado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar plan sanitario', error: error.message });
    }
};

planSanitarioCtrl.deletePlanSanitario = async (req, res) => {
    try {
        const plan = await PlanSanitario.findByIdAndDelete(req.params.id);

        if (!plan) {
            return res.status(404).json({ mensaje: 'Plan sanitario no encontrado' });
        }

        await eliminarEventosPorReferencia({ moduloOrigen: 'Sanidad', referenciaId: plan._id });

        res.json({ mensaje: 'Plan sanitario eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar plan sanitario', error: error.message });
    }
};

planSanitarioCtrl.marcarPlanAplicado = async (req, res) => {
    try {
        const plan = await PlanSanitario.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({ mensaje: 'Plan sanitario no encontrado' });
        }

        plan.fechaAplicacion = req.body.fechaAplicacion || new Date();
        plan.estado = 'Aplicado';

        if (req.body.responsable) {
            plan.responsable = req.body.responsable;
        }

        if (req.body.observaciones) {
            plan.observaciones = req.body.observaciones;
        }

        const planActualizado = await plan.save();
        await registrarEventosSanidad(planActualizado, req.usuario?.id);
        res.json(planActualizado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al marcar plan como aplicado', error: error.message });
    }
};

module.exports = planSanitarioCtrl;
