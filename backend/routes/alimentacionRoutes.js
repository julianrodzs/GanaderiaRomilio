const router = require('express').Router();
const { autorizarPermiso } = require('../middleware/auth');
const { requirePlanVigente } = require('../middleware/plan');
const ctrl = require('../controllers/planAlimentacion-controller');
const alimentacion = require('../controllers/alimentacion-controller');

const ver = autorizarPermiso('alimentacion.ver');
const gestionar = autorizarPermiso('alimentacion.gestionar');
const registrar = autorizarPermiso('alimentacion.registrarSuministros');
const planVigente = requirePlanVigente();

router.get('/planes', ver, ctrl.listar);
router.post('/planes', gestionar, planVigente, ctrl.crear);
router.post('/planes/:id/asignar-lotes', gestionar, planVigente, ctrl.asignarLotes);
router.get('/planes/:id', ver, ctrl.obtener);
router.put('/planes/:id', gestionar, planVigente, ctrl.actualizar);
router.get('/alimentos', ver, alimentacion.listarAlimentos);
router.post('/alimentos', gestionar, planVigente, alimentacion.crearAlimentoCtrl);
router.put('/alimentos/:id', gestionar, planVigente, alimentacion.actualizarAlimentoCtrl);
router.get('/raciones', ver, alimentacion.listarRaciones);
router.post('/raciones', gestionar, planVigente, alimentacion.crearRacionCtrl);
router.get('/raciones/:id', ver, alimentacion.obtenerRacion);
router.put('/raciones/:id', gestionar, planVigente, alimentacion.actualizarRacionCtrl);
router.get('/suministros', ver, alimentacion.listarSuministros);
router.post('/suministros', registrar, planVigente, alimentacion.crearSuministroCtrl);
router.get('/resumen-hoy', ver, alimentacion.resumenHoy);
router.get('/suministros/:id', ver, alimentacion.obtenerSuministro);
router.put('/suministros/:id', gestionar, planVigente, alimentacion.actualizarSuministroCtrl);
router.get('/origenes/cortes', ver, alimentacion.cortesDisponibles);

module.exports = router;
