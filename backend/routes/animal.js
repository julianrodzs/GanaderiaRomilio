const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('inventario.ver');
const puedeGestionar = autorizarPermiso('inventario.gestionar');

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
    .post(puedeGestionar, createAnimal);

router.route('/:id')
    .get(puedeVer, getAnimal)
    .put(puedeGestionar, updateAnimal)
    .delete(puedeGestionar, deleteAnimal);

router.put('/:id/genealogia', puedeGestionar, updateGenealogiaAnimal);

module.exports = router;
