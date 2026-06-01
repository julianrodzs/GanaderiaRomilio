const { Router } = require('express');
const router = Router();

const {
    getMovimientos,
    createMovimiento,
    getResumen,
    getMovimientosPorTipo,
    updateMovimiento,
    deleteMovimiento
} = require('../controllers/movimientoFinanciero-controller');

router.route('/')
    .get(getMovimientos)
    .post(createMovimiento);

router.get('/resumen', getResumen);
router.get('/tipo/:tipoMovimiento', getMovimientosPorTipo);

router.route('/:id')
    .put(updateMovimiento)
    .delete(deleteMovimiento);

module.exports = router;
