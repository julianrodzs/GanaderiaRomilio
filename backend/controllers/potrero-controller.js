const potreroCtrl = {};

const Potrero = require('../models/Potrero');

potreroCtrl.getPotreros = async (req, res) => {
    try {
        const potreros = await Potrero.find().sort({ createdAt: -1 });
        res.json(potreros);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener potreros', error: error.message });
    }
};

potreroCtrl.createPotrero = async (req, res) => {
    try {
        const nuevoPotrero = new Potrero(req.body);
        const potreroGuardado = await nuevoPotrero.save();
        res.status(201).json(potreroGuardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear potrero', error: error.message });
    }
};

potreroCtrl.getPotrero = async (req, res) => {
    try {
        const potrero = await Potrero.findById(req.params.id);

        if (!potrero) {
            return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        }

        res.json(potrero);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener potrero', error: error.message });
    }
};

potreroCtrl.updatePotrero = async (req, res) => {
    try {
        const potrero = await Potrero.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!potrero) {
            return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        }

        res.json(potrero);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar potrero', error: error.message });
    }
};

potreroCtrl.deletePotrero = async (req, res) => {
    try {
        const potrero = await Potrero.findByIdAndDelete(req.params.id);

        if (!potrero) {
            return res.status(404).json({ mensaje: 'Potrero no encontrado' });
        }

        res.json({ mensaje: 'Potrero eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar potrero', error: error.message });
    }
};

module.exports = potreroCtrl;
