const Animal = require('../models/Animal');
const EventoAnimal = require('../models/EventoAnimal');
const { notificarAccionSegura } = require('./notificacion-service');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');

const ESTADOS_SANITARIOS = ['Sano', 'En observación', 'Enfermo', 'Recuperación'];

const crearError = (mensaje, status = 400) => {
    const error = new Error(mensaje);
    error.status = status;
    return error;
};

const validarCambio = (estadoNuevo, motivo) => {
    if (!ESTADOS_SANITARIOS.includes(estadoNuevo)) {
        throw crearError('Estado sanitario no válido');
    }

    if (!String(motivo || '').trim()) {
        throw crearError('El motivo del cambio de estado sanitario es requerido');
    }
};

const estadoSanitarioActual = (animal) => {
    if (animal.estadoSanitario) return animal.estadoSanitario;
    return animal.estado === 'En tratamiento' ? 'Enfermo' : 'Sano';
};

const actualizarEstadoSanitarioAnimalEnSession = async (
    animalId,
    estadoNuevo,
    motivo,
    usuarioId,
    tratamientoId,
    session
) => {
    validarCambio(estadoNuevo, motivo);

    const animalAnterior = await Animal.findById(animalId).session(session).lean();
    if (!animalAnterior) throw crearError('Animal no encontrado', 404);
    if (!['Activo', 'En tratamiento'].includes(animalAnterior.estado)) {
        throw crearError('Solo se puede cambiar el estado sanitario de animales activos');
    }

    const estadoAnterior = estadoSanitarioActual(animalAnterior);
    if (estadoAnterior === estadoNuevo) {
        if (animalAnterior.estado === 'En tratamiento') {
            const animalNormalizado = await Animal.findByIdAndUpdate(
                animalId,
                { $set: { estado: 'Activo', estadoSanitario: estadoNuevo } },
                { new: true, runValidators: true, session }
            );
            return { animal: animalNormalizado, evento: null, sinCambios: true };
        }
        return { animal: await Animal.findById(animalId).session(session), evento: null, sinCambios: true };
    }

    const actualizacion = {
        estadoSanitario: estadoNuevo
    };
    if (animalAnterior.estado === 'En tratamiento') actualizacion.estado = 'Activo';

    const animal = await Animal.findByIdAndUpdate(
        animalId,
        { $set: actualizacion },
        { new: true, runValidators: true, session }
    );

    const [evento] = await EventoAnimal.create([{
            animal: animalId,
            tipoEvento: 'Sanidad',
            fecha: new Date(),
            titulo: 'Cambio de estado sanitario',
            descripcion: `Estado sanitario cambiado de ${estadoAnterior} a ${estadoNuevo}. Motivo: ${String(motivo).trim()}.`,
            moduloOrigen: 'Sanidad',
            referenciaId: tratamientoId || undefined,
            creadoPor: usuarioId,
            metadata: {
                tipoCambio: 'Estado sanitario',
                estadoAnterior,
                estadoNuevo,
                motivo: String(motivo).trim(),
                tratamientoId: tratamientoId || undefined
            }
        }], { session });

    return { animal, evento, sinCambios: false, estadoAnterior, estadoNuevo, motivo };
};

const notificarCambio = (resultado, usuarioId, tratamientoId) => {
    if (!resultado || resultado.sinCambios) return Promise.resolve();
    return notificarAccionSegura({
        actor: usuarioId,
        naturaleza: 'Informativa',
        tipo: 'ESTADO_SANITARIO_CAMBIADO',
        titulo: 'Estado sanitario actualizado',
        mensaje: `El estado sanitario de ${resultado.animal.diio || resultado.animal.identificadorFinca || resultado.animal.nombre || 'un animal'} cambió de ${resultado.estadoAnterior} a ${resultado.estadoNuevo}.`,
        moduloOrigen: 'Sanidad',
        entidadTipo: 'Animal',
        entidadId: resultado.animal._id,
        url: `/inventario/animal/${resultado.animal._id}`,
        metadata: {
            estadoAnterior: resultado.estadoAnterior,
            estadoNuevo: resultado.estadoNuevo,
            motivo: resultado.motivo,
            tratamientoId: tratamientoId || undefined
        }
    });
};

const actualizarEstadoSanitarioAnimal = async (
    animalId,
    estadoNuevo,
    motivo,
    usuarioId,
    tratamientoId = null,
    opciones = {}
) => {
    const ejecutar = (session) => actualizarEstadoSanitarioAnimalEnSession(
        animalId, estadoNuevo, motivo, usuarioId, tratamientoId, session
    );
    const resultado = opciones.session
        ? await ejecutar(opciones.session)
        : await ejecutarEnTransaccion(ejecutar);
    if (!opciones.omitirNotificacion) await notificarCambio(resultado, usuarioId, tratamientoId);
    return resultado;
};

const actualizarEstadoSanitarioAnimales = async (
    animales,
    estadoNuevo,
    motivo,
    usuarioId,
    tratamientoId = null,
    opciones = {}
) => {
    validarCambio(estadoNuevo, motivo);
    const ids = [...new Set((animales || []).map((id) => id?._id?.toString() || id?.toString()).filter(Boolean))];
    if (!ids.length) throw crearError('Debe seleccionar al menos un animal');

    const ejecutar = async (session) => {
        const resultados = [];
        for (const animalId of ids) {
            resultados.push(await actualizarEstadoSanitarioAnimalEnSession(
                animalId, estadoNuevo, motivo, usuarioId, tratamientoId, session
            ));
        }
        return resultados;
    };

    const resultados = opciones.session
        ? await ejecutar(opciones.session)
        : await ejecutarEnTransaccion(ejecutar);
    if (!opciones.omitirNotificacion) {
        await Promise.all(resultados.map((resultado) => notificarCambio(resultado, usuarioId, tratamientoId)));
    }
    return resultados;
};

module.exports = {
    ESTADOS_SANITARIOS,
    actualizarEstadoSanitarioAnimal,
    actualizarEstadoSanitarioAnimales,
    estadoSanitarioActual
};
