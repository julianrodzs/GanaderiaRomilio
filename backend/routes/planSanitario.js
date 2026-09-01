const { Router } = require('express');
const router = Router();

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
    .get(getPlanesSanitarios)
    .post(createPlanSanitario);

router.get('/alertas', getAlertasPlanSanitario);

router.route('/:id')
    .put(updatePlanSanitario)
    .delete(deletePlanSanitario);

router.patch('/:id/registrar-aplicacion', registrarAplicacionPlan);
router.patch('/:id/marcar-aplicado', marcarPlanAplicado);

module.exports = router;
