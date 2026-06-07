const { Router } = require('express');
const router = Router();

const {
    getResumenReportes,
    getProductividadCria,
    getFinanzasCria
} = require('../controllers/reporte-controller');

router.get('/resumen', getResumenReportes);
router.get('/productividad', getProductividadCria);
router.get('/finanzas-cria', getFinanzasCria);

module.exports = router;
