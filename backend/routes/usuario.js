const { Router } = require('express');
const router = Router();
const { auth, autorizarPermiso } = require('../middleware/auth');
const { rateLimitInvitacion, rateLimitLogin, rateLimitRecuperacion } = require('../middleware/rateLimit');

const {
    actualizarUsuario,
    actualizarPerfil,
    aceptarInvitacionExistente,
    aceptarPrivacidad,
    cambiarEstadoUsuario,
    crearUsuario,
    eliminarUsuario,
    eliminarPerfil,
    getPerfil,
    getMisOrganizaciones,
    getUsuarioById,
    getUsuarios,
    getUsuariosAsignables,
    loginUsuario,
    cambiarOrganizacionActiva,
    restablecerContrasena,
    solicitarRecuperacionContrasena
} = require('../controllers/usuario-controller');

const soloAdministrador = [auth, autorizarPermiso('usuarios.gestionar')];

router.post('/login', rateLimitLogin, loginUsuario);
router.post('/recuperar-contrasena', rateLimitRecuperacion, solicitarRecuperacionContrasena);
router.post('/restablecer-contrasena', rateLimitRecuperacion, restablecerContrasena);
router.get('/perfil', auth, getPerfil);
router.put('/perfil', auth, actualizarPerfil);
router.delete('/perfil', auth, eliminarPerfil);
router.post('/perfil/consentimiento', auth, aceptarPrivacidad);
router.get('/mis-organizaciones', auth, getMisOrganizaciones);
router.post('/cambiar-organizacion-activa', auth, cambiarOrganizacionActiva);
router.post('/invitaciones/aceptar', auth, rateLimitInvitacion, aceptarInvitacionExistente);
router.get('/asignables', auth, getUsuariosAsignables);

router.route('/')
    .get(soloAdministrador, getUsuarios)
    .post(soloAdministrador, rateLimitInvitacion, crearUsuario);

router.patch('/:id/estado', soloAdministrador, cambiarEstadoUsuario);

router.route('/:id')
    .get(soloAdministrador, getUsuarioById)
    .put(soloAdministrador, actualizarUsuario)
    .delete(soloAdministrador, eliminarUsuario);

module.exports = router;
