const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('potreros.ver');
const puedeGestionar = autorizarPermiso('potreros.gestionar');

const {
    getPotreros,
    getRendimientoPotreros,
    getRendimientoPotrero,
    createPotrero,
    getPotrero,
    updatePotrero,
    deletePotrero
} = require('../controllers/potrero-controller');

router.get('/rendimiento', puedeVer, getRendimientoPotreros);
router.get('/:id/rendimiento', puedeVer, getRendimientoPotrero);

router.route('/')
    .get(puedeVer, getPotreros)
    .post(puedeGestionar, createPotrero);

router.route('/:id')
    .get(puedeVer, getPotrero)
    .put(puedeGestionar, updatePotrero)
    .delete(puedeGestionar, deletePotrero);

module.exports = router;
