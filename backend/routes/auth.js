const { Router } = require('express');
const {
    restablecerContrasena,
    solicitarRecuperacionContrasena
} = require('../controllers/usuario-controller');
const { rateLimitRecuperacion } = require('../middleware/rateLimit');

const router = Router();

router.post('/forgot-password', rateLimitRecuperacion, solicitarRecuperacionContrasena);
router.post('/reset-password', rateLimitRecuperacion, restablecerContrasena);
router.post('/aceptar-invitacion', require('../middleware/rateLimit').rateLimitInvitacion, require('../controllers/usuario-controller').aceptarInvitacionNueva);

module.exports = router;
