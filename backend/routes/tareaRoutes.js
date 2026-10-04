const { Router } = require('express');
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
router.use(auth);

router.get('/', getTareas);
router.get('/mis-tareas', getMisTareas);
router.get('/:id', getTareaById);
router.post('/', crearTarea);
router.put('/:id', actualizarTarea);
router.patch('/:id/estado', cambiarEstadoTarea);
router.patch('/:id/completar', completarTarea);
router.post('/:id/comentarios', agregarComentario);
router.delete('/:id', eliminarTarea);

module.exports = router;
