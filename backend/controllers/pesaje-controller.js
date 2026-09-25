const pesajeCtrl = {};

const Pesaje = require('../models/Pesaje');
const Animal = require('../models/Animal');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('../services/eventoAnimal-service');
const { nombreUsuario, notificarAccionSegura } = require('../services/notificacion-service');

const poblarPesaje = (query) => query
    .populate('animal')
    .populate('registradoPor', 'nombre apellido correo rol');

const actualizarPesoActualAnimal = async (animalId) => {
    if (!animalId) return;

    const ultimoPesaje = await Pesaje.findOne({ animal: animalId }).sort({ fecha: -1, createdAt: -1 });
    await Animal.findByIdAndUpdate(animalId, {
        pesoActual: ultimoPesaje?.peso || null
    });
};

const registrarEventoPesaje = async (pesaje, usuarioId) => {
    if (!pesaje?.animal) return;

    await upsertEventoAnimal({
        animal: pesaje.animal,
        tipoEvento: 'Pesaje',
        fecha: pesaje.fecha || new Date(),
        titulo: 'Pesaje registrado',
        descripcion: `Peso registrado: ${pesaje.peso} kg${pesaje.observaciones ? `. ${pesaje.observaciones}` : ''}`,
        moduloOrigen: 'Pesajes',
        referenciaId: pesaje._id,
        creadoPor: usuarioId,
        metadata: {
            pesoKg: pesaje.peso
        }
    });
};

const validarPesaje = async ({ animal, peso }) => {
    if (!animal) return { valido: false, status: 400, mensaje: 'El animal es requerido' };
    const animalEncontrado = await Animal.findById(animal);
    if (!animalEncontrado) return { valido: false, status: 404, mensaje: 'Animal no encontrado' };
    if (!Number.isFinite(Number(peso)) || Number(peso) <= 0) {
        return { valido: false, status: 400, mensaje: 'El peso debe ser mayor que cero' };
    }
    return { valido: true, animal: animalEncontrado };
};

const obtenerFiltroPesajes = async (especie) => {
    if (!['Bovino', 'Porcino'].includes(especie)) return {};
    const filtro = especie === 'Bovino'
        ? { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] }
        : { especie };
    const animales = await Animal.find(filtro).select('_id');
    return { animal: { $in: animales.map((animal) => animal._id) } };
};

pesajeCtrl.getPesajes = async (req, res) => {
    try {
        const filtro = await obtenerFiltroPesajes(req.query.especie);
        const pesajes = await poblarPesaje(Pesaje.find(filtro).sort({ fecha: -1, createdAt: -1 }));
        res.json(pesajes);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener pesajes', error: error.message });
    }
};

pesajeCtrl.createPesaje = async (req, res) => {
    try {
        const validacion = await validarPesaje(req.body);
        if (!validacion.valido) {
            return res.status(validacion.status).json({ mensaje: validacion.mensaje });
        }

        const nuevoPesaje = new Pesaje({
            ...req.body,
            peso: Number(req.body.peso),
            registradoPor: req.usuario?.id
        });
        const pesajeGuardado = await nuevoPesaje.save();
        await registrarEventoPesaje(pesajeGuardado, req.usuario?.id);
        await actualizarPesoActualAnimal(pesajeGuardado.animal);
        const pesaje = await poblarPesaje(Pesaje.findById(pesajeGuardado._id));
        await notificarAccionSegura({
            actor: req.usuario,
            naturaleza: 'Informativa',
            tipo: 'PESAJE_REGISTRADO',
            titulo: 'Pesaje registrado',
            mensaje: `${nombreUsuario(req.usuario)} registró un pesaje de ${pesaje.peso} kg para ${pesaje.animal?.diio || pesaje.animal?.identificadorFinca || pesaje.animal?.nombre || 'un animal'}.`,
            moduloOrigen: 'Pesajes',
            entidadTipo: 'Animal',
            entidadId: pesaje.animal?._id || pesaje.animal,
            url: `/inventario/animal/${pesaje.animal?._id || pesaje.animal}`,
            metadata: { pesajeId: pesaje._id, peso: pesaje.peso }
        });
        res.status(201).json(pesaje);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear pesaje', error: error.message });
    }
};

pesajeCtrl.getPesaje = async (req, res) => {
    try {
        const pesaje = await poblarPesaje(Pesaje.findById(req.params.id));

        if (!pesaje) {
            return res.status(404).json({ mensaje: 'Pesaje no encontrado' });
        }

        res.json(pesaje);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener pesaje', error: error.message });
    }
};

pesajeCtrl.getPesajesPorAnimal = async (req, res) => {
    try {
        const pesajes = await poblarPesaje(
            Pesaje.find({ animal: req.params.animalId }).sort({ fecha: -1, createdAt: -1 })
        );
        res.json(pesajes);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener pesajes del animal', error: error.message });
    }
};

pesajeCtrl.updatePesaje = async (req, res) => {
    try {
        const pesajeAnterior = await Pesaje.findById(req.params.id);

        if (!pesajeAnterior) {
            return res.status(404).json({ mensaje: 'Pesaje no encontrado' });
        }

        if (req.body.animal || req.body.peso) {
            const validacion = await validarPesaje({
                animal: req.body.animal || pesajeAnterior.animal,
                peso: req.body.peso ?? pesajeAnterior.peso
            });
            if (!validacion.valido) {
                return res.status(validacion.status).json({ mensaje: validacion.mensaje });
            }
        }

        const pesaje = await Pesaje.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (String(pesajeAnterior.animal) !== String(pesaje.animal)) {
            await eliminarEventosPorReferencia({ moduloOrigen: 'Pesajes', referenciaId: pesaje._id });
            await actualizarPesoActualAnimal(pesajeAnterior.animal);
        }

        await registrarEventoPesaje(pesaje, req.usuario?.id);
        await actualizarPesoActualAnimal(pesaje.animal);
        const pesajeActualizado = await poblarPesaje(Pesaje.findById(pesaje._id));

        await notificarAccionSegura({
            actor: req.usuario,
            naturaleza: 'Informativa',
            tipo: 'PESAJE_MODIFICADO',
            titulo: 'Pesaje actualizado',
            mensaje: `${nombreUsuario(req.usuario)} actualizó a ${pesajeActualizado.peso} kg el pesaje de ${pesajeActualizado.animal?.diio || pesajeActualizado.animal?.identificadorFinca || pesajeActualizado.animal?.nombre || 'un animal'}.`,
            moduloOrigen: 'Pesajes',
            entidadTipo: 'Animal',
            entidadId: pesajeActualizado.animal?._id || pesajeActualizado.animal,
            url: `/inventario/animal/${pesajeActualizado.animal?._id || pesajeActualizado.animal}`,
            metadata: { pesajeId: pesajeActualizado._id, peso: pesajeActualizado.peso }
        });

        res.json(pesajeActualizado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar pesaje', error: error.message });
    }
};

pesajeCtrl.deletePesaje = async (req, res) => {
    try {
        const pesaje = await Pesaje.findByIdAndDelete(req.params.id);

        if (!pesaje) {
            return res.status(404).json({ mensaje: 'Pesaje no encontrado' });
        }

        await eliminarEventosPorReferencia({ moduloOrigen: 'Pesajes', referenciaId: pesaje._id });
        await actualizarPesoActualAnimal(pesaje.animal);

        res.json({ mensaje: 'Pesaje eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar pesaje', error: error.message });
    }
};

module.exports = pesajeCtrl;
