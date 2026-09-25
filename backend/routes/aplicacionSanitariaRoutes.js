const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const aplicacionSanitariaCtrl = require('../controllers/aplicacionSanitaria-controller');

const router = Router();
const puedeVer = autorizarPermiso('sanidad.ver');
const puedeGestionar = autorizarPermiso('sanidad.gestionar');

router.get('/', puedeVer, aplicacionSanitariaCtrl.getAplicaciones);
router.post('/unica', puedeGestionar, aplicacionSanitariaCtrl.createAplicacionUnica);
router.get('/:id', puedeVer, aplicacionSanitariaCtrl.getAplicacionById);

module.exports = router;
