const { Router } = require('express');
const router = Router();

const {
    getRegistrosSanitarios,
    createRegistroSanitario,
    getRegistroSanitario,
    updateRegistroSanitario,
    deleteRegistroSanitario
} = require('../controllers/sanidad-controller');

router.route('/')
    .get(getRegistrosSanitarios)
    .post(createRegistroSanitario);

router.route('/:id')
    .get(getRegistroSanitario)
    .put(updateRegistroSanitario)
    .delete(deleteRegistroSanitario);

module.exports = router;
