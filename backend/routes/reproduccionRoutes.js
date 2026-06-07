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
    updateRegistro,
    deleteRegistro
} = require('../controllers/reproduccionController');

router.route('/')
    .get(puedeVer, getRegistros)
    .post(soloAdministrador, createRegistro);

router.get('/animal/:animalId', puedeVer, getRegistrosPorAnimal);

router.route('/:id')
    .get(puedeVer, getRegistro)
    .put(soloAdministrador, updateRegistro)
    .delete(soloAdministrador, deleteRegistro);

module.exports = router;
