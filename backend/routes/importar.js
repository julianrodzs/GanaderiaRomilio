const { Router } = require('express');
const multer = require('multer');

const { previewExcel, confirmarExcel, importarExcelDirecto } = require('../controllers/importar-controller');

const router = Router();

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

router.post('/excel', upload.single('archivo'), previewExcel);
router.post('/excel/confirmar', confirmarExcel);
router.post('/excel/importar', upload.single('archivo'), importarExcelDirecto);

module.exports = router;
