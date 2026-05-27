const { Router } = require('express');
const router = Router();

const {
    getRotaciones,
    createRotacion,
    getRotacion,
    updateRotacion,
    deleteRotacion
} = require('../controllers/rotacion-controller');

router.route('/')
    .get(getRotaciones)
    .post(createRotacion);

router.route('/:id')
    .get(getRotacion)
    .put(updateRotacion)
    .delete(deleteRotacion);

module.exports = router;
