const { Router } = require('express');
const { aceptarInvitacionNueva } = require('../controllers/usuario-controller');
const { rateLimitInvitacion } = require('../middleware/rateLimit');

const router = Router();
router.post('/aceptar', rateLimitInvitacion, aceptarInvitacionNueva);

module.exports = router;
