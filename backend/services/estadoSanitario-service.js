const Animal = require('../models/Animal');
const EventoAnimal = require('../models/EventoAnimal');
const { notificarAccionSegura } = require('./notificacion-service');

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

const actualizarEstadoSanitarioAnimal = async (
    animalId,
    estadoNuevo,
    motivo,
    usuarioId,
    tratamientoId = null
) => {
    validarCambio(estadoNuevo, motivo);

    const animalAnterior = await Animal.findById(animalId).lean();
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
                { new: true, runValidators: true }
            );
            return { animal: animalNormalizado, evento: null, sinCambios: true };
        }
        return { animal: await Animal.findById(animalId), evento: null, sinCambios: true };
    }

    const actualizacion = {
        estadoSanitario: estadoNuevo
    };
    if (animalAnterior.estado === 'En tratamiento') actualizacion.estado = 'Activo';

    const animal = await Animal.findByIdAndUpdate(
        animalId,
        { $set: actualizacion },
        { new: true, runValidators: true }
    );

    try {
        const evento = await EventoAnimal.create({
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
        });

        await notificarAccionSegura({
            actor: usuarioId,
            naturaleza: 'Informativa',
            tipo: 'ESTADO_SANITARIO_CAMBIADO',
            titulo: 'Estado sanitario actualizado',
            mensaje: `El estado sanitario de ${animal.diio || animal.identificadorFinca || animal.nombre || 'un animal'} cambió de ${estadoAnterior} a ${estadoNuevo}.`,
            moduloOrigen: 'Sanidad',
            entidadTipo: 'Animal',
            entidadId: animal._id,
            url: `/inventario/animal/${animal._id}`,
            metadata: { estadoAnterior, estadoNuevo, motivo, tratamientoId: tratamientoId || undefined }
        });

        return {
            animal,
            evento,
            sinCambios: false,
            anteriorPersistido: {
                estado: animalAnterior.estado,
                estadoSanitario: animalAnterior.estadoSanitario,
                teniaEstadoSanitario: Object.prototype.hasOwnProperty.call(animalAnterior, 'estadoSanitario')
            }
        };
    } catch (error) {
        const restauracion = { $set: { estado: animalAnterior.estado } };
        if (Object.prototype.hasOwnProperty.call(animalAnterior, 'estadoSanitario')) {
            restauracion.$set.estadoSanitario = animalAnterior.estadoSanitario;
        } else {
            restauracion.$unset = { estadoSanitario: '' };
        }
        await Animal.collection.updateOne({ _id: animal._id }, restauracion);
        throw error;
    }
};

const actualizarEstadoSanitarioAnimales = async (
    animales,
    estadoNuevo,
    motivo,
    usuarioId,
    tratamientoId = null
) => {
    validarCambio(estadoNuevo, motivo);
    const ids = [...new Set((animales || []).map((id) => id?._id?.toString() || id?.toString()).filter(Boolean))];
    if (!ids.length) throw crearError('Debe seleccionar al menos un animal');

    const resultados = [];
    try {
        for (const animalId of ids) {
            resultados.push(await actualizarEstadoSanitarioAnimal(
                animalId,
                estadoNuevo,
                motivo,
                usuarioId,
                tratamientoId
            ));
        }
        return resultados;
    } catch (error) {
        for (const resultado of resultados.reverse()) {
            if (resultado.sinCambios || !resultado.anteriorPersistido) continue;
            const restauracion = { $set: { estado: resultado.anteriorPersistido.estado } };
            if (resultado.anteriorPersistido.teniaEstadoSanitario) {
                restauracion.$set.estadoSanitario = resultado.anteriorPersistido.estadoSanitario;
            } else {
                restauracion.$unset = { estadoSanitario: '' };
            }
            await Animal.collection.updateOne({ _id: resultado.animal._id }, restauracion);
            if (resultado.evento?._id) await EventoAnimal.findByIdAndDelete(resultado.evento._id);
        }
        throw error;
    }
};

module.exports = {
    ESTADOS_SANITARIOS,
    actualizarEstadoSanitarioAnimal,
    actualizarEstadoSanitarioAnimales,
    estadoSanitarioActual
};
