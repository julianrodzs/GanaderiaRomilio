const multer = require('multer');
const { MIME_PERMITIDOS } = require('../services/almacenamientoR2-service');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!MIME_PERMITIDOS.has(file.mimetype)) {
            const error = new Error('La imagen debe estar en formato JPG, PNG o WebP.');
            error.status = 415;
            return cb(error);
        }
        return cb(null, true);
    }
});

const recibirImagenApariencia = (req, res, next) => {
    upload.single('imagen')(req, res, (error) => {
        if (!error) return next();
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ mensaje: 'La imagen no puede superar 8 MB.' });
        }
        return res.status(error.status || 400).json({ mensaje: error.message || 'No se pudo recibir la imagen.' });
    });
};

module.exports = { recibirImagenApariencia };
