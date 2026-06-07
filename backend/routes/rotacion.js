const { Router } = require('express');
const router = Router();
const { autorizarRoles } = require('../middleware/auth');
const puedeVer = autorizarRoles('Administrador', 'Encargado');
const soloAdministrador = autorizarRoles('Administrador');

const {
    getRotaciones,
    createRotacion,
    getRotacion,
    updateRotacion,
    deleteRotacion
} = require('../controllers/rotacion-controller');

router.route('/')
    .get(puedeVer, getRotaciones)
    .post(soloAdministrador, createRotacion);

router.route('/:id')
    .get(puedeVer, getRotacion)
    .put(soloAdministrador, updateRotacion)
    .delete(soloAdministrador, deleteRotacion);

module.exports = router;
