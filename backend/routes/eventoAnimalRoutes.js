const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const router = Router();
const puedeVer = autorizarPermiso('inventario.ver');
const puedeCrear = autorizarPermiso('sanidad.gestionar');
const soloAdministrador = autorizarPermiso('usuarios.gestionar');

const {
    getEventosPorAnimal,
    createEvento,
    updateEvento,
    deleteEvento
} = require('../controllers/eventoAnimalController');

router.get('/animal/:animalId', puedeVer, getEventosPorAnimal);
router.post('/', puedeCrear, createEvento);
router.put('/:id', soloAdministrador, updateEvento);
router.delete('/:id', soloAdministrador, deleteEvento);

module.exports = router;
