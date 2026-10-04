const { Membresia } = require('../models/Membresia');
const { listarFincasAccesibles } = require('../services/accesoFinca-service');
const {
    actualizarFinca,
    actualizarLineasProductivas,
    cambiarEstadoFinca,
    crearFinca,
    marcarFincaPrincipal
} = require('../services/finca-service');
const { respuestaErrorPlan } = require('../middleware/plan');

const fincaCtrl = {};

fincaCtrl.getFincas = async (req, res) => {
    try {
        const membresia = await Membresia.findById(req.usuario.membresiaId);
        const fincas = await listarFincasAccesibles(membresia, { incluirInactivas: req.usuario.rol === 'Administrador' });
        res.json(fincas.map((finca) => ({
            ...finca,
            esPrincipal: String(finca._id) === String(req.fincaPrincipalId || ''),
            esActiva: String(finca._id) === String(req.fincaId || '')
        })));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener las fincas', error: error.message });
    }
};

fincaCtrl.createFinca = async (req, res) => {
    try {
        const finca = await crearFinca({ organizacionId: req.organizacionId, datos: req.body });
        res.status(201).json({ mensaje: 'Finca creada', finca });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'No se pudo crear la finca' });
    }
};

fincaCtrl.updateFinca = async (req, res) => {
    try {
        res.json({ mensaje: 'Finca actualizada', finca: await actualizarFinca(req.params.id, req.body, req.organizacionId) });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'No se pudo actualizar la finca' });
    }
};

fincaCtrl.updateEstado = async (req, res) => {
    try {
        if (req.body.estado === 'Inactiva' && String(req.params.id) === String(req.fincaId)) {
            return res.status(409).json({ mensaje: 'Cambia a otra finca antes de desactivar la finca activa.' });
        }
        const finca = await cambiarEstadoFinca({
            fincaId: req.params.id,
            estado: req.body.estado,
            organizacionId: req.organizacionId
        });
        res.json({ mensaje: `Finca ${finca.estado.toLowerCase()}`, finca });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'No se pudo cambiar el estado de la finca' });
    }
};

fincaCtrl.setPrincipal = async (req, res) => {
    try {
        const finca = await marcarFincaPrincipal({ fincaId: req.params.id, organizacionId: req.organizacionId });
        res.json({ mensaje: 'Finca principal actualizada', finca });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'No se pudo cambiar la finca principal' });
    }
};

fincaCtrl.updateLineasProductivas = async (req, res) => {
    try {
        const finca = await actualizarLineasProductivas(req.params.id, req.body.lineasProductivas, req.organizacionId);
        res.json({ mensaje: 'Líneas productivas actualizadas', finca });
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(error.status || 400).json({ mensaje: error.message || 'No se pudieron actualizar las líneas productivas' });
    }
};

module.exports = fincaCtrl;
