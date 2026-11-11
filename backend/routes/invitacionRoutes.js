const { Router } = require('express');
const { aceptarInvitacionNueva } = require('../controllers/usuario-controller');
const { rateLimitInvitacion } = require('../middleware/rateLimit');

const router = Router();
router.get('/contexto', require('../controllers/legal-controller').contextoInvitacion);
router.post('/aceptar', rateLimitInvitacion, aceptarInvitacionNueva);

module.exports = router;
