const { Router } = require('express');
const router = Router();

const {
    getMovimientos,
    createMovimiento,
    getResumen,
    getResumenConsumo,
    getResumenPlanilla,
    getResumenInversiones,
    getMovimientosPorTipo,
    updateMovimiento,
    deleteMovimiento
} = require('../controllers/movimientoFinanciero-controller');

router.route('/')
    .get(getMovimientos)
    .post(createMovimiento);

router.get('/resumen', getResumen);
router.get('/consumo', getResumenConsumo);
router.get('/planilla-resumen', getResumenPlanilla);
router.get('/inversiones-resumen', getResumenInversiones);
router.get('/tipo/:tipoMovimiento', getMovimientosPorTipo);

router.route('/:id')
    .put(updateMovimiento)
    .delete(deleteMovimiento);

module.exports = router;
