const EventoCamada = require('../models/EventoCamada');

const eventoCamadaCtrl = {};

eventoCamadaCtrl.getEventosPorCamada = async (req, res) => {
    try {
        const eventos = await EventoCamada.find({ camada: req.params.camadaId })
            .populate('creadoPor', 'nombre apellido correo')
            .sort({ fecha: -1, createdAt: -1 });

        res.json(eventos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener eventos de camada', error: error.message });
    }
};

eventoCamadaCtrl.crearEventoCamada = async (req, res) => {
    try {
        const evento = new EventoCamada({
            ...req.body,
            creadoPor: req.usuario?.id
        });
        const guardado = await evento.save();

        res.status(201).json(guardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear evento de camada', error: error.message });
    }
};

eventoCamadaCtrl.actualizarEventoCamada = async (req, res) => {
    try {
        const evento = await EventoCamada.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!evento) {
            return res.status(404).json({ mensaje: 'Evento de camada no encontrado' });
        }

        res.json(evento);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar evento de camada', error: error.message });
    }
};

eventoCamadaCtrl.eliminarEventoCamada = async (req, res) => {
    try {
        const evento = await EventoCamada.findByIdAndDelete(req.params.id);

        if (!evento) {
            return res.status(404).json({ mensaje: 'Evento de camada no encontrado' });
        }

        res.json({ mensaje: 'Evento de camada eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar evento de camada', error: error.message });
    }
};

module.exports = eventoCamadaCtrl;
