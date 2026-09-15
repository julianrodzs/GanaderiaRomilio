const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('reproduccion.ver');
const puedeGestionar = autorizarPermiso('reproduccion.gestionar');
const puedeEliminar = autorizarPermiso('reproduccion.eliminar');

const {
    getRegistros,
    createRegistro,
    getRegistro,
    getRegistrosPorAnimal,
    registrarTerneroDesdeParto,
    updateRegistro,
    deleteRegistro,
    cerrarCiclo,
    cancelarCiclo,
    marcarNoPrenada
} = require('../controllers/reproduccionController');

router.route('/')
    .get(puedeVer, getRegistros)
    .post(puedeGestionar, createRegistro);

router.get('/animal/:animalId', puedeVer, getRegistrosPorAnimal);
router.post('/:id/ternero', puedeGestionar, registrarTerneroDesdeParto);
router.patch('/:id/cerrar-ciclo', puedeGestionar, cerrarCiclo);
router.patch('/:id/cancelar-ciclo', puedeGestionar, cancelarCiclo);
router.patch('/:id/no-prenada', puedeGestionar, marcarNoPrenada);

router.route('/:id')
    .get(puedeVer, getRegistro)
    .put(puedeGestionar, updateRegistro)
    .delete(puedeEliminar, deleteRegistro);

module.exports = router;
