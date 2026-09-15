const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('potreros.ver');
const puedeGestionar = autorizarPermiso('potreros.gestionar');

const {
    getRotaciones,
    createRotacion,
    getRotacion,
    updateRotacion,
    deleteRotacion
} = require('../controllers/rotacion-controller');

router.route('/')
    .get(puedeVer, getRotaciones)
    .post(puedeGestionar, createRotacion);

router.route('/:id')
    .get(puedeVer, getRotacion)
    .put(puedeGestionar, updateRotacion)
    .delete(puedeGestionar, deleteRotacion);

module.exports = router;
