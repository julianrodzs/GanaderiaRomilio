const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { requirePlanVigente } = require('../middleware/plan');
const aplicacionSanitariaCtrl = require('../controllers/aplicacionSanitaria-controller');

const router = Router();
const puedeVer = autorizarPermiso('sanidad.ver');
const puedeGestionar = autorizarPermiso('sanidad.gestionar');
const planVigente = requirePlanVigente();

router.get('/', puedeVer, aplicacionSanitariaCtrl.getAplicaciones);
router.post('/unica', puedeGestionar, planVigente, aplicacionSanitariaCtrl.createAplicacionUnica);
router.get('/:id', puedeVer, aplicacionSanitariaCtrl.getAplicacionById);

module.exports = router;
