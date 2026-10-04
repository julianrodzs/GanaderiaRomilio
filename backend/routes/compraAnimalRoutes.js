const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const {
    actualizarCompra,
    anularCompra,
    crearCompra,
    deleteCompra,
    getCompraById,
    getCompras,
    getResumenCompras,
    asignarCompraALote
} = require('../controllers/compraAnimalController');

const router = Router();
const puedeVer = autorizarPermiso('compras.ver');
const puedeGestionar = autorizarPermiso('compras.gestionar');
const puedeEliminar = autorizarPermiso('compras.eliminar');

router.get('/', puedeVer, getCompras);
router.get('/resumen', puedeVer, getResumenCompras);
router.get('/:id', puedeVer, getCompraById);
router.post('/', puedeGestionar, crearCompra);
router.put('/:id', puedeGestionar, actualizarCompra);
router.patch('/:id/anular', puedeGestionar, anularCompra);
router.post('/:id/asignar-lote', puedeGestionar, asignarCompraALote);
router.delete('/:id', puedeEliminar, deleteCompra);

module.exports = router;
