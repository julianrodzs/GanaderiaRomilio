const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('potreros.ver');
const puedeGestionar = autorizarPermiso('potreros.gestionar');
const { requireFeature } = require('../middleware/plan');

const {
    getPotreros,
    getRendimientoPotreros,
    getRendimientoPotrero,
    getRendimientoPorPasto,
    getCoberturaPotrero,
    createCoberturaPotrero,
    updateCoberturaPotrero,
    createPotrero,
    getPotrero,
    updatePotrero,
    deletePotrero
    ,getCortesForraje,
    createCorteForraje
} = require('../controllers/potrero-controller');

router.get('/rendimiento', puedeVer, requireFeature('analiticaProductiva'), getRendimientoPotreros);
router.get('/rendimiento/por-pasto', puedeVer, requireFeature('analiticaProductiva'), getRendimientoPorPasto);
router.get('/:id/rendimiento', puedeVer, requireFeature('analiticaProductiva'), getRendimientoPotrero);
router.route('/:id/cobertura')
    .get(puedeVer, getCoberturaPotrero)
    .post(puedeGestionar, createCoberturaPotrero)
    .put(puedeGestionar, updateCoberturaPotrero);
router.route('/:id/cortes')
    .get(puedeVer, getCortesForraje)
    .post(puedeGestionar, createCorteForraje);

router.route('/')
    .get(puedeVer, getPotreros)
    .post(puedeGestionar, createPotrero);

router.route('/:id')
    .get(puedeVer, getPotrero)
    .put(puedeGestionar, updatePotrero)
    .delete(puedeGestionar, deletePotrero);

module.exports = router;
