const { Router } = require('express');
const router = Router();
const { auth, autorizarRoles } = require('../middleware/auth');

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

const soloAdministrador = [auth, autorizarRoles('Administrador')];

router.post('/login', loginUsuario);
router.post('/recuperar-contrasena', solicitarRecuperacionContrasena);
router.post('/restablecer-contrasena', restablecerContrasena);
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
