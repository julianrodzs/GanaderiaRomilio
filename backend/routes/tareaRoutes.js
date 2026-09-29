const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { crearUploadOrganizacion } = require('../middleware/uploadOrganizacion');
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
const upload = crearUploadOrganizacion({
    categoria: 'tareas',
    limiteMb: 8,
    tiposPermitidos: (file) => file.mimetype.startsWith('image/')
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
