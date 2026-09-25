const {
    crearNotificacion,
    nombreUsuario,
    notificarAccion
} = require('./notificacion-service');

const idDe = (valor) => valor?._id?.toString() || valor?.toString() || null;

const notificarTareaAsignada = async (tarea, actor = null) => {
    const destinatario = idDe(tarea.asignadoA);
    if (!destinatario) return null;

    return crearNotificacion({
        destinatario,
        actor: idDe(actor),
        naturaleza: 'Operativa',
        tipo: 'TAREA_ASIGNADA',
        titulo: 'Tarea asignada',
        mensaje: `Se te asignó la tarea '${tarea.titulo}'.`,
        moduloOrigen: 'Tareas',
        entidadTipo: 'Tarea',
        entidadId: tarea._id,
        url: `/tareas/${tarea._id}`,
        dedupKey: `TAREA_${tarea._id}_ASIGNADA_USUARIO_${destinatario}`,
        metadata: { prioridad: tarea.prioridad, fechaProgramada: tarea.fechaProgramada }
    });
};

const notificarTareaModificada = (tarea, actor) => notificarAccion({
    actor,
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
    naturaleza: 'Informativa',
    tipo: 'TAREA_COMPLETADA',
    titulo: 'Tarea completada',
    mensaje: `${nombreUsuario(actor)} completó la tarea '${tarea.titulo}'.`,
    moduloOrigen: 'Tareas',
    entidadTipo: 'Tarea',
    entidadId: tarea._id,
    url: `/tareas/${tarea._id}`,
    metadata: { fechaCompletada: tarea.fechaCompletada, evidenciaUrl: tarea.evidenciaUrl }
});

const ejecutarNotificacionSegura = async (accion) => {
    try {
        return await accion();
    } catch (error) {
        console.error('No se pudo crear una notificación de tarea:', error.message);
        return null;
    }
};

module.exports = {
    ejecutarNotificacionSegura,
    notificarTareaAsignada,
    notificarTareaCompletada,
    notificarTareaModificada
};
