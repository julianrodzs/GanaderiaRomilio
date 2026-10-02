const planSanitarioCtrl = {};

const {
    PlanSanitario,
    calcularEstadoPlanSanitario
} = require('../models/PlanSanitario');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const {
    crearAplicacionSanitaria,
    eliminarAplicacionSanitariaCreada,
    resolverAlcanceSanitario,
    validarAnimalesSanidad
} = require('../services/aplicacionSanitaria-service');
const { crearFiltroEspecie, obtenerAnimalesParaPlan } = require('../services/planSanitario-service');
const {
    cancelarTareasSanitariasPendientes,
    completarTareasSanitariasPendientes,
    sincronizarTareaPlanSanitario
} = require('../services/sanidad-tarea-service');
const { nombreUsuario, notificarAccionSegura } = require('../services/notificacion-service');
const { validarUsuarioAsignable } = require('../services/usuarioAsignable-service');

const poblarPlan = (query) => query
    .populate('animales', 'diio identificadorFinca nombre especie estado')
    .populate('lote', 'codigo nombre especie estado')
    .populate('asignadoA', 'nombre apellido correo rol estado');

const prepararAlcancePlan = async (datos, especiePredeterminada = 'Bovino') => {
    const preparados = { ...datos };
    const especie = preparados.especie || especiePredeterminada;
    if (preparados.lote) {
        const alcance = await resolverAlcanceSanitario({ lote: preparados.lote, especie }, { soloActivos: true });
        preparados.lote = alcance.lote._id;
        preparados.grupoGanado = `Lote ${alcance.lote.codigo}`;
        preparados.animales = [];
        preparados.animalDiio = '';
    } else {
        if (Object.prototype.hasOwnProperty.call(preparados, 'lote')) preparados.lote = null;
        if (preparados.animales?.length) {
            await validarAnimalesSanidad(preparados.animales, especie, { soloActivos: true });
        }
    }
    return preparados;
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
        const planes = await poblarPlan(
            PlanSanitario.find(crearFiltroEspecie(req.query.especie)).sort({ proximaAplicacion: 1 })
        );
        const planesActualizados = await Promise.all(planes.map(refrescarEstado));
        const ultimasAplicaciones = await AplicacionSanitaria.aggregate([
            { $match: { planSanitario: { $in: planesActualizados.map((plan) => plan._id) } } },
            { $group: { _id: '$planSanitario', fecha: { $max: '$fechaAplicacion' } } }
        ]);
        const fechasPorPlan = new Map(ultimasAplicaciones.map((item) => [item._id.toString(), item.fecha]));
        res.json(planesActualizados.map((plan) => ({
            ...plan.toObject(),
            ultimaAplicacionReal: fechasPorPlan.get(plan._id.toString()) || null
        })));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener planes sanitarios', error: error.message });
    }
};

planSanitarioCtrl.createPlanSanitario = async (req, res) => {
    try {
        await validarUsuarioAsignable(req.body.asignadoA, 'Sanidad');
        const datos = await prepararAlcancePlan(req.body, 'Bovino');
        const nuevoPlan = new PlanSanitario({
            ...datos,
            creadoPor: req.usuario?.id
        });
        const planGuardado = await nuevoPlan.save();
        await sincronizarTareaPlanSanitario(planGuardado, req.usuario?.id);
        res.status(201).json(await poblarPlan(PlanSanitario.findById(planGuardado._id)));
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

        const datos = await prepararAlcancePlan(req.body, plan.especie);
        if (Object.prototype.hasOwnProperty.call(req.body, 'asignadoA')) {
            await validarUsuarioAsignable(req.body.asignadoA, 'Sanidad');
        }
        Object.assign(plan, datos);
        const planActualizado = await plan.save();
        await sincronizarTareaPlanSanitario(planActualizado, req.usuario?.id);

        res.json(await poblarPlan(PlanSanitario.findById(planActualizado._id)));
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

        await cancelarTareasSanitariasPendientes(plan._id, 'Plan sanitario', 'Plan sanitario eliminado.');

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

        const responsable = await validarUsuarioAsignable(req.body.responsableUsuario, 'Sanidad');
        const responsableNombre = [responsable.nombre, responsable.apellido].filter(Boolean).join(' ') || responsable.correo;

        const animales = await obtenerAnimalesParaPlan(plan);
        if (!animales.length) {
            return res.status(400).json({
                mensaje: 'El plan no tiene animales identificables. Seleccione un lote con animales, animales específicos o use Todo el ganado.'
            });
        }

        const estadoAnterior = {
            fechaAplicacion: plan.fechaAplicacion,
            responsable: plan.responsable,
            observaciones: plan.observaciones,
            viaAplicacion: plan.viaAplicacion
        };
        plan.fechaAplicacion = req.body.fechaAplicacion || new Date();

        if (req.body.observaciones) {
            plan.observaciones = req.body.observaciones;
        }

        if (req.body.viaAplicacion) {
            plan.viaAplicacion = req.body.viaAplicacion;
        }

        const planActualizado = await plan.save();
        let aplicacion;

        try {
            const numeroAplicacion = await AplicacionSanitaria.countDocuments({
                naturaleza: 'Plan sanitario',
                planSanitario: plan._id
            }) + 1;
            aplicacion = await crearAplicacionSanitaria({
                animales: animales.map((animal) => animal._id),
                especie: plan.especie || 'Bovino',
                fechaAplicacion: planActualizado.fechaAplicacion,
                producto: plan.producto,
                tipo: plan.actividad,
                dosis: req.body.dosis || plan.dosis,
                viaAplicacion: req.body.viaAplicacion || plan.viaAplicacion,
                responsable: responsableNombre,
                responsableUsuario: responsable._id,
                motivo: `Aplicación programada para ${plan.grupoGanado}`,
                observaciones: req.body.observaciones || plan.observaciones,
                naturaleza: 'Plan sanitario',
                planSanitario: plan._id,
                lote: plan.lote?._id || plan.lote,
                numeroAplicacion
            }, req.usuario?.id, { soloActivos: true });
        } catch (error) {
            Object.assign(plan, estadoAnterior);
            await plan.save();
            if (aplicacion?._id) await eliminarAplicacionSanitariaCreada(aplicacion._id);
            throw error;
        }

        await completarTareasSanitariasPendientes(plan._id, 'Plan sanitario', req.body.fechaAplicacion || new Date());
        await sincronizarTareaPlanSanitario(planActualizado, req.usuario?.id);
        await notificarAccionSegura({
            actor: req.usuario,
            naturaleza: 'Informativa',
            tipo: 'APLICACION_SANITARIA_REGISTRADA',
            titulo: 'Aplicación sanitaria registrada',
            mensaje: `${nombreUsuario(req.usuario)} registró la aplicación de ${plan.producto} para ${animales.length} animal${animales.length === 1 ? '' : 'es'}.`,
            moduloOrigen: 'Sanidad',
            entidadTipo: 'AplicacionSanitaria',
            entidadId: aplicacion._id,
            url: `/sanidad/aplicaciones/${aplicacion._id}`,
            metadata: { naturaleza: 'Plan sanitario', planSanitarioId: plan._id, loteId: plan.lote?._id || plan.lote }
        });

        const respuesta = (await poblarPlan(PlanSanitario.findById(planActualizado._id))).toObject();
        res.json({ ...respuesta, aplicacionRegistrada: aplicacion });
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al registrar aplicacion sanitaria', error: error.message });
    }
};

planSanitarioCtrl.marcarPlanAplicado = planSanitarioCtrl.registrarAplicacionPlan;

module.exports = planSanitarioCtrl;
