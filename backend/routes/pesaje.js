const { Router } = require('express');
const router = Router();

const {
    getPesajes,
    createPesaje,
    getPesaje,
    getPesajesPorAnimal,
    updatePesaje,
    deletePesaje
} = require('../controllers/pesaje-controller');

router.route('/')
    .get(getPesajes)
    .post(createPesaje);

router.get('/animal/:animalId', getPesajesPorAnimal);

router.route('/:id')
    .get(getPesaje)
    .put(updatePesaje)
    .delete(deletePesaje);

module.exports = router;
