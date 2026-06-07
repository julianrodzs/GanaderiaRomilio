const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const {
    actualizarTarea,
    agregarComentario,
    cambiarEstadoTarea,
    completarTarea,
    crearTarea,
    eliminarTarea,
    getMisTareas,
    getTareaById,
    getTareas
} = require('../controllers/tareaController');

const router = Router();
const uploadsDir = path.join(__dirname, '..', 'uploads', 'tareas');

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
        fileSize: 8 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Solo se permiten archivos de imagen'));
        }

        cb(null, true);
    }
});

router.use(auth);

router.get('/', getTareas);
router.get('/mis-tareas', getMisTareas);
router.get('/:id', getTareaById);
router.post('/', crearTarea);
router.put('/:id', actualizarTarea);
router.patch('/:id/estado', cambiarEstadoTarea);
router.patch('/:id/completar', upload.single('evidencia'), completarTarea);
router.post('/:id/comentarios', agregarComentario);
router.delete('/:id', eliminarTarea);

module.exports = router;
