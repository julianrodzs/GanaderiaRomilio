const { Router } = require('express');
const router = Router();

const { getResumenReportes } = require('../controllers/reporte-controller');

router.get('/resumen', getResumenReportes);

module.exports = router;
