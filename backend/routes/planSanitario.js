const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('sanidad.ver');
const puedeGestionar = autorizarPermiso('sanidad.gestionar');
const puedeEliminar = autorizarPermiso('sanidad.eliminar');

const {
    getPlanesSanitarios,
    createPlanSanitario,
    getAlertasPlanSanitario,
    updatePlanSanitario,
    deletePlanSanitario,
    registrarAplicacionPlan,
    marcarPlanAplicado
} = require('../controllers/planSanitario-controller');

router.route('/')
    .get(puedeVer, getPlanesSanitarios)
    .post(puedeGestionar, createPlanSanitario);

router.get('/alertas', puedeVer, getAlertasPlanSanitario);

router.route('/:id')
    .put(puedeGestionar, updatePlanSanitario)
    .delete(puedeEliminar, deletePlanSanitario);

router.patch('/:id/registrar-aplicacion', puedeGestionar, registrarAplicacionPlan);
router.patch('/:id/marcar-aplicado', puedeGestionar, marcarPlanAplicado);

module.exports = router;
