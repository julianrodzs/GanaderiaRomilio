const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const multer = require('multer');
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
const uploadsDir = path.join(__dirname, '..', 'uploads', 'ventas');

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

router.get('/', getVentas);
router.get('/resumen', getResumenVentas);
router.get('/:id', getVentaById);
router.post('/', upload.single('comprobante'), crearVenta);
router.put('/:id', upload.single('comprobante'), actualizarVenta);
router.patch('/:id/anular', anularVenta);
router.delete('/:id', deleteVenta);

module.exports = router;
