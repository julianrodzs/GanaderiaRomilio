const sanidadCtrl = {};

const RegistroSanitario = require('../models/RegistroSanitario');

sanidadCtrl.getRegistrosSanitarios = async (req, res) => {
    try {
        const registros = await RegistroSanitario.find().populate('animal').sort({ fecha: -1 });
        res.json(registros);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener registros sanitarios', error: error.message });
    }
};

sanidadCtrl.createRegistroSanitario = async (req, res) => {
    try {
        const nuevoRegistro = new RegistroSanitario(req.body);
        const registroGuardado = await nuevoRegistro.save();
        res.status(201).json(registroGuardado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear registro sanitario', error: error.message });
    }
};

sanidadCtrl.getRegistroSanitario = async (req, res) => {
    try {
        const registro = await RegistroSanitario.findById(req.params.id).populate('animal');

        if (!registro) {
            return res.status(404).json({ mensaje: 'Registro sanitario no encontrado' });
        }

        res.json(registro);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener registro sanitario', error: error.message });
    }
};

sanidadCtrl.updateRegistroSanitario = async (req, res) => {
    try {
        const registro = await RegistroSanitario.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!registro) {
            return res.status(404).json({ mensaje: 'Registro sanitario no encontrado' });
        }

        res.json(registro);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar registro sanitario', error: error.message });
    }
};

sanidadCtrl.deleteRegistroSanitario = async (req, res) => {
    try {
        const registro = await RegistroSanitario.findByIdAndDelete(req.params.id);

        if (!registro) {
            return res.status(404).json({ mensaje: 'Registro sanitario no encontrado' });
        }

        res.json({ mensaje: 'Registro sanitario eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar registro sanitario', error: error.message });
    }
};

module.exports = sanidadCtrl;
