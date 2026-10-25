const router = require('express').Router();
const { autorizarPermiso } = require('../middleware/auth');
const { requirePlanVigente } = require('../middleware/plan');
const ctrl = require('../controllers/lote-controller');
const alimentacionCtrl = require('../controllers/planAlimentacion-controller');
const alimentacionOperativaCtrl = require('../controllers/alimentacion-controller');

const ver = autorizarPermiso('lotes.ver');
const gestionar = autorizarPermiso('lotes.gestionar');
const planVigente = requirePlanVigente();

router.get('/', ver, ctrl.listar);
router.post('/', gestionar, planVigente, ctrl.crear);
router.get('/:id/historial', ver, ctrl.historial);
router.get('/:id/eventos', ver, ctrl.eventos);
router.get('/:id/plan-alimentacion', ver, ctrl.planActual);
router.post('/:id/plan-alimentacion', gestionar, planVigente, alimentacionCtrl.asignarPlanLote);
router.get('/:id/historial-alimentacion', ver, ctrl.historialAlimentacion);
router.get('/:id/racion', ver, alimentacionOperativaCtrl.racionActual);
router.post('/:id/racion', gestionar, planVigente, alimentacionOperativaCtrl.asignarRacion);
router.get('/:id/historial-raciones', ver, alimentacionOperativaCtrl.historialRaciones);
router.get('/:id/suministros', ver, alimentacionOperativaCtrl.suministrosLote);
router.post('/:id/animales', gestionar, planVigente, ctrl.agregarAnimales);
router.post('/:id/mover-animales', gestionar, planVigente, ctrl.moverAnimales);
router.post('/:id/retirar-animales', gestionar, planVigente, ctrl.retirarAnimales);
router.post('/:id/cerrar', gestionar, planVigente, ctrl.cerrar);
router.patch('/:id/etapa', gestionar, planVigente, ctrl.cambiarEtapaLote);
router.post('/:id/pesajes', autorizarPermiso('pesajes.gestionar'), planVigente, ctrl.registrarPesajes);
router.post('/:id/tareas', autorizarPermiso('tareas.gestionar'), planVigente, ctrl.programarTarea);
router.post('/:id/cambiar-potrero', autorizarPermiso('potreros.gestionar'), planVigente, ctrl.cambiarPotrero);
router.get('/:id', ver, ctrl.obtener);
router.put('/:id', gestionar, planVigente, ctrl.actualizar);

module.exports = router;
