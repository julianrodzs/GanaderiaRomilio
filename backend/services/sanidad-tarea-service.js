const Usuario = require('../models/Usuario');
const { Tarea } = require('../models/Tarea');
const {
    ejecutarNotificacionSegura,
    notificarTareaAsignada
} = require('./tarea-notificacion-service');

const fechaKey = (fecha) => new Date(fecha).toISOString().slice(0, 10);

const resolverAsignado = async (usuarioPreferido) => {
    if (!usuarioPreferido) return null;
    const usuario = await Usuario.findOne({ _id: usuarioPreferido, estado: 'Activo' }).select('_id');
    return usuario?._id || null;
};

const cancelarTareasDistintas = async ({ referenciaId, categoriaAutomatica, claveActual }) => {
    await Tarea.updateMany(
        {
            referenciaId,
            moduloOrigen: 'Sanidad',
            categoriaAutomatica,
            claveAutomatica: { $ne: claveActual },
            estado: { $in: ['Pendiente', 'En proceso'] }
        },
        {
            $set: {
                estado: 'Cancelada',
                observaciones: 'Cancelada automáticamente por reprogramación sanitaria.'
            }
        }
    );
};

const crearOActualizarTarea = async ({
    referenciaId,
    fechaProgramada,
    categoriaAutomatica,
    clavePrefijo,
    titulo,
    descripcion,
    especie,
    animal,
    asignadoPreferido,
    usuarioId
}) => {
    if (!fechaProgramada) return null;
    const asignadoA = await resolverAsignado(asignadoPreferido);
    if (!asignadoA) {
        console.warn(`No se creó tarea sanitaria para ${referenciaId}: no hay usuario activo asignable.`);
        return null;
    }

    const claveAutomatica = `${clavePrefijo}-${fechaKey(fechaProgramada)}`;
    let tarea = await Tarea.findOne({ referenciaId, moduloOrigen: 'Sanidad', claveAutomatica });
    if (!tarea) {
        tarea = await Tarea.findOne({
            referenciaId,
            moduloOrigen: 'Sanidad',
            categoriaAutomatica,
            estado: { $in: ['Pendiente', 'En proceso'] }
        }).sort({ createdAt: -1 });
    }
    const esNueva = !tarea;
    if (!tarea) tarea = new Tarea({ referenciaId, moduloOrigen: 'Sanidad', claveAutomatica });

    const responsableActual = tarea.asignadoA;
    const estadoActual = tarea.estado;

    Object.assign(tarea, {
        titulo,
        descripcion,
        tipo: 'Sanidad',
        estado: esNueva ? 'Pendiente' : estadoActual,
        prioridad: 'Media',
        fechaProgramada,
        fechaLimite: fechaProgramada,
        asignadoA,
        creadoPor: tarea.creadoPor || usuarioId || asignadoA,
        animal: animal || null,
        creadoAutomaticamente: true,
        especie,
        categoriaAutomatica,
        claveAutomatica,
        generaBitacora: false
    });
    if (tarea.asignacionModificadaManualmente) tarea.asignadoA = responsableActual;
    await tarea.save();
    await cancelarTareasDistintas({ referenciaId, categoriaAutomatica, claveActual: claveAutomatica });

    if (esNueva) {
        await ejecutarNotificacionSegura(() => notificarTareaAsignada(tarea, usuarioId));
    }
    return tarea;
};

const sincronizarTareaPlanSanitario = (plan, usuarioId) => crearOActualizarTarea({
    referenciaId: plan._id,
    fechaProgramada: plan.proximaAplicacion,
    categoriaAutomatica: 'Plan sanitario',
    clavePrefijo: 'plan-sanitario',
    titulo: `Aplicar ${plan.producto}`,
    descripcion: `${plan.actividad} para ${plan.grupoGanado}.`,
    especie: plan.especie || 'Bovino',
    animal: plan.animales?.length === 1 ? plan.animales[0]?._id || plan.animales[0] : null,
    asignadoPreferido: plan.asignadoA,
    usuarioId
});

const sincronizarTareaTratamiento = (tratamiento, usuarioId) => {
    if (tratamiento.estado !== 'Activo' || !tratamiento.proximaAplicacion) {
        return cancelarTareasSanitariasPendientes(tratamiento._id, 'Tratamiento sanitario', 'Tratamiento finalizado o sin próxima aplicación.');
    }
    return crearOActualizarTarea({
        referenciaId: tratamiento._id,
        fechaProgramada: tratamiento.proximaAplicacion,
        categoriaAutomatica: 'Tratamiento sanitario',
        clavePrefijo: 'tratamiento-sanitario',
        titulo: `Aplicar ${tratamiento.producto}`,
        descripcion: `${tratamiento.motivo}. Aplicación ${tratamiento.aplicacionesRealizadas + 1} de ${tratamiento.cantidadAplicaciones}.`,
        especie: tratamiento.especie,
        animal: tratamiento.animales?.length === 1 ? tratamiento.animales[0]?._id || tratamiento.animales[0] : null,
        asignadoPreferido: tratamiento.asignadoA,
        usuarioId
    });
};

const completarTareasSanitariasPendientes = (referenciaId, categoriaAutomatica, fecha = new Date()) => Tarea.updateMany(
    {
        referenciaId,
        moduloOrigen: 'Sanidad',
        categoriaAutomatica,
        estado: { $in: ['Pendiente', 'En proceso'] }
    },
    { $set: { estado: 'Completada', fechaCompletada: fecha } }
);

const cancelarTareasSanitariasPendientes = (referenciaId, categoriaAutomatica, motivo) => Tarea.updateMany(
    {
        referenciaId,
        moduloOrigen: 'Sanidad',
        categoriaAutomatica,
        estado: { $in: ['Pendiente', 'En proceso'] }
    },
    { $set: { estado: 'Cancelada', observaciones: motivo } }
);

module.exports = {
    cancelarTareasSanitariasPendientes,
    completarTareasSanitariasPendientes,
    sincronizarTareaPlanSanitario,
    sincronizarTareaTratamiento
};
