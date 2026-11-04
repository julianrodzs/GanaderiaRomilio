const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const { requirePlanVigente, requireFeature } = require('../middleware/plan');
const puedeVer = autorizarPermiso('reproduccion.ver');
const puedeGestionar = autorizarPermiso('reproduccion.gestionar');
const puedeEliminar = autorizarPermiso('reproduccion.eliminar');
const planVigente = requirePlanVigente();
const metodos = require('../controllers/metodoReproductivo-controller');
const programaTE = require('../controllers/programaTransferencia-controller');
const programaAnterior = (req, res) => res.status(409).json({ mensaje: 'Use el programa TE integral. El inventario anterior se conserva para migracion y consulta.', code: 'TE_ACTUALIZAR_CLIENTE' });

const {
    getRegistros,
    createRegistro,
    getRegistro,
    getSemenDisponible,
    getRegistrosPorAnimal,
    registrarTerneroDesdeParto,
    updateRegistro,
    deleteRegistro,
    cerrarCiclo,
    reabrirCiclo,
    cancelarCiclo,
    marcarNoPrenada
} = require('../controllers/reproduccionController');

router.route('/')
    .get(puedeVer, getRegistros)
    .post(puedeGestionar, planVigente, createRegistro);

router.get('/animal/:animalId', puedeVer, getRegistrosPorAnimal);
router.get('/programa-te/colectas', puedeVer, requireFeature('programaTransferencia'), programaTE.listar);
router.post('/programa-te/colectas', puedeGestionar, requireFeature('programaTransferencia', { codigoDenegado: 'PLAN_UPGRADE_REQUIRED' }), programaAnterior);
router.post('/programa-te/colectas/:id/programar', puedeGestionar, requireFeature('programaTransferencia', { codigoDenegado: 'PLAN_UPGRADE_REQUIRED' }), programaAnterior);
router.post('/programa-te/colectas/:id/transferir', puedeGestionar, requireFeature('programaTransferencia', { codigoDenegado: 'PLAN_UPGRADE_REQUIRED' }), programaAnterior);
router.post('/:id/servicios', puedeGestionar, planVigente, metodos.operacion('servicios'));
router.post('/:id/diagnosticos', puedeGestionar, planVigente, metodos.operacion('diagnosticos'));
router.post('/:id/resultado', puedeGestionar, planVigente, metodos.operacion('resultado'));
router.post('/:id/atribucion', puedeGestionar, planVigente, metodos.operacion('atribucion'));
router.get('/insumos/semen', puedeVer, getSemenDisponible);
router.post('/:id/inseminacion/anular', puedeGestionar, requireFeature('iatfReproductivo'), require('../controllers/bancoSemen-controller').anularInseminacion);
router.post('/:id/ternero', puedeGestionar, planVigente, registrarTerneroDesdeParto);
router.patch('/:id/cerrar-ciclo', puedeGestionar, planVigente, cerrarCiclo);
router.patch('/:id/reabrir-ciclo', puedeGestionar, planVigente, reabrirCiclo);
router.patch('/:id/cancelar-ciclo', puedeGestionar, planVigente, cancelarCiclo);
router.patch('/:id/no-prenada', puedeGestionar, planVigente, marcarNoPrenada);

router.route('/:id')
    .get(puedeVer, getRegistro)
    .put(puedeGestionar, planVigente, updateRegistro)
    .delete(puedeEliminar, planVigente, deleteRegistro);

module.exports = router;
