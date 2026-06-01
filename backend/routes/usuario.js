const {Router} = require('express');
const router = Router();
const { auth } = require('../middleware/auth');

const {
    getUsuarios,
    createUsuario,
    getUsuario,
    deleteUsuario,
    updateUsuario,
    loginUsuario,
    getPerfil,
    solicitarRecuperacionContrasena,
    restablecerContrasena
} = require('../controllers/usuario-controller');

router.route('/')
    .get(auth, getUsuarios)
    .post(createUsuario)

router.post('/login', loginUsuario);
router.post('/recuperar-contrasena', solicitarRecuperacionContrasena);
router.post('/restablecer-contrasena', restablecerContrasena);
router.get('/perfil', auth, getPerfil);

router.route('/:id')
    .get(auth, getUsuario)
    .put(auth, updateUsuario)
    .delete(auth, deleteUsuario)

module.exports = router;
