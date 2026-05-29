const planSanitarioCtrl = {};

const {
    PlanSanitario,
    calcularEstadoPlanSanitario
} = require('../models/PlanSanitario');

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
        res.json(planActualizado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al marcar plan como aplicado', error: error.message });
    }
};

module.exports = planSanitarioCtrl;
