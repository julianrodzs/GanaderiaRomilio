const EventoAnimal = require('../models/EventoAnimal');
const Animal = require('../models/Animal');

const eventoAnimalCtrl = {};

eventoAnimalCtrl.getEventosPorAnimal = async (req, res) => {
    try {
        const eventos = await EventoAnimal.find({ animal: req.params.animalId })
            .populate('creadoPor', 'nombre apellido correo rol')
            .sort({ fecha: -1, createdAt: -1 });

        res.json(eventos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener bitacora del animal', error: error.message });
    }
};

eventoAnimalCtrl.createEvento = async (req, res) => {
    try {
        const animal = await Animal.findById(req.body.animal);

        if (!animal) {
            return res.status(404).json({ mensaje: 'Animal no encontrado' });
        }

        const nuevoEvento = new EventoAnimal({
            ...req.body,
            creadoPor: req.usuario?.id,
            moduloOrigen: req.body.moduloOrigen || 'Manual'
        });
        const eventoGuardado = await nuevoEvento.save();
        const evento = await EventoAnimal.findById(eventoGuardado._id).populate('creadoPor', 'nombre apellido correo rol');

        res.status(201).json(evento);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear evento de animal', error: error.message });
    }
};

eventoAnimalCtrl.updateEvento = async (req, res) => {
    try {
        const evento = await EventoAnimal.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('creadoPor', 'nombre apellido correo rol');

        if (!evento) {
            return res.status(404).json({ mensaje: 'Evento no encontrado' });
        }

        res.json(evento);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar evento de animal', error: error.message });
    }
};

eventoAnimalCtrl.deleteEvento = async (req, res) => {
    try {
        const evento = await EventoAnimal.findByIdAndDelete(req.params.id);

        if (!evento) {
            return res.status(404).json({ mensaje: 'Evento no encontrado' });
        }

        res.json({ mensaje: 'Evento eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar evento de animal', error: error.message });
    }
};

module.exports = eventoAnimalCtrl;
