const { Router } = require('express');
const router = Router();
const { autorizarRoles } = require('../middleware/auth');
const puedeVer = autorizarRoles('Administrador', 'Encargado');
const soloAdministrador = autorizarRoles('Administrador');

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
    .post(soloAdministrador, createRegistro);

router.get('/animal/:animalId', puedeVer, getRegistrosPorAnimal);
router.post('/:id/ternero', soloAdministrador, registrarTerneroDesdeParto);
router.patch('/:id/cerrar-ciclo', soloAdministrador, cerrarCiclo);
router.patch('/:id/cancelar-ciclo', soloAdministrador, cancelarCiclo);
router.patch('/:id/no-prenada', soloAdministrador, marcarNoPrenada);

router.route('/:id')
    .get(puedeVer, getRegistro)
    .put(soloAdministrador, updateRegistro)
    .delete(soloAdministrador, deleteRegistro);

module.exports = router;
