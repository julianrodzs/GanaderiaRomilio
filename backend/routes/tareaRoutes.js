const { requirePlanVigente } = require('../middleware/plan');
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
router.post('/', requirePlanVigente(), crearTarea);
router.put('/:id', requirePlanVigente(), actualizarTarea);
router.patch('/:id/estado', requirePlanVigente(), cambiarEstadoTarea);
router.patch('/:id/completar', requirePlanVigente(), completarTarea);
router.post('/:id/comentarios', requirePlanVigente(), agregarComentario);
router.delete('/:id', requirePlanVigente(), eliminarTarea);

module.exports = router;
