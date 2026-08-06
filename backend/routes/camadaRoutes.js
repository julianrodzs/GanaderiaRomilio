const { Router } = require('express');
const router = Router();
const { autorizarRoles } = require('../middleware/auth');
const puedeVer = autorizarRoles('Administrador', 'Encargado');
const soloAdministrador = autorizarRoles('Administrador');

const {
    getCamadas,
    getCamada,
    getCamadasPorMadre,
    createCamada,
    updateCamada,
    registrarDestete,
    cerrarCamada,
    cancelarCamada,
    deleteCamada
} = require('../controllers/camadaController');

router.route('/')
    .get(puedeVer, getCamadas)
    .post(soloAdministrador, createCamada);

router.get('/madre/:madreId', puedeVer, getCamadasPorMadre);
router.patch('/:id/destete', soloAdministrador, registrarDestete);
router.patch('/:id/cerrar', soloAdministrador, cerrarCamada);
router.patch('/:id/cancelar', soloAdministrador, cancelarCamada);

router.route('/:id')
    .get(puedeVer, getCamada)
    .put(soloAdministrador, updateCamada)
    .delete(soloAdministrador, deleteCamada);

module.exports = router;
