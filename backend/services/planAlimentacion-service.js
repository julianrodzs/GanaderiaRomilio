const PlanAlimentacion = require('../models/PlanAlimentacion');
const AsignacionPlanAlimentacion = require('../models/AsignacionPlanAlimentacion');
const Lote = require('../models/Lote');
const EventoLote = require('../models/EventoLote');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');

const crearError = (mensaje, status = 400, codigo) => Object.assign(new Error(mensaje), { status, codigo });

const validarCompatibilidadPlanLote = (plan, lote) => {
    if (!plan.activo) throw crearError('El plan está inactivo y no admite nuevas asignaciones.', 409, 'PLAN_INACTIVO');
    if (lote.estado !== 'ACTIVO') throw crearError(`El lote ${lote.codigo} no está activo.`, 409, 'LOTE_INACTIVO');
    if (plan.especie !== lote.especie) throw crearError(`El lote ${lote.codigo} no corresponde a la especie del plan.`, 409, 'ESPECIE_INCOMPATIBLE');
    if (plan.proposito !== lote.proposito) throw crearError(`El propósito del lote ${lote.codigo} no coincide con el plan.`, 409, 'PROPOSITO_INCOMPATIBLE');
};

const asignarPlanALotes = async (planId, datos = {}, usuarioId, opciones = {}) => {
    if (!opciones.session) {
        return ejecutarEnTransaccion((session) => asignarPlanALotes(planId, datos, usuarioId, { session }));
    }
    const { session } = opciones;
    const plan = await PlanAlimentacion.findById(planId).session(session);
    if (!plan) throw crearError('Plan de alimentación no encontrado.', 404);
    const ids = [...new Set((datos.lotes || []).map(String))];
    if (!ids.length) throw crearError('Selecciona al menos un lote.');
    const lotes = await Lote.find({ _id: { $in: ids } }).session(session);
    if (lotes.length !== ids.length) throw crearError('Uno o más lotes no existen.', 404);
    lotes.forEach((lote) => validarCompatibilidadPlanLote(plan, lote));

    const fechaInicio = new Date(datos.fechaInicio || Date.now());
    if (Number.isNaN(fechaInicio.getTime())) throw crearError('La fecha inicial de la asignación no es válida.');
    const resultados = [];
    for (const lote of lotes) {
        if (lote.fechaInicio && fechaInicio < new Date(lote.fechaInicio)) {
            throw crearError(`El plan no puede iniciar antes que el lote ${lote.codigo}.`, 400, 'FECHA_ASIGNACION_INVALIDA');
        }
        const anterior = await AsignacionPlanAlimentacion.findOne({ lote: lote._id, activo: true }).session(session);
        if (anterior && String(anterior.plan) === String(plan._id)) {
            resultados.push(anterior);
            continue;
        }
        if (anterior && fechaInicio < new Date(anterior.fechaInicio)) {
            throw crearError(`El plan no puede iniciar antes que la asignación vigente del lote ${lote.codigo}.`, 400, 'FECHA_ASIGNACION_INVALIDA');
        }
        if (anterior) {
            anterior.activo = false;
            anterior.fechaFin = fechaInicio;
            await anterior.save({ session });
        }
        const [asignacion] = await AsignacionPlanAlimentacion.create([{
            plan: plan._id,
            lote: lote._id,
            fechaInicio,
            observaciones: datos.observaciones,
            asignadoPor: usuarioId
        }], { session });
        await EventoLote.create([{
            lote: lote._id,
            tipo: anterior ? 'PLAN_ALIMENTACION_CAMBIADO' : 'PLAN_ALIMENTACION_ASIGNADO',
            fecha: fechaInicio,
            titulo: anterior ? 'Plan de alimentación cambiado' : 'Plan de alimentación asignado',
            descripcion: plan.nombre,
            referenciaId: asignacion._id,
            entidadTipo: 'AsignacionPlanAlimentacion',
            registradoPor: usuarioId,
            metadata: { planId: plan._id, planAnteriorId: anterior?.plan || null }
        }], { session });
        resultados.push(asignacion);
    }
    return resultados;
};

const cambiarEstadoPlan = async (plan, datos = {}) => {
    if (datos.activo === false && plan.activo !== false) {
        const asignacionesActivas = await AsignacionPlanAlimentacion.countDocuments({ plan: plan._id, activo: true });
        if (asignacionesActivas > 0 && !datos.confirmarDesactivacion) {
            throw crearError(
                `El plan está asignado a ${asignacionesActivas} lote(s) activo(s). Confirma la desactivación; las asignaciones históricas se conservarán.`,
                409,
                'PLAN_CON_ASIGNACIONES'
            );
        }
    }
};

module.exports = { asignarPlanALotes, cambiarEstadoPlan, validarCompatibilidadPlanLote };
