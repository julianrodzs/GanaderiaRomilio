const { Router } = require('express');
const router = Router();
const { autorizarRoles } = require('../middleware/auth');
const puedeVer = autorizarRoles('Administrador', 'Encargado');
const soloAdministrador = autorizarRoles('Administrador');

const {
    getPotreros,
    createPotrero,
    getPotrero,
    updatePotrero,
    deletePotrero
} = require('../controllers/potrero-controller');

router.route('/')
    .get(puedeVer, getPotreros)
    .post(soloAdministrador, createPotrero);

router.route('/:id')
    .get(puedeVer, getPotrero)
    .put(soloAdministrador, updatePotrero)
    .delete(soloAdministrador, deletePotrero);

module.exports = router;
