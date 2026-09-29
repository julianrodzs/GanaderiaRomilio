const Finca = require('../models/Finca');
const { actualizarLineasProductivas } = require('../services/finca-service');

const fincaCtrl = {};

fincaCtrl.getFincas = async (req, res) => {
    try {
        const fincas = await Finca.find({}).sort({ estado: 1, nombre: 1 }).lean();
        res.json(fincas.map((finca) => ({
            ...finca,
            esPrincipal: String(finca._id) === String(req.fincaPrincipalId || '')
        })));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener las fincas', error: error.message });
    }
};

fincaCtrl.updateLineasProductivas = async (req, res) => {
    try {
        const finca = await actualizarLineasProductivas(req.params.id, req.body.lineasProductivas);
        res.json({ mensaje: 'Líneas productivas actualizadas', finca });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'No se pudieron actualizar las líneas productivas' });
    }
};

module.exports = fincaCtrl;
