const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const multer = require('multer');

const {
    getConteos,
    procesarConteo,
    getConteo,
    deleteConteo
} = require('../controllers/conteoDroneController');

const router = Router();
const uploadsDir = path.join(__dirname, '..', 'uploads', 'conteo-drone');

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
        fileSize: 12 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const esImagen = file.mimetype.startsWith('image/');

        if (!esImagen) {
            return cb(new Error('Solo se permiten archivos de imagen'));
        }

        cb(null, true);
    }
});

router.get('/', getConteos);
router.post('/procesar', upload.single('imagen'), procesarConteo);
router.get('/:id', getConteo);
router.delete('/:id', deleteConteo);

module.exports = router;
