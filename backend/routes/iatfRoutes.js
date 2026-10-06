const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { requireFeature } = require('../middleware/plan');
const ctrl = require('../controllers/iatf-controller');

const router = Router();
router.use(requireFeature('iatfReproductivo'));

router.get('/protocolos', autorizarPermiso('reproduccion.ver'), ctrl.getProtocolos);
router.get('/protocolos/:id', autorizarPermiso('reproduccion.ver'), ctrl.getProtocolo);
router.post('/protocolos', autorizarPermiso('reproduccion.iatfConfigurar'), ctrl.postProtocolo);
router.put('/protocolos/:id', autorizarPermiso('reproduccion.iatfConfigurar'), ctrl.putProtocolo);

router.get('/campanas', autorizarPermiso('reproduccion.ver'), ctrl.getCampanas);
router.get('/tareas/:tareaId', autorizarPermiso('reproduccion.iatfEjecutar'), ctrl.getActividadTarea);
router.post('/campanas', autorizarPermiso('reproduccion.iatfCrear'), ctrl.postCampana);
router.get('/campanas/:id', autorizarPermiso('reproduccion.ver'), ctrl.getCampana);
router.post('/campanas/:id/pasos/:pasoId/ejecutar', autorizarPermiso('reproduccion.iatfEjecutar'), ctrl.postEjecutarPaso);
router.post('/campanas/:id/pasos/:pasoId/reprogramar', autorizarPermiso('reproduccion.iatfCrear'), ctrl.postReprogramar);
router.post('/campanas/:id/inseminaciones', autorizarPermiso('reproduccion.iatfEjecutar'), ctrl.postInseminaciones);
router.post('/campanas/:id/diagnosticos', autorizarPermiso('reproduccion.iatfDiagnosticar'), ctrl.postDiagnosticos);
router.get('/campanas/:id/metricas', autorizarPermiso('reproduccion.ver'), ctrl.getMetricas);
router.post('/campanas/:id/finalizar', autorizarPermiso('reproduccion.iatfCrear'), ctrl.postFinalizar);
router.post('/campanas/:id/cancelar', autorizarPermiso('reproduccion.iatfCrear'), ctrl.postCancelar);
router.post('/campanas/:id/participantes/:participanteId/retirar', autorizarPermiso('reproduccion.iatfEjecutar'), ctrl.postRetirarParticipante);
router.post('/campanas/:id/resincronizar', autorizarPermiso('reproduccion.iatfCrear'), ctrl.postResincronizar);

router.get('/insumos', autorizarPermiso('reproduccion.ver'), ctrl.getInsumos);
router.post('/insumos', autorizarPermiso('reproduccion.iatfConfigurar'), ctrl.postInsumo);
router.put('/insumos/:id', autorizarPermiso('reproduccion.iatfConfigurar'), ctrl.putInsumo);
router.get('/metricas/consolidado', requireFeature('reportesMultiFinca'), autorizarPermiso('reportes.ver'), ctrl.getConsolidado);

module.exports = router;
