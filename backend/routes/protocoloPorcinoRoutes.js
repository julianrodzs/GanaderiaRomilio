const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { requireFeature } = require('../middleware/plan');
const ctrl = require('../controllers/protocoloPorcino-controller');

const router = Router();
router.use(requireFeature('protocolosReproductivosPorcinos'));
router.get('/plantillas', autorizarPermiso('reproduccion.ver'), ctrl.getPlantillas);
router.post('/plantillas', autorizarPermiso('reproduccion.protocoloPorcinoConfigurar'), ctrl.postPlantilla);
router.put('/plantillas/:id', autorizarPermiso('reproduccion.protocoloPorcinoConfigurar'), ctrl.putPlantilla);
router.get('/bandas', autorizarPermiso('reproduccion.ver'), ctrl.getBandas);
router.get('/tareas/:tareaId', autorizarPermiso('reproduccion.protocoloPorcinoEjecutar'), ctrl.getActividadTarea);
router.post('/bandas', autorizarPermiso('reproduccion.protocoloPorcinoCrear'), ctrl.postBanda);
router.get('/bandas/:id', autorizarPermiso('reproduccion.ver'), ctrl.getBanda);
router.post('/bandas/:id/pasos/:pasoId/ejecutar', autorizarPermiso('reproduccion.protocoloPorcinoEjecutar'), ctrl.postPaso);
router.post('/bandas/:id/reprogramar', autorizarPermiso('reproduccion.protocoloPorcinoCrear'), ctrl.postReprogramar);
router.post('/bandas/:id/participantes/:participanteId/retirar', autorizarPermiso('reproduccion.protocoloPorcinoEjecutar'), ctrl.postRetirar);
router.post('/bandas/:id/finalizar', autorizarPermiso('reproduccion.protocoloPorcinoCrear'), ctrl.postFinalizar);
router.post('/bandas/:id/cancelar', autorizarPermiso('reproduccion.protocoloPorcinoCrear'), ctrl.postCancelar);
router.get('/metricas/consolidado', requireFeature('reportesMultiFinca'), autorizarPermiso('reportes.ver'), ctrl.getConsolidado);

module.exports = router;
