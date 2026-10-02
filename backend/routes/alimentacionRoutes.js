const router = require('express').Router();
const { autorizarPermiso } = require('../middleware/auth');
const ctrl = require('../controllers/planAlimentacion-controller');
const alimentacion = require('../controllers/alimentacion-controller');

const ver = autorizarPermiso('alimentacion.ver');
const gestionar = autorizarPermiso('alimentacion.gestionar');
const registrar = autorizarPermiso('alimentacion.registrarSuministros');

router.get('/planes', ver, ctrl.listar);
router.post('/planes', gestionar, ctrl.crear);
router.post('/planes/:id/asignar-lotes', gestionar, ctrl.asignarLotes);
router.get('/planes/:id', ver, ctrl.obtener);
router.put('/planes/:id', gestionar, ctrl.actualizar);
router.get('/alimentos', ver, alimentacion.listarAlimentos);
router.post('/alimentos', gestionar, alimentacion.crearAlimentoCtrl);
router.put('/alimentos/:id', gestionar, alimentacion.actualizarAlimentoCtrl);
router.get('/raciones', ver, alimentacion.listarRaciones);
router.post('/raciones', gestionar, alimentacion.crearRacionCtrl);
router.get('/raciones/:id', ver, alimentacion.obtenerRacion);
router.put('/raciones/:id', gestionar, alimentacion.actualizarRacionCtrl);
router.get('/suministros', ver, alimentacion.listarSuministros);
router.post('/suministros', registrar, alimentacion.crearSuministroCtrl);
router.get('/resumen-hoy', ver, alimentacion.resumenHoy);
router.get('/suministros/:id', ver, alimentacion.obtenerSuministro);
router.put('/suministros/:id', gestionar, alimentacion.actualizarSuministroCtrl);
router.get('/origenes/cortes', ver, alimentacion.cortesDisponibles);

module.exports = router;
