const { Router } = require('express');
const multer = require('multer');
const { autorizarPermiso } = require('../middleware/auth');
const { requirePlanVigente } = require('../middleware/plan');
const { conTrabajoPesado } = require('../services/trabajosPesados-service');

const { descargarPlantilla, previewExcel, confirmarExcel } = require('../controllers/importar-controller');

const router = Router();
const puedeImportar = autorizarPermiso('importar.gestionar');
router.use(requirePlanVigente());

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: Number(process.env.IMPORT_MAX_BYTES || 5 * 1024 * 1024),
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const esExcel = file.originalname.toLowerCase().endsWith('.xlsx')
            && file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        if (!esExcel) {
            return cb(new Error('Solo se permiten archivos .xlsx'));
        }

        cb(null, true);
    }
});

router.get('/plantilla', puedeImportar, conTrabajoPesado(descargarPlantilla));
router.post('/excel', puedeImportar, conTrabajoPesado(upload.single('archivo'), previewExcel));
router.post('/excel/confirmar', puedeImportar, conTrabajoPesado(confirmarExcel));

router.use((error, req, res, next) => {
    if (!(error instanceof multer.MulterError) && !String(error?.message || '').includes('Solo se permiten')) return next(error);
    const mensaje = error.code === 'LIMIT_FILE_SIZE'
        ? `El archivo supera el máximo de ${Math.round(Number(process.env.IMPORT_MAX_BYTES || 5 * 1024 * 1024) / 1024 / 1024)} MB.`
        : error.message;
    return res.status(400).json({ mensaje, codigo: error.code || 'ARCHIVO_INVALIDO' });
});

module.exports = router;
