const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { requirePlanVigente } = require('../middleware/plan');
const tratamientoSanitarioCtrl = require('../controllers/tratamientoSanitario-controller');

const router = Router();
const puedeVer = autorizarPermiso('sanidad.ver');
const puedeGestionar = autorizarPermiso('sanidad.gestionar');
const planVigente = requirePlanVigente();

router.route('/')
    .get(puedeVer, tratamientoSanitarioCtrl.getTratamientos)
    .post(puedeGestionar, planVigente, tratamientoSanitarioCtrl.createTratamiento);

router.get('/:id', puedeVer, tratamientoSanitarioCtrl.getTratamientoById);
router.put('/:id', puedeGestionar, planVigente, tratamientoSanitarioCtrl.updateTratamiento);
router.patch('/:id/completar', puedeGestionar, planVigente, tratamientoSanitarioCtrl.completarTratamiento);
router.patch('/:id/cancelar', puedeGestionar, planVigente, tratamientoSanitarioCtrl.cancelarTratamiento);
router.post('/:id/aplicaciones', puedeGestionar, planVigente, tratamientoSanitarioCtrl.registrarAplicacionTratamiento);

module.exports = router;
