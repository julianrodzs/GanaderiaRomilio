const { Router } = require('express');
const { autorizarCron } = require('../middleware/cronAuth');
const { ejecutarAlertasProgramadas, ejecutarResumenesEmailProgramados } = require('../services/trabajoProgramado-service');

const router = Router();

router.post('/alertas', autorizarCron, async (req, res) => {
    try {
        const resultado = await ejecutarAlertasProgramadas({ origen: 'cron-http' });
        res.status(resultado.omitido ? 202 : 200).json(resultado);
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo ejecutar el trabajo de alertas', error: error.message });
    }
});

router.post('/resumenes-email', autorizarCron, async (req, res) => {
    try {
        const resultado = await ejecutarResumenesEmailProgramados({ origen: 'cron-http' });
        res.status(resultado.omitido ? 202 : 200).json(resultado);
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo ejecutar el trabajo de resúmenes.', error: error.message });
    }
});

module.exports = router;
