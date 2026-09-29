const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { crearUploadOrganizacion } = require('../middleware/uploadOrganizacion');
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

const upload = crearUploadOrganizacion({
    categoria: 'ventas',
    limiteMb: 10,
    tiposPermitidos: (file) => file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'
});

router.get('/', puedeVer, getVentas);
router.get('/resumen', puedeVer, getResumenVentas);
router.get('/:id', puedeVer, getVentaById);
router.post('/', puedeGestionar, upload.single('comprobante'), crearVenta);
router.put('/:id', puedeGestionar, upload.single('comprobante'), actualizarVenta);
router.patch('/:id/anular', puedeGestionar, anularVenta);
router.delete('/:id', puedeEliminar, deleteVenta);

module.exports = router;
