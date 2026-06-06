const { Router } = require('express');
const router = Router();

const {
    getRegistros,
    createRegistro,
    getRegistro,
    getRegistrosPorAnimal,
    updateRegistro,
    deleteRegistro
} = require('../controllers/reproduccionController');

router.route('/')
    .get(getRegistros)
    .post(createRegistro);

router.get('/animal/:animalId', getRegistrosPorAnimal);

router.route('/:id')
    .get(getRegistro)
    .put(updateRegistro)
    .delete(deleteRegistro);

module.exports = router;
