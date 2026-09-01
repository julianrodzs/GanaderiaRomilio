const planSanitarioCtrl = {};

const {
    PlanSanitario,
    calcularEstadoPlanSanitario
} = require('../models/PlanSanitario');
const Animal = require('../models/Animal');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('../services/eventoAnimal-service');

const crearFiltroEspecie = (especie) => {
    if (especie === 'Bovino') return { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] };
    if (especie === 'Porcino') return { especie };
    return {};
};

const obtenerAnimalesParaPlan = async (plan) => {
    if (plan.animalDiio) {
        const filtros = [
            crearFiltroEspecie(plan.especie),
            {
                $or: [
                { diio: plan.animalDiio },
                { identificadorFinca: plan.animalDiio }
                ]
            }
        ].filter((filtro) => Object.keys(filtro).length);
        const animal = await Animal.findOne(filtros.length ? { $and: filtros } : {});
        return animal ? [animal] : [];
    }

    if (plan.grupoGanado === 'Todo el ganado') {
        return Animal.find({
            ...crearFiltroEspecie(plan.especie),
            estado: { $nin: ['Muerto', 'Vendido'] }
        });
    }

    return [];
};

const registrarEventosSanidad = async (plan, usuarioId) => {
    const animales = await obtenerAnimalesParaPlan(plan);

    await Promise.all(animales.map((animal) => upsertEventoAnimal({
        animal: animal._id,
        tipoEvento: 'Sanidad',
        fecha: plan.fechaAplicacion || new Date(),
        titulo: `${plan.actividad} / ${plan.producto}`,
        descripcion: plan.observaciones || `Aplicación sanitaria para ${plan.grupoGanado}.`,
        moduloOrigen: 'Sanidad',
        creadoPor: usuarioId,
        metadata: {
            planSanitario: plan._id,
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
        const planes = await PlanSanitario.find(crearFiltroEspecie(req.query.especie)).sort({ proximaAplicacion: 1 });
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
        const planes = await PlanSanitario.find({
            ...crearFiltroEspecie(req.query.especie),
            estado: { $ne: 'Aplicado' }
        }).sort({ proximaAplicacion: 1 });
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
        await eliminarEventosPorReferencia({ moduloOrigen: 'Sanidad', referenciaId: plan._id });

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

planSanitarioCtrl.registrarAplicacionPlan = async (req, res) => {
    try {
        const plan = await PlanSanitario.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({ mensaje: 'Plan sanitario no encontrado' });
        }

        await eliminarEventosPorReferencia({ moduloOrigen: 'Sanidad', referenciaId: plan._id });
        plan.fechaAplicacion = req.body.fechaAplicacion || new Date();

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
        res.status(400).json({ mensaje: 'Error al registrar aplicacion sanitaria', error: error.message });
    }
};

planSanitarioCtrl.marcarPlanAplicado = planSanitarioCtrl.registrarAplicacionPlan;

module.exports = planSanitarioCtrl;
