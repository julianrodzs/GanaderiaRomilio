const router = require('express').Router();
const { autorizarPermiso: permiso } = require('../middleware/auth');
const c = require('../controllers/te-controller');
router.use(require('../middleware/plan').requireFeature('programaTransferencia', { codigoDenegado: 'PLAN_UPGRADE_REQUIRED' }));
router.get('/', permiso('ventas.ver'), c.ventas);
router.get('/existencias', permiso('ventas.ver'), c.banco);
router.post('/', permiso('ventas.gestionar'), c.vender);
router.post('/:id/anular', permiso('ventas.gestionar'), c.anular);
module.exports = router;
