const { Router } = require('express');
const { autorizarRoles } = require('../middleware/auth');
const router = Router();

const {
    getEventosPorAnimal,
    createEvento,
    updateEvento,
    deleteEvento
} = require('../controllers/eventoAnimalController');

router.get('/animal/:animalId', getEventosPorAnimal);
router.post('/', createEvento);
router.put('/:id', autorizarRoles('Administrador'), updateEvento);
router.delete('/:id', autorizarRoles('Administrador'), deleteEvento);

module.exports = router;
