const { Membresia } = require('../models/Membresia');
const { resolverFincasParaReporte } = require('../services/accesoFinca-service');
const { obtenerReporteMultiFinca } = require('../services/reporteMultiFinca-service');

const getReporteMultiFinca = async (req, res) => {
    try {
        const membresia = await Membresia.findById(req.usuario.membresiaId);
        const fincas = await resolverFincasParaReporte({
            membresia,
            organizacionId: req.organizacionId,
            fincaIds: req.query.fincaIds
        });
        res.json(await obtenerReporteMultiFinca({
            fincas,
            fechaInicio: req.query.fechaInicio,
            fechaFin: req.query.fechaFin,
            especie: ['Bovino', 'Porcino'].includes(req.query.especie) ? req.query.especie : 'Todos'
        }));
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message || 'No se pudo generar el reporte multi-finca' });
    }
};

module.exports = { getReporteMultiFinca };
