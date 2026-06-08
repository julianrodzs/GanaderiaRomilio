const { Router } = require('express');
const router = Router();
const { autorizarRoles } = require('../middleware/auth');
const puedeVer = autorizarRoles('Administrador', 'Encargado');
const soloAdministrador = autorizarRoles('Administrador');

const {
    getRegistros,
    createRegistro,
    getRegistro,
    getRegistrosPorAnimal,
    registrarTerneroDesdeParto,
    updateRegistro,
    deleteRegistro
} = require('../controllers/reproduccionController');

router.route('/')
    .get(puedeVer, getRegistros)
    .post(soloAdministrador, createRegistro);

router.get('/animal/:animalId', puedeVer, getRegistrosPorAnimal);
router.post('/:id/ternero', soloAdministrador, registrarTerneroDesdeParto);

router.route('/:id')
    .get(puedeVer, getRegistro)
    .put(soloAdministrador, updateRegistro)
    .delete(soloAdministrador, deleteRegistro);

module.exports = router;
