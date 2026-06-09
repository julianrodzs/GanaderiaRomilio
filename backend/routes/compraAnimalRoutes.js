const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const multer = require('multer');
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

router.get('/', getCompras);
router.get('/resumen', getResumenCompras);
router.get('/:id', getCompraById);
router.post('/', upload.single('comprobante'), crearCompra);
router.put('/:id', upload.single('comprobante'), actualizarCompra);
router.patch('/:id/anular', anularCompra);
router.delete('/:id', deleteCompra);

module.exports = router;
