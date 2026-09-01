const { Router } = require('express');
const router = Router();

const {
    getMovimientos,
    createMovimiento,
    getResumen,
    getResumenConsumo,
    getResumenPlanilla,
    getResumenInversiones,
    getResumenDestinos,
    getRevisionDatos,
    getMovimientosPorTipo,
    updateMovimiento,
    deleteMovimiento
} = require('../controllers/movimientoFinanciero-controller');

const {
    activarCatalogo,
    actualizarCatalogo,
    crearCatalogo,
    desactivarCatalogo,
    eliminarCatalogo,
    getCatalogosAdmin,
    getCatalogosPublicos
} = require('../controllers/catalogoFinanciero-controller');

router.route('/')
    .get(getMovimientos)
    .post(createMovimiento);

router.get('/resumen', getResumen);
router.get('/consumo', getResumenConsumo);
router.get('/planilla-resumen', getResumenPlanilla);
router.get('/inversiones-resumen', getResumenInversiones);
router.get('/catalogos', getCatalogosPublicos);
router.get('/catalogos/admin', getCatalogosAdmin);
router.post('/catalogos', crearCatalogo);
router.put('/catalogos/:id', actualizarCatalogo);
router.patch('/catalogos/:id/desactivar', desactivarCatalogo);
router.patch('/catalogos/:id/activar', activarCatalogo);
router.delete('/catalogos/:id', eliminarCatalogo);
router.get('/destinos-resumen', getResumenDestinos);
router.get('/revision-datos', getRevisionDatos);
router.get('/tipo/:tipoMovimiento', getMovimientosPorTipo);

router.route('/:id')
    .put(updateMovimiento)
    .delete(deleteMovimiento);

module.exports = router;
