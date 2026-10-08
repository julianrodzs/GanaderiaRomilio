const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { recibirImagenApariencia } = require('../middleware/uploadApariencia');
const ctrl = require('../controllers/apariencia-controller');

const router = Router();
const administrar = autorizarPermiso('usuarios.gestionar');

router.get('/', ctrl.getActual);
router.get('/configuracion', administrar, ctrl.getConfiguracion);
router.post('/organizacion/logo', administrar, recibirImagenApariencia, ctrl.postLogo);
router.post('/fincas/:fincaId/:tipo', administrar, recibirImagenApariencia, ctrl.postImagenFinca);
router.patch('/fincas/:fincaId/reutilizar-dashboard', administrar, ctrl.patchReutilizarDashboard);
router.delete('/:alcance/:tipo', administrar, ctrl.deleteImagen);

module.exports = router;
