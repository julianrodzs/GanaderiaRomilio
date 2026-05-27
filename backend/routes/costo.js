const { Router } = require('express');
const router = Router();

const {
    getCostos,
    createCosto,
    getCosto,
    updateCosto,
    deleteCosto
} = require('../controllers/costo-controller');

router.route('/')
    .get(getCostos)
    .post(createCosto);

router.route('/:id')
    .get(getCosto)
    .put(updateCosto)
    .delete(deleteCosto);

module.exports = router;
