const { Router } = require('express');
const { requireFeature } = require('../middleware/plan');
const { actualizarConfiguracion, obtenerConfiguracion } = require('../controllers/configuracionEmail-controller');

const router = Router();
router.use(requireFeature('configuracionEmailAvanzada'));
router.get('/configuracion-emails', obtenerConfiguracion);
router.put('/configuracion-emails', actualizarConfiguracion);

module.exports = router;
