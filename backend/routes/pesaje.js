const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('pesajes.ver');
const puedeGestionar = autorizarPermiso('pesajes.gestionar');
const puedeEliminar = autorizarPermiso('pesajes.eliminar');

const {
    getPesajes,
    createPesaje,
    getPesaje,
    getPesajesPorAnimal,
    updatePesaje,
    deletePesaje
} = require('../controllers/pesaje-controller');

router.route('/')
    .get(puedeVer, getPesajes)
    .post(puedeGestionar, createPesaje);

router.get('/animal/:animalId', puedeVer, getPesajesPorAnimal);

router.route('/:id')
    .get(puedeVer, getPesaje)
    .put(puedeGestionar, updatePesaje)
    .delete(puedeEliminar, deletePesaje);

module.exports = router;
