const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('finanzas.ver');
const puedeGestionar = autorizarPermiso('finanzas.gestionar');

const {
    getCostos,
    createCosto,
    getCosto,
    updateCosto,
    deleteCosto
} = require('../controllers/costo-controller');

router.route('/')
    .get(puedeVer, getCostos)
    .post(puedeGestionar, createCosto);

router.route('/:id')
    .get(puedeVer, getCosto)
    .put(puedeGestionar, updateCosto)
    .delete(puedeGestionar, deleteCosto);

module.exports = router;
