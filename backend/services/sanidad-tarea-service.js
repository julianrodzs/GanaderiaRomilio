const { obtenerOrganizacionActual } = require('../context/organizacion-context');
const { Membresia } = require('../models/Membresia');
const { Tarea } = require('../models/Tarea');
const {
    ejecutarNotificacionSegura,
    notificarTareaAsignada
} = require('./tarea-notificacion-service');

const fechaKey = (fecha) => new Date(fecha).toISOString().slice(0, 10);

const resolverAsignado = async (usuarioPreferido, session = null) => {
    if (!usuarioPreferido) return null;
    let consulta = Membresia.findOne({
        organizacionId: obtenerOrganizacionActual(),
        usuario: usuarioPreferido,
        estado: 'Activo'
    });
    if (session) consulta = consulta.session(session);
    const membresia = await consulta.populate({ path: 'usuario', match: { estado: 'Activo' }, select: '_id' });
    return membresia?.usuario?._id || null;
};

const cancelarTareasDistintas = async ({ referenciaId, categoriaAutomatica, claveActual, session = null }) => {
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
        },
        session ? { session } : {}
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
    usuarioId,
    session = null,
    omitirNotificacion = false
}) => {
    if (!fechaProgramada) return null;
    const asignadoA = await resolverAsignado(asignadoPreferido, session);
    if (!asignadoA) {
        console.warn(`No se creó tarea sanitaria para ${referenciaId}: no hay usuario activo asignable.`);
        return null;
    }

    const claveAutomatica = `${clavePrefijo}-${fechaKey(fechaProgramada)}`;
    let consultaExacta = Tarea.findOne({ referenciaId, moduloOrigen: 'Sanidad', claveAutomatica });
    if (session) consultaExacta = consultaExacta.session(session);
    let tarea = await consultaExacta;
    if (!tarea) {
        let consultaPendiente = Tarea.findOne({
            referenciaId,
            moduloOrigen: 'Sanidad',
            categoriaAutomatica,
            estado: { $in: ['Pendiente', 'En proceso'] }
        }).sort({ createdAt: -1 });
        if (session) consultaPendiente = consultaPendiente.session(session);
        tarea = await consultaPendiente;
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
    await tarea.save(session ? { session } : {});
    await cancelarTareasDistintas({ referenciaId, categoriaAutomatica, claveActual: claveAutomatica, session });

    if (esNueva && !omitirNotificacion) {
        await ejecutarNotificacionSegura(() => notificarTareaAsignada(tarea, usuarioId));
    }
    return tarea;
};

const sincronizarTareaPlanSanitario = (plan, usuarioId, opciones = {}) => crearOActualizarTarea({
    referenciaId: plan._id,
    fechaProgramada: plan.proximaAplicacion,
    categoriaAutomatica: 'Plan sanitario',
    clavePrefijo: 'plan-sanitario',
    titulo: `Aplicar ${plan.producto}`,
    descripcion: `${plan.actividad} para ${plan.grupoGanado}.`,
    especie: plan.especie || 'Bovino',
    animal: plan.animales?.length === 1 ? plan.animales[0]?._id || plan.animales[0] : null,
    asignadoPreferido: plan.asignadoA,
    usuarioId,
    ...opciones
});

const obtenerFechaTareaTratamiento = (tratamiento) => (
    Number(tratamiento.aplicacionesRealizadas || 0) === 0
        ? tratamiento.fechaInicio
        : tratamiento.proximaAplicacion
);

const sincronizarTareaTratamiento = (tratamiento, usuarioId, opciones = {}) => {
    const fechaProgramada = obtenerFechaTareaTratamiento(tratamiento);
    if (tratamiento.estado !== 'Activo' || !fechaProgramada) {
        return cancelarTareasSanitariasPendientes(
            tratamiento._id,
            'Tratamiento sanitario',
            'Tratamiento finalizado o sin próxima aplicación.',
            opciones
        );
    }
    return crearOActualizarTarea({
        referenciaId: tratamiento._id,
        fechaProgramada,
        categoriaAutomatica: 'Tratamiento sanitario',
        clavePrefijo: 'tratamiento-sanitario',
        titulo: `Aplicar ${tratamiento.producto}`,
        descripcion: `${tratamiento.motivo}. Aplicación ${tratamiento.aplicacionesRealizadas + 1} de ${tratamiento.cantidadAplicaciones}.`,
        especie: tratamiento.especie,
        animal: tratamiento.animales?.length === 1 ? tratamiento.animales[0]?._id || tratamiento.animales[0] : null,
        asignadoPreferido: tratamiento.asignadoA,
        usuarioId,
        ...opciones
    });
};

const completarTareasSanitariasPendientes = (referenciaId, categoriaAutomatica, fecha = new Date(), opciones = {}) => Tarea.updateMany(
    {
        referenciaId,
        moduloOrigen: 'Sanidad',
        categoriaAutomatica,
        estado: { $in: ['Pendiente', 'En proceso'] }
    },
    { $set: { estado: 'Completada', fechaCompletada: fecha } },
    opciones.session ? { session: opciones.session } : {}
);

const cancelarTareasSanitariasPendientes = (referenciaId, categoriaAutomatica, motivo, opciones = {}) => Tarea.updateMany(
    {
        referenciaId,
        moduloOrigen: 'Sanidad',
        categoriaAutomatica,
        estado: { $in: ['Pendiente', 'En proceso'] }
    },
    { $set: { estado: 'Cancelada', observaciones: motivo } },
    opciones.session ? { session: opciones.session } : {}
);

module.exports = {
    cancelarTareasSanitariasPendientes,
    completarTareasSanitariasPendientes,
    obtenerFechaTareaTratamiento,
    sincronizarTareaPlanSanitario,
    sincronizarTareaTratamiento
};
