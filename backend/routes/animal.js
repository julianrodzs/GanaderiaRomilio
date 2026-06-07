const { Router } = require('express');
const router = Router();
const { autorizarRoles } = require('../middleware/auth');
const puedeVer = autorizarRoles('Administrador', 'Encargado');
const soloAdministrador = autorizarRoles('Administrador');

const {
    getAnimales,
    createAnimal,
    getAnimal,
    updateAnimal,
    deleteAnimal
} = require('../controllers/animal-controller');

router.route('/')
    .get(puedeVer, getAnimales)
    .post(soloAdministrador, createAnimal);

router.route('/:id')
    .get(puedeVer, getAnimal)
    .put(soloAdministrador, updateAnimal)
    .delete(soloAdministrador, deleteAnimal);

module.exports = router;
