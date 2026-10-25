const planSanitarioCtrl = {};

const {
    PlanSanitario,
    calcularEstadoPlanSanitario
} = require('../models/PlanSanitario');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const {
    crearAplicacionSanitaria,
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
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { sanitizarAplicacionSanitaria, sanitizarPlanSanitario } = require('../services/sanidad-dto-service');

const poblarPlan = (query) => query
    .populate('animales', 'diio identificadorFinca nombre especie estado')
    .populate('lote', 'codigo nombre especie estado')
    .populate('asignadoA', 'nombre apellido correo rol estado');

const prepararAlcancePlan = async (datos, especiePredeterminada = 'Bovino', session = null) => {
    const preparados = { ...datos };
    const especie = preparados.especie || especiePredeterminada;
    if (preparados.lote) {
        const alcance = await resolverAlcanceSanitario(
            { lote: preparados.lote, especie },
            { soloActivos: true, session }
        );
        preparados.lote = alcance.lote._id;
        preparados.grupoGanado = `Lote ${alcance.lote.codigo}`;
        preparados.animales = [];
        preparados.animalDiio = '';
    } else {
        if (Object.prototype.hasOwnProperty.call(preparados, 'lote')) preparados.lote = null;
        if (preparados.animales?.length) {
            await validarAnimalesSanidad(preparados.animales, especie, { soloActivos: true, session });
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
            PlanSanitario.find({
                ...crearFiltroEspecie(req.query.especie),
                ...(req.query.incluirArchivados === 'true' ? {} : { archivado: { $ne: true } })
            }).sort({ proximaAplicacion: 1 })
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
        const payload = sanitizarPlanSanitario(req.body);
        await validarUsuarioAsignable(payload.asignadoA, 'Sanidad');
        const planId = await ejecutarEnTransaccion(async (session) => {
            const datos = await prepararAlcancePlan(payload, 'Bovino', session);
            const [nuevoPlan] = await PlanSanitario.create([{
                ...datos,
                creadoPor: req.usuario?.id
            }], { session, ordered: true });
            await sincronizarTareaPlanSanitario(nuevoPlan, req.usuario?.id, {
                session,
                omitirNotificacion: true
            });
            return nuevoPlan._id;
        });
        res.status(201).json(await poblarPlan(PlanSanitario.findById(planId)));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear plan sanitario', error: error.message });
    }
};

planSanitarioCtrl.getAlertasPlanSanitario = async (req, res) => {
    try {
        const planes = await PlanSanitario.find({
            ...crearFiltroEspecie(req.query.especie),
            archivado: { $ne: true },
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
        const payload = sanitizarPlanSanitario(req.body);
        const plan = await PlanSanitario.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({ mensaje: 'Plan sanitario no encontrado' });
        }

        const datos = await prepararAlcancePlan(payload, plan.especie);
        if (Object.prototype.hasOwnProperty.call(payload, 'asignadoA')) {
            await validarUsuarioAsignable(payload.asignadoA, 'Sanidad');
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
        await ejecutarEnTransaccion(async (session) => {
            const plan = await PlanSanitario.findById(req.params.id).session(session);
            if (!plan) {
                const error = new Error('Plan sanitario no encontrado');
                error.status = 404;
                throw error;
            }
            const tieneHistorial = await AplicacionSanitaria.exists({ planSanitario: plan._id }).session(session);
            if (tieneHistorial) {
                const error = new Error('El plan tiene aplicaciones históricas y no puede eliminarse. Archívalo dejando de programar nuevas aplicaciones.');
                error.status = 409;
                error.code = 'PLAN_SANITARIO_CON_HISTORIAL';
                throw error;
            }
            await PlanSanitario.deleteOne({ _id: plan._id }, { session });
            await cancelarTareasSanitariasPendientes(
                plan._id,
                'Plan sanitario',
                'Plan sanitario eliminado.',
                { session }
            );
        });

        res.json({ mensaje: 'Plan sanitario eliminado' });
    } catch (error) {
        res.status(error.status || 500).json({
            codigo: error.code,
            mensaje: error.message || 'Error al eliminar plan sanitario',
            error: error.message
        });
    }
};

planSanitarioCtrl.archivarPlanSanitario = async (req, res) => {
    try {
        const planId = await ejecutarEnTransaccion(async (session) => {
            const plan = await PlanSanitario.findById(req.params.id).session(session);
            if (!plan) {
                const error = new Error('Plan sanitario no encontrado');
                error.status = 404;
                throw error;
            }
            plan.archivado = true;
            await plan.save({ session });
            await cancelarTareasSanitariasPendientes(
                plan._id,
                'Plan sanitario',
                'Plan sanitario archivado.',
                { session }
            );
            return plan._id;
        });
        const plan = await PlanSanitario.findById(planId);
        res.json({ mensaje: 'Plan sanitario archivado', plan });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al archivar plan sanitario', error: error.message });
    }
};

planSanitarioCtrl.registrarAplicacionPlan = async (req, res) => {
    try {
        const datos = sanitizarAplicacionSanitaria(req.body);
        const claveIdempotencia = String(req.get('Idempotency-Key') || '').trim();
        if (claveIdempotencia.length > 160) {
            return res.status(400).json({ mensaje: 'La clave de idempotencia no es válida' });
        }
        const responsable = await validarUsuarioAsignable(datos.responsableUsuario, 'Sanidad');
        const responsableNombre = [responsable.nombre, responsable.apellido].filter(Boolean).join(' ') || responsable.correo;
        const resultado = await ejecutarEnTransaccion(async (session) => {
            if (claveIdempotencia) {
                const existente = await AplicacionSanitaria.findOne({ claveIdempotencia })
                    .select('+claveIdempotencia')
                    .session(session);
                if (existente) {
                    if (String(existente.planSanitario || '') !== String(req.params.id)) {
                        const error = new Error('La clave de idempotencia ya fue utilizada en otra operación sanitaria');
                        error.status = 409;
                        throw error;
                    }
                    const planExistente = await PlanSanitario.findById(req.params.id).session(session);
                    return { plan: planExistente, aplicacion: existente, replay: true, cantidadAnimales: existente.animales.length };
                }
            }

            const plan = await PlanSanitario.findById(req.params.id).session(session);
            if (!plan) {
                const error = new Error('Plan sanitario no encontrado');
                error.status = 404;
                throw error;
            }
            if (plan.archivado) {
                const error = new Error('Un plan archivado no puede recibir nuevas aplicaciones');
                error.status = 409;
                throw error;
            }
            const animales = await obtenerAnimalesParaPlan(plan, session);
            if (!animales.length) {
                const error = new Error('El plan no tiene animales identificables. Seleccione un lote con animales, animales específicos o use Todo el ganado.');
                error.status = 400;
                throw error;
            }

            plan.fechaAplicacion = datos.fechaAplicacion || new Date();
            if (datos.observaciones) plan.observaciones = datos.observaciones;
            if (datos.viaAplicacion) plan.viaAplicacion = datos.viaAplicacion;
            await plan.save({ session });
            const numeroAplicacion = await AplicacionSanitaria.countDocuments({
                naturaleza: 'Plan sanitario',
                planSanitario: plan._id
            }).session(session) + 1;
            const aplicacion = await crearAplicacionSanitaria({
                animales: animales.map((animal) => animal._id),
                especie: plan.especie || 'Bovino',
                fechaAplicacion: plan.fechaAplicacion,
                producto: plan.producto,
                tipo: plan.actividad,
                dosis: datos.dosis || plan.dosis,
                viaAplicacion: datos.viaAplicacion || plan.viaAplicacion,
                diasRetiroCarne: datos.diasRetiroCarne,
                responsable: responsableNombre,
                responsableUsuario: responsable._id,
                motivo: `Aplicación programada para ${plan.grupoGanado}`,
                observaciones: datos.observaciones || plan.observaciones,
                naturaleza: 'Plan sanitario',
                planSanitario: plan._id,
                lote: plan.lote?._id || plan.lote,
                numeroAplicacion,
                claveIdempotencia: claveIdempotencia || undefined
            }, req.usuario?.id, { soloActivos: true, session });
            await completarTareasSanitariasPendientes(
                plan._id,
                'Plan sanitario',
                aplicacion.fechaAplicacion,
                { session }
            );
            await sincronizarTareaPlanSanitario(plan, req.usuario?.id, {
                session,
                omitirNotificacion: true
            });
            return { plan, aplicacion, replay: false, cantidadAnimales: animales.length };
        });

        if (!resultado.replay) {
            await notificarAccionSegura({
                actor: req.usuario,
                naturaleza: 'Informativa',
                tipo: 'APLICACION_SANITARIA_REGISTRADA',
                titulo: 'Aplicación sanitaria registrada',
                mensaje: `${nombreUsuario(req.usuario)} registró la aplicación de ${resultado.plan.producto} para ${resultado.cantidadAnimales} animal${resultado.cantidadAnimales === 1 ? '' : 'es'}.`,
                moduloOrigen: 'Sanidad',
                entidadTipo: 'AplicacionSanitaria',
                entidadId: resultado.aplicacion._id,
                url: `/sanidad/aplicaciones/${resultado.aplicacion._id}`,
                metadata: {
                    naturaleza: 'Plan sanitario',
                    planSanitarioId: resultado.plan._id,
                    loteId: resultado.plan.lote?._id || resultado.plan.lote
                }
            });
        } else {
            res.set('X-Idempotent-Replay', 'true');
        }

        const respuesta = (await poblarPlan(PlanSanitario.findById(resultado.plan._id))).toObject();
        res.json({ ...respuesta, aplicacionRegistrada: resultado.aplicacion });
    } catch (error) {
        const duplicada = error?.code === 11000;
        res.status(error.status || (duplicada ? 409 : 400)).json({
            mensaje: duplicada ? 'Esta aplicación ya fue registrada' : (error.message || 'Error al registrar aplicación sanitaria'),
            error: error.message
        });
    }
};

planSanitarioCtrl.marcarPlanAplicado = planSanitarioCtrl.registrarAplicacionPlan;

module.exports = planSanitarioCtrl;
