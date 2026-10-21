const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const { requirePlanVigente } = require('../middleware/plan');
const puedeVer = autorizarPermiso('reproduccion.ver');
const puedeGestionar = autorizarPermiso('reproduccion.gestionar');
const puedeEliminar = autorizarPermiso('reproduccion.eliminar');
const planVigente = requirePlanVigente();

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
router.get('/insumos/semen', puedeVer, getSemenDisponible);
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
