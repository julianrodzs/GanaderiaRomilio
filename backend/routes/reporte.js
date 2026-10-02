const { Router } = require('express');
const router = Router();
const { obtenerReporteLotes, obtenerReporteLotesAnalitica } = require('../controllers/reporteLotes-controller');
const { autorizarPermiso } = require('../middleware/auth');
const puedeVer = autorizarPermiso('reportes.ver');
const { requireFeature } = require('../middleware/plan');
const analiticaProductiva = requireFeature('analiticaProductiva');
const analiticaEconomica = requireFeature('analiticaEconomica');
const {
    getRendimientoPotreros,
    getRendimientoPorPasto
} = require('../controllers/potrero-controller');

const {
    getResumenReportes,
    getProductividadCria,
    getFinanzasCria,
    getSustentabilidadCria,
    getVacasImproductivas,
    getCrecimientoPesajes,
    getProductosResumen,
    getProductosPorProducto,
    getProductosPorCategoria,
    getProductosCombustibles,
    getProductosPrecioPromedio,
    getProductosProveedores,
    getProductosDestinos,
    getProductosTop,
    getReporteCamadas,
    getReporteReproductivoPorcino,
    getReporteTareasCamadas,
    getReporteEconomicoCamadas,
    getReporteSanidad,
    getReporteComprasAnimales,
    getCrecimientoPorcino,
    getEficienciaEngorde,
    getConfiguracionProductiva,
    updateConfiguracionProductiva,
    getRazasBovinas,
    getDescendenciaBovina
    ,getRendimientoForrajes
} = require('../controllers/reporte-controller');

router.use(puedeVer);

router.get('/resumen', getResumenReportes);
router.get('/lotes', obtenerReporteLotes);
router.get('/lotes/analitica', analiticaProductiva, obtenerReporteLotesAnalitica);
router.get('/productividad', analiticaProductiva, getProductividadCria);
router.get('/finanzas-cria', analiticaEconomica, getFinanzasCria);
router.get('/sustentabilidad-cria', analiticaEconomica, getSustentabilidadCria);
router.get('/vacas-improductivas', analiticaProductiva, getVacasImproductivas);
router.get('/crecimiento-pesajes', analiticaProductiva, getCrecimientoPesajes);
router.get('/porcinos/crecimiento', analiticaProductiva, getCrecimientoPorcino);
router.get('/engorde', analiticaProductiva, getEficienciaEngorde);
router.get('/potreros/rendimiento', analiticaProductiva, getRendimientoPotreros);
router.get('/potreros/por-pasto', analiticaProductiva, getRendimientoPorPasto);
router.get('/forrajes/rendimiento', analiticaProductiva, getRendimientoForrajes);
router.get('/bovinos/razas', analiticaProductiva, getRazasBovinas);
router.get('/razas', analiticaProductiva, getRazasBovinas);
router.get('/bovinos/descendencia', analiticaProductiva, getDescendenciaBovina);
router.get('/configuracion-productiva', analiticaProductiva, getConfiguracionProductiva);
router.put('/configuracion-productiva', analiticaProductiva, autorizarPermiso('reportes.configurar'), updateConfiguracionProductiva);
router.get('/productos/resumen', getProductosResumen);
router.get('/productos/por-producto', getProductosPorProducto);
router.get('/productos/por-categoria', getProductosPorCategoria);
router.get('/productos/combustibles', getProductosCombustibles);
router.get('/productos/precio-promedio', getProductosPrecioPromedio);
router.get('/productos/proveedores', getProductosProveedores);
router.get('/productos/destinos', getProductosDestinos);
router.get('/productos/top', getProductosTop);
router.get('/porcinos/camadas', getReporteCamadas);
router.get('/porcinos/reproduccion', analiticaProductiva, getReporteReproductivoPorcino);
router.get('/porcinos/tareas-camadas', getReporteTareasCamadas);
router.get('/porcinos/economia-camadas', analiticaEconomica, getReporteEconomicoCamadas);
router.get('/sanidad', getReporteSanidad);
router.get('/compras-animales', analiticaEconomica, getReporteComprasAnimales);

module.exports = router;
