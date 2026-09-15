const { Router } = require('express');
const multer = require('multer');
const { autorizarPermiso } = require('../middleware/auth');

const { previewExcel, confirmarExcel, importarExcelDirecto } = require('../controllers/importar-controller');

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

router.post('/excel', puedeImportar, upload.single('archivo'), previewExcel);
router.post('/excel/confirmar', puedeImportar, confirmarExcel);
router.post('/excel/importar', puedeImportar, upload.single('archivo'), importarExcelDirecto);

module.exports = router;
