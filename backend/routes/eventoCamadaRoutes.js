const { Router } = require('express');
const router = Router();
const { autorizarRoles } = require('../middleware/auth');
const puedeVer = autorizarRoles('Administrador', 'Encargado');
const soloAdministrador = autorizarRoles('Administrador');

const {
    getEventosPorCamada,
    crearEventoCamada,
    actualizarEventoCamada,
    eliminarEventoCamada
} = require('../controllers/eventoCamadaController');

router.get('/camada/:camadaId', puedeVer, getEventosPorCamada);
router.post('/', soloAdministrador, crearEventoCamada);
router.put('/:id', soloAdministrador, actualizarEventoCamada);
router.delete('/:id', soloAdministrador, eliminarEventoCamada);

module.exports = router;
