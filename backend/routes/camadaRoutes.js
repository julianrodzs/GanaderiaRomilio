const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('camadas.ver');
const puedeGestionar = autorizarPermiso('camadas.gestionar');
const puedeEliminar = autorizarPermiso('reproduccion.eliminar');

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
    .post(puedeGestionar, createCamada);

router.get('/madre/:madreId', puedeVer, getCamadasPorMadre);
router.patch('/:id/destete', puedeGestionar, registrarDestete);
router.patch('/:id/cerrar', puedeGestionar, cerrarCamada);
router.patch('/:id/cancelar', puedeGestionar, cancelarCamada);

router.route('/:id')
    .get(puedeVer, getCamada)
    .put(puedeGestionar, updateCamada)
    .delete(puedeEliminar, deleteCamada);

module.exports = router;
