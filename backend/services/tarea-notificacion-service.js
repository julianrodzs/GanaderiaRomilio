const {
    crearNotificacion,
    nombreUsuario,
    notificarAccion
} = require('./notificacion-service');

const { normalizarId: idDe } = require('./identificador-service');

const notificarTareaAsignada = async (tarea, actor = null) => {
    const destinatario = idDe(tarea.asignadoA);
    if (!destinatario) return null;

    return crearNotificacion({
        destinatario,
        fincaId: tarea.fincaId,
        actor: idDe(actor),
        naturaleza: 'Operativa',
        tipo: 'TAREA_ASIGNADA',
        titulo: 'Tarea asignada',
        mensaje: `Se te asignó la tarea '${tarea.titulo}'.`,
        moduloOrigen: 'Tareas',
        entidadTipo: 'Tarea',
        entidadId: tarea._id,
        url: `/tareas/${tarea._id}`,
        dedupKey: `TAREA_${tarea._id}_ASIGNADA_USUARIO_${destinatario}_${tarea.asignacionVersion || new Date(tarea.createdAt || 0).getTime()}`,
        metadata: { prioridad: tarea.prioridad, fechaProgramada: tarea.fechaProgramada }
    });
};

const notificarTareaModificada = (tarea, actor) => notificarAccion({
    actor,
    fincaId: tarea.fincaId,
    naturaleza: 'Informativa',
    tipo: 'TAREA_MODIFICADA',
    titulo: 'Tarea actualizada',
    mensaje: `${nombreUsuario(actor)} modificó la tarea '${tarea.titulo}'.`,
    moduloOrigen: 'Tareas',
    entidadTipo: 'Tarea',
    entidadId: tarea._id,
    url: `/tareas/${tarea._id}`,
    metadata: { estado: tarea.estado, prioridad: tarea.prioridad }
});

const notificarTareaCompletada = (tarea, actor) => notificarAccion({
    actor,
    fincaId: tarea.fincaId,
    naturaleza: 'Informativa',
    tipo: 'TAREA_COMPLETADA',
    titulo: 'Tarea completada',
    mensaje: `${nombreUsuario(actor)} completó la tarea '${tarea.titulo}'.`,
    moduloOrigen: 'Tareas',
    entidadTipo: 'Tarea',
    entidadId: tarea._id,
    url: `/tareas/${tarea._id}`,
    metadata: { fechaCompletada: tarea.fechaCompletada }
});

const ejecutarNotificacionSegura = async (accion) => {
    try {
        return await accion();
    } catch (error) {
        console.error('No se pudo crear una notificación de tarea:', error.message);
        return null;
    }
};

const notificarTareasOrigen = async (filtro, actor) => {
    const { Tarea } = require('../models/Tarea');
    const tareas = await Tarea.find({ ...filtro, estado: { $in: ['Pendiente', 'En proceso'] } });
    for (const tarea of tareas) await ejecutarNotificacionSegura(() => notificarTareaAsignada(tarea, actor));
};

const notificarComentarioTarea = async (tarea, actor, comentarioId) => {
    const actorId = idDe(actor);
    const destinatarios = [...new Set([idDe(tarea.asignadoA), idDe(tarea.creadoPor)].filter((id) => id && id !== actorId))];
    for (const destinatario of destinatarios) await crearNotificacion({
        destinatario, actor: actorId, fincaId: tarea.fincaId,
        naturaleza: 'Informativa', tipo: 'TAREA_COMENTARIO', titulo: 'Nuevo comentario',
        mensaje: `${nombreUsuario(actor)} comentó la tarea '${tarea.titulo}'.`,
        entidadTipo: 'Tarea', entidadId: tarea._id, moduloOrigen: 'Tareas', url: `/tareas/${tarea._id}`,
        dedupKey: `TAREA_${tarea._id}_COMENTARIO_${comentarioId}`
    });
};

module.exports = {
    notificarTareasOrigen,
    notificarComentarioTarea,
    ejecutarNotificacionSegura,
    notificarTareaAsignada,
    notificarTareaCompletada,
    notificarTareaModificada
};
