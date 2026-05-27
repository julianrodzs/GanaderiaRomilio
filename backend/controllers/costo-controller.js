const costoCtrl = {};

const Costo = require('../models/Costo');

costoCtrl.getCostos = async (req, res) => {
    try {
        const costos = await Costo.find().sort({ fecha: -1 });
        res.json(costos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener costos', error: error.message });
    }
};

costoCtrl.createCosto = async (req, res) => {
    try {
        const nuevoCosto = new Costo(req.body);
        const costoGuardado = await nuevoCosto.save();
        res.status(201).json(costoGuardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear costo', error: error.message });
    }
};

costoCtrl.getCosto = async (req, res) => {
    try {
        const costo = await Costo.findById(req.params.id);

        if (!costo) {
            return res.status(404).json({ mensaje: 'Costo no encontrado' });
        }

        res.json(costo);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener costo', error: error.message });
    }
};

costoCtrl.updateCosto = async (req, res) => {
    try {
        const costo = await Costo.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!costo) {
            return res.status(404).json({ mensaje: 'Costo no encontrado' });
        }

        res.json(costo);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar costo', error: error.message });
    }
};

costoCtrl.deleteCosto = async (req, res) => {
    try {
        const costo = await Costo.findByIdAndDelete(req.params.id);

        if (!costo) {
            return res.status(404).json({ mensaje: 'Costo no encontrado' });
        }

        res.json({ mensaje: 'Costo eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar costo', error: error.message });
    }
};

module.exports = costoCtrl;
