const { Router } = require('express');
const multer = require('multer');
const { autorizarPermiso } = require('../middleware/auth');

const { descargarPlantilla, previewExcel, confirmarExcel } = require('../controllers/importar-controller');

const router = Router();
const puedeImportar = autorizarPermiso('importar.gestionar');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const esExcel = file.originalname.toLowerCase().endsWith('.xlsx')
            || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        if (!esExcel) {
            return cb(new Error('Solo se permiten archivos .xlsx'));
        }

        cb(null, true);
    }
});

router.get('/plantilla', puedeImportar, descargarPlantilla);
router.post('/excel', puedeImportar, upload.single('archivo'), previewExcel);
router.post('/excel/confirmar', puedeImportar, confirmarExcel);

module.exports = router;
