const { Router } = require('express');
const router = Router();
const { auth, autorizarPermiso } = require('../middleware/auth');
const { rateLimitLogin, rateLimitRecuperacion } = require('../middleware/rateLimit');

const {
    actualizarUsuario,
    cambiarEstadoUsuario,
    crearUsuario,
    eliminarUsuario,
    getPerfil,
    getUsuarioById,
    getUsuarios,
    loginUsuario,
    restablecerContrasena,
    solicitarRecuperacionContrasena
} = require('../controllers/usuario-controller');

const soloAdministrador = [auth, autorizarPermiso('usuarios.gestionar')];

router.post('/login', rateLimitLogin, loginUsuario);
router.post('/recuperar-contrasena', rateLimitRecuperacion, solicitarRecuperacionContrasena);
router.post('/restablecer-contrasena', rateLimitRecuperacion, restablecerContrasena);
router.get('/perfil', auth, getPerfil);

router.route('/')
    .get(soloAdministrador, getUsuarios)
    .post(soloAdministrador, crearUsuario);

router.patch('/:id/estado', soloAdministrador, cambiarEstadoUsuario);

router.route('/:id')
    .get(soloAdministrador, getUsuarioById)
    .put(soloAdministrador, actualizarUsuario)
    .delete(soloAdministrador, eliminarUsuario);

module.exports = router;
