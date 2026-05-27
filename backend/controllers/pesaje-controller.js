const pesajeCtrl = {};

const Pesaje = require('../models/Pesaje');

pesajeCtrl.getPesajes = async (req, res) => {
    try {
        const pesajes = await Pesaje.find().populate('animal').sort({ fecha: -1 });
        res.json(pesajes);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener pesajes', error: error.message });
    }
};

pesajeCtrl.createPesaje = async (req, res) => {
    try {
        const nuevoPesaje = new Pesaje(req.body);
        const pesajeGuardado = await nuevoPesaje.save();
        res.status(201).json(pesajeGuardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear pesaje', error: error.message });
    }
};

pesajeCtrl.getPesaje = async (req, res) => {
    try {
        const pesaje = await Pesaje.findById(req.params.id).populate('animal');

        if (!pesaje) {
            return res.status(404).json({ mensaje: 'Pesaje no encontrado' });
        }

        res.json(pesaje);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener pesaje', error: error.message });
    }
};

pesajeCtrl.updatePesaje = async (req, res) => {
    try {
        const pesaje = await Pesaje.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!pesaje) {
            return res.status(404).json({ mensaje: 'Pesaje no encontrado' });
        }

        res.json(pesaje);
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

        res.json({ mensaje: 'Pesaje eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar pesaje', error: error.message });
    }
};

module.exports = pesajeCtrl;
