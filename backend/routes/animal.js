const { Router } = require('express');
const router = Router();

const {
    getAnimales,
    createAnimal,
    getAnimal,
    updateAnimal,
    deleteAnimal
} = require('../controllers/animal-controller');

router.route('/')
    .get(getAnimales)
    .post(createAnimal);

router.route('/:id')
    .get(getAnimal)
    .put(updateAnimal)
    .delete(deleteAnimal);

module.exports = router;
