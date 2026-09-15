const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('camadas.ver');
const puedeGestionar = autorizarPermiso('camadas.gestionar');
const soloAdministrador = autorizarPermiso('usuarios.gestionar');

const {
    getEventosPorCamada,
    crearEventoCamada,
    actualizarEventoCamada,
    eliminarEventoCamada
} = require('../controllers/eventoCamadaController');

router.get('/camada/:camadaId', puedeVer, getEventosPorCamada);
router.post('/', puedeGestionar, crearEventoCamada);
router.put('/:id', puedeGestionar, actualizarEventoCamada);
router.delete('/:id', soloAdministrador, eliminarEventoCamada);

module.exports = router;
