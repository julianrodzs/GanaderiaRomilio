const { Router } = require('express');
const {
    restablecerContrasena,
    solicitarRecuperacionContrasena
} = require('../controllers/usuario-controller');

const router = Router();

router.post('/forgot-password', solicitarRecuperacionContrasena);
router.post('/reset-password', restablecerContrasena);

module.exports = router;
