const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const {
    actualizarVenta,
    anularVenta,
    crearVenta,
    deleteVenta,
    getResumenVentas,
    getVentaById,
    getVentas
} = require('../controllers/ventaAnimalController');

const router = Router();
const puedeVer = autorizarPermiso('ventas.ver');
const puedeGestionar = autorizarPermiso('ventas.gestionar');
const puedeEliminar = autorizarPermiso('ventas.eliminar');

router.get('/', puedeVer, getVentas);
router.get('/resumen', puedeVer, getResumenVentas);
router.get('/:id', puedeVer, getVentaById);
router.post('/', puedeGestionar, crearVenta);
router.put('/:id', puedeGestionar, actualizarVenta);
router.patch('/:id/anular', puedeGestionar, anularVenta);
router.delete('/:id', puedeEliminar, deleteVenta);

module.exports = router;
