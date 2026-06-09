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
const { updateGenealogiaAnimal } = require('../controllers/genealogiaController');

router.route('/')
    .get(puedeVer, getAnimales)
    .post(soloAdministrador, createAnimal);

router.route('/:id')
    .get(puedeVer, getAnimal)
    .put(soloAdministrador, updateAnimal)
    .delete(soloAdministrador, deleteAnimal);

router.put('/:id/genealogia', soloAdministrador, updateGenealogiaAnimal);

module.exports = router;
