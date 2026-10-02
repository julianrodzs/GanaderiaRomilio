const router = require('express').Router();
const { autorizarPermiso } = require('../middleware/auth');
const ctrl = require('../controllers/lote-controller');
const alimentacionCtrl = require('../controllers/planAlimentacion-controller');
const alimentacionOperativaCtrl = require('../controllers/alimentacion-controller');

const ver = autorizarPermiso('lotes.ver');
const gestionar = autorizarPermiso('lotes.gestionar');

router.get('/', ver, ctrl.listar);
router.post('/', gestionar, ctrl.crear);
router.get('/:id/historial', ver, ctrl.historial);
router.get('/:id/plan-alimentacion', ver, ctrl.planActual);
router.post('/:id/plan-alimentacion', gestionar, alimentacionCtrl.asignarPlanLote);
router.get('/:id/historial-alimentacion', ver, ctrl.historialAlimentacion);
router.get('/:id/racion', ver, alimentacionOperativaCtrl.racionActual);
router.post('/:id/racion', gestionar, alimentacionOperativaCtrl.asignarRacion);
router.get('/:id/historial-raciones', ver, alimentacionOperativaCtrl.historialRaciones);
router.get('/:id/suministros', ver, alimentacionOperativaCtrl.suministrosLote);
router.post('/:id/animales', gestionar, ctrl.agregarAnimales);
router.post('/:id/mover-animales', gestionar, ctrl.moverAnimales);
router.post('/:id/retirar-animales', gestionar, ctrl.retirarAnimales);
router.post('/:id/cerrar', gestionar, ctrl.cerrar);
router.patch('/:id/etapa', gestionar, ctrl.cambiarEtapaLote);
router.post('/:id/pesajes', autorizarPermiso('pesajes.gestionar'), ctrl.registrarPesajes);
router.post('/:id/tareas', autorizarPermiso('tareas.gestionar'), ctrl.programarTarea);
router.post('/:id/cambiar-potrero', autorizarPermiso('potreros.gestionar'), ctrl.cambiarPotrero);
router.get('/:id', ver, ctrl.obtener);
router.put('/:id', gestionar, ctrl.actualizar);

module.exports = router;
