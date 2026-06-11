const { Router } = require('express');
const router = Router();

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
    getProductosTop
} = require('../controllers/reporte-controller');

router.get('/resumen', getResumenReportes);
router.get('/productividad', getProductividadCria);
router.get('/finanzas-cria', getFinanzasCria);
router.get('/sustentabilidad-cria', getSustentabilidadCria);
router.get('/vacas-improductivas', getVacasImproductivas);
router.get('/crecimiento-pesajes', getCrecimientoPesajes);
router.get('/productos/resumen', getProductosResumen);
router.get('/productos/por-producto', getProductosPorProducto);
router.get('/productos/por-categoria', getProductosPorCategoria);
router.get('/productos/combustibles', getProductosCombustibles);
router.get('/productos/precio-promedio', getProductosPrecioPromedio);
router.get('/productos/proveedores', getProductosProveedores);
router.get('/productos/destinos', getProductosDestinos);
router.get('/productos/top', getProductosTop);

module.exports = router;
