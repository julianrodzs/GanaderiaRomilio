const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { requireFeature } = require('../middleware/plan');
const ctrl = require('../controllers/protocoloEngorde-controller');

const router = Router();
router.use(requireFeature('protocolosEngorde'));
router.get('/plantillas', autorizarPermiso('lotes.ver'), ctrl.getPlantillas);
router.post('/plantillas', autorizarPermiso('lotes.protocoloConfigurar'), ctrl.postPlantilla);
router.put('/plantillas/:id', autorizarPermiso('lotes.protocoloConfigurar'), ctrl.putPlantilla);
router.get('/ciclos', autorizarPermiso('lotes.ver'), ctrl.getCiclos);
router.get('/tareas/:tareaId', autorizarPermiso('lotes.protocoloEjecutar'), ctrl.getActividadTarea);
router.post('/ciclos', autorizarPermiso('lotes.protocoloCrear'), ctrl.postCiclo);
router.get('/ciclos/:id', autorizarPermiso('lotes.ver'), ctrl.getCiclo);
router.post('/ciclos/:id/pasos/:pasoId/ejecutar', autorizarPermiso('lotes.protocoloEjecutar'), ctrl.postPaso);
router.post('/ciclos/:id/avanzar-etapa', autorizarPermiso('lotes.protocoloCrear'), ctrl.postAvanzar);
router.post('/ciclos/:id/finalizar', autorizarPermiso('lotes.protocoloCrear'), ctrl.postFinalizar);
router.post('/ciclos/:id/cancelar', autorizarPermiso('lotes.protocoloCrear'), ctrl.postCancelar);
router.get('/ciclos/:id/candidatos-venta', autorizarPermiso('ventas.ver'), ctrl.getCandidatosVenta);
router.get('/metricas/consolidado', requireFeature('reportesMultiFinca'), autorizarPermiso('reportes.ver'), ctrl.getConsolidado);

module.exports = router;
