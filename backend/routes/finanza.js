const { Router } = require('express');
const router = Router();
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('finanzas.ver');
const puedeGestionar = autorizarPermiso('finanzas.gestionar');
const puedeAdministrarCatalogos = autorizarPermiso('finanzas.administrarCatalogos');
const puedeVerReportes = autorizarPermiso('reportes.ver');

const {
    getMovimientos,
    createMovimiento,
    getResumen,
    getResumenConsumo,
    getResumenPlanilla,
    getResumenInversiones,
    getResumenDestinos,
    getRevisionDatos,
    getMovimientosPorTipo,
    updateMovimiento,
    deleteMovimiento
} = require('../controllers/movimientoFinanciero-controller');

const {
    activarCatalogo,
    actualizarCatalogo,
    crearCatalogo,
    desactivarCatalogo,
    eliminarCatalogo,
    getCatalogosAdmin,
    getCatalogosPublicos
} = require('../controllers/catalogoFinanciero-controller');

router.route('/')
    .get(puedeVer, getMovimientos)
    .post(puedeGestionar, createMovimiento);

router.get('/resumen', puedeVer, getResumen);
router.get('/consumo', puedeVer, getResumenConsumo);
router.get('/planilla-resumen', puedeVer, getResumenPlanilla);
router.get('/inversiones-resumen', puedeVer, getResumenInversiones);
router.get('/catalogos', puedeVer, getCatalogosPublicos);
router.get('/catalogos/admin', puedeAdministrarCatalogos, getCatalogosAdmin);
router.post('/catalogos', puedeAdministrarCatalogos, crearCatalogo);
router.put('/catalogos/:id', puedeAdministrarCatalogos, actualizarCatalogo);
router.patch('/catalogos/:id/desactivar', puedeAdministrarCatalogos, desactivarCatalogo);
router.patch('/catalogos/:id/activar', puedeAdministrarCatalogos, activarCatalogo);
router.delete('/catalogos/:id', puedeAdministrarCatalogos, eliminarCatalogo);
router.get('/destinos-resumen', puedeVerReportes, getResumenDestinos);
router.get('/revision-datos', puedeVer, getRevisionDatos);
router.get('/tipo/:tipoMovimiento', puedeVer, getMovimientosPorTipo);

router.route('/:id')
    .put(puedeGestionar, updateMovimiento)
    .delete(puedeGestionar, deleteMovimiento);

module.exports = router;
