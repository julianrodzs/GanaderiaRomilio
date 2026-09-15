const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('potreros.ver');
const puedeGestionar = autorizarPermiso('potreros.gestionar');

const {
    getPotreros,
    createPotrero,
    getPotrero,
    updatePotrero,
    deletePotrero
} = require('../controllers/potrero-controller');

router.route('/')
    .get(puedeVer, getPotreros)
    .post(puedeGestionar, createPotrero);

router.route('/:id')
    .get(puedeVer, getPotrero)
    .put(puedeGestionar, updatePotrero)
    .delete(puedeGestionar, deletePotrero);

module.exports = router;
