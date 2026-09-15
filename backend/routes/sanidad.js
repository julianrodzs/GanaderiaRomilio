const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('sanidad.ver');
const puedeGestionar = autorizarPermiso('sanidad.gestionar');
const puedeEliminar = autorizarPermiso('sanidad.eliminar');

const {
    getRegistrosSanitarios,
    createRegistroSanitario,
    getRegistroSanitario,
    updateRegistroSanitario,
    deleteRegistroSanitario
} = require('../controllers/sanidad-controller');

router.route('/')
    .get(puedeVer, getRegistrosSanitarios)
    .post(puedeGestionar, createRegistroSanitario);

router.route('/:id')
    .get(puedeVer, getRegistroSanitario)
    .put(puedeGestionar, updateRegistroSanitario)
    .delete(puedeEliminar, deleteRegistroSanitario);

module.exports = router;
