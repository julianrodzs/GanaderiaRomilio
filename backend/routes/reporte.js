const { Router } = require('express');
const router = Router();

const {
    getResumenReportes,
    getProductividadCria,
    getFinanzasCria,
    getSustentabilidadCria
} = require('../controllers/reporte-controller');

router.get('/resumen', getResumenReportes);
router.get('/productividad', getProductividadCria);
router.get('/finanzas-cria', getFinanzasCria);
router.get('/sustentabilidad-cria', getSustentabilidadCria);

module.exports = router;
