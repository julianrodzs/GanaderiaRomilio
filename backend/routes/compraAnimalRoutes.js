const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const multer = require('multer');
const { autorizarPermiso } = require('../middleware/auth');
const {
    actualizarCompra,
    anularCompra,
    crearCompra,
    deleteCompra,
    getCompraById,
    getCompras,
    getResumenCompras
} = require('../controllers/compraAnimalController');

const router = Router();
const uploadsDir = path.join(__dirname, '..', 'uploads', 'compras');
const puedeVer = autorizarPermiso('compras.ver');
const puedeGestionar = autorizarPermiso('compras.gestionar');
const puedeEliminar = autorizarPermiso('compras.eliminar');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(uploadsDir, { recursive: true });
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const permitido = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
        if (!permitido) {
            return cb(new Error('Solo se permiten imagenes o PDF'));
        }

        cb(null, true);
    }
});

router.get('/', puedeVer, getCompras);
router.get('/resumen', puedeVer, getResumenCompras);
router.get('/:id', puedeVer, getCompraById);
router.post('/', puedeGestionar, upload.single('comprobante'), crearCompra);
router.put('/:id', puedeGestionar, upload.single('comprobante'), actualizarCompra);
router.patch('/:id/anular', puedeGestionar, anularCompra);
router.delete('/:id', puedeEliminar, deleteCompra);

module.exports = router;
