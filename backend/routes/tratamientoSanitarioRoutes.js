const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const tratamientoSanitarioCtrl = require('../controllers/tratamientoSanitario-controller');

const router = Router();
const puedeVer = autorizarPermiso('sanidad.ver');
const puedeGestionar = autorizarPermiso('sanidad.gestionar');

router.route('/')
    .get(puedeVer, tratamientoSanitarioCtrl.getTratamientos)
    .post(puedeGestionar, tratamientoSanitarioCtrl.createTratamiento);

router.get('/:id', puedeVer, tratamientoSanitarioCtrl.getTratamientoById);
router.put('/:id', puedeGestionar, tratamientoSanitarioCtrl.updateTratamiento);
router.patch('/:id/completar', puedeGestionar, tratamientoSanitarioCtrl.completarTratamiento);
router.patch('/:id/cancelar', puedeGestionar, tratamientoSanitarioCtrl.cancelarTratamiento);
router.post('/:id/aplicaciones', puedeGestionar, tratamientoSanitarioCtrl.registrarAplicacionTratamiento);

module.exports = router;
