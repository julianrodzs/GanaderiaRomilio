const rotacionCtrl = {};

const RotacionPotrero = require('../models/RotacionPotrero');

rotacionCtrl.getRotaciones = async (req, res) => {
    try {
        const rotaciones = await RotacionPotrero.find().populate('potrero').sort({ fechaEntrada: -1 });
        res.json(rotaciones);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener rotaciones', error: error.message });
    }
};

rotacionCtrl.createRotacion = async (req, res) => {
    try {
        const nuevaRotacion = new RotacionPotrero(req.body);
        const rotacionGuardada = await nuevaRotacion.save();
        res.status(201).json(rotacionGuardada);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear rotacion', error: error.message });
    }
};

rotacionCtrl.getRotacion = async (req, res) => {
    try {
        const rotacion = await RotacionPotrero.findById(req.params.id).populate('potrero');

        if (!rotacion) {
            return res.status(404).json({ mensaje: 'Rotacion no encontrada' });
        }

        res.json(rotacion);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener rotacion', error: error.message });
    }
};

rotacionCtrl.updateRotacion = async (req, res) => {
    try {
        const rotacion = await RotacionPotrero.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!rotacion) {
            return res.status(404).json({ mensaje: 'Rotacion no encontrada' });
        }

        res.json(rotacion);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar rotacion', error: error.message });
    }
};

rotacionCtrl.deleteRotacion = async (req, res) => {
    try {
        const rotacion = await RotacionPotrero.findByIdAndDelete(req.params.id);

        if (!rotacion) {
            return res.status(404).json({ mensaje: 'Rotacion no encontrada' });
        }

        res.json({ mensaje: 'Rotacion eliminada' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar rotacion', error: error.message });
    }
};

module.exports = rotacionCtrl;
