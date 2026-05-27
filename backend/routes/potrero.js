const { Router } = require('express');
const router = Router();

const {
    getPotreros,
    createPotrero,
    getPotrero,
    updatePotrero,
    deletePotrero
} = require('../controllers/potrero-controller');

router.route('/')
    .get(getPotreros)
    .post(createPotrero);

router.route('/:id')
    .get(getPotrero)
    .put(updatePotrero)
    .delete(deletePotrero);

module.exports = router;
