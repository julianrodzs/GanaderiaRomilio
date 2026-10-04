const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { requireFeature } = require('../middleware/plan');
const operacionMultiFinca = requireFeature('operacionMultiFinca');
const {
    createFinca,
    getFincas,
    setPrincipal,
    updateEstado,
    updateFinca,
    updateLineasProductivas
} = require('../controllers/finca-controller');
const {
    getHistorialFincaAnimal,
    getTraslados,
    trasladarAnimales
} = require('../controllers/consolidacionMultiFinca-controller');

const router = Router();

router.get('/', getFincas);
router.get('/traslados', operacionMultiFinca, autorizarPermiso('inventario.ver'), getTraslados);
router.post('/traslados', operacionMultiFinca, autorizarPermiso('inventario.gestionar'), trasladarAnimales);
router.get('/animales/:animalId/historial', operacionMultiFinca, autorizarPermiso('inventario.ver'), getHistorialFincaAnimal);
router.post('/', autorizarPermiso('usuarios.gestionar'), createFinca);
router.put('/:id', autorizarPermiso('usuarios.gestionar'), updateFinca);
router.patch('/:id/estado', autorizarPermiso('usuarios.gestionar'), updateEstado);
router.patch('/:id/principal', autorizarPermiso('usuarios.gestionar'), setPrincipal);
router.patch('/:id/lineas-productivas', autorizarPermiso('usuarios.gestionar'), updateLineasProductivas);

module.exports = router;
