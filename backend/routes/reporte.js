const { Router } = require('express');
const router = Router();

const {
    getResumenReportes,
    getProductividadCria,
    getFinanzasCria,
    getSustentabilidadCria,
    getVacasImproductivas,
    getCrecimientoPesajes
} = require('../controllers/reporte-controller');

router.get('/resumen', getResumenReportes);
router.get('/productividad', getProductividadCria);
router.get('/finanzas-cria', getFinanzasCria);
router.get('/sustentabilidad-cria', getSustentabilidadCria);
router.get('/vacas-improductivas', getVacasImproductivas);
router.get('/crecimiento-pesajes', getCrecimientoPesajes);

module.exports = router;
