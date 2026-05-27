const {Router} = require('express');
const router = Router();

const {
    getUsuarios,
    createUsuario,
    getUsuario,
    deleteUsuario,
    updateUsuario,
    loginUsuario,
    solicitarRecuperacionContrasena,
    restablecerContrasena
} = require('../controllers/usuario-controller');

router.route('/')
    .get(getUsuarios)
    .post(createUsuario)

router.post('/login', loginUsuario);
router.post('/recuperar-contrasena', solicitarRecuperacionContrasena);
router.post('/restablecer-contrasena', restablecerContrasena);

router.route('/:id')
    .get(getUsuario)
    .put(updateUsuario)
    .delete(deleteUsuario)

module.exports = router;
