const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const { requirePlanVigente } = require('../middleware/plan');
const planVigente = requirePlanVigente();
const puedeVer = autorizarPermiso('sanidad.ver');
const puedeGestionar = autorizarPermiso('sanidad.gestionar');
const puedeEliminar = autorizarPermiso('sanidad.eliminar');

const {
    getPlanesSanitarios,
    createPlanSanitario,
    getAlertasPlanSanitario,
    updatePlanSanitario,
    deletePlanSanitario,
    archivarPlanSanitario,
    registrarAplicacionPlan,
    marcarPlanAplicado
} = require('../controllers/planSanitario-controller');

router.route('/')
    .get(puedeVer, getPlanesSanitarios)
    .post(puedeGestionar, planVigente, createPlanSanitario);

router.get('/alertas', puedeVer, getAlertasPlanSanitario);

router.route('/:id')
    .put(puedeGestionar, planVigente, updatePlanSanitario)
    .delete(puedeEliminar, planVigente, deletePlanSanitario);

router.patch('/:id/registrar-aplicacion', puedeGestionar, planVigente, registrarAplicacionPlan);
router.patch('/:id/marcar-aplicado', puedeGestionar, planVigente, marcarPlanAplicado);
router.patch('/:id/archivar', puedeGestionar, planVigente, archivarPlanSanitario);

module.exports = router;
