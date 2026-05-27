const { Router } = require('express');
const router = Router();

const {
    getPesajes,
    createPesaje,
    getPesaje,
    updatePesaje,
    deletePesaje
} = require('../controllers/pesaje-controller');

router.route('/')
    .get(getPesajes)
    .post(createPesaje);

router.route('/:id')
    .get(getPesaje)
    .put(updatePesaje)
    .delete(deletePesaje);

module.exports = router;
