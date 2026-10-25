const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { requireFeature } = require('../middleware/plan');
const {
    exigirAccesoFincaObjetivo,
    exigirAlcanceOrganizacionalCompleto
} = require('../services/accesoFinca-service');
const { asegurarFincasOperativasPlan } = require('../services/plan-service');
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

const membresiaSolicitud = (req) => ({
    accesoTodasFincas: req.usuario?.accesoTodasFincas === true,
    fincas: req.usuario?.fincas || []
});

const autorizarFincaObjetivo = async (req, res, next) => {
    try {
        exigirAccesoFincaObjetivo(membresiaSolicitud(req), req.params.id);
        await asegurarFincasOperativasPlan({ organizacionId: req.organizacionId, fincaIds: [req.params.id] });
        next();
    } catch (error) {
        res.status(error.status || 403).json({ mensaje: error.message, code: error.code });
    }
};

const exigirAlcanceCompleto = (req, res, next) => {
    try {
        exigirAlcanceOrganizacionalCompleto(membresiaSolicitud(req));
        next();
    } catch (error) {
        res.status(error.status || 403).json({ mensaje: error.message, code: error.code });
    }
};

router.get('/', getFincas);
router.get('/traslados', operacionMultiFinca, autorizarPermiso('inventario.ver'), getTraslados);
router.post('/traslados', operacionMultiFinca, autorizarPermiso('inventario.gestionar'), trasladarAnimales);
router.get('/animales/:animalId/historial', operacionMultiFinca, autorizarPermiso('inventario.ver'), getHistorialFincaAnimal);
router.post('/', autorizarPermiso('usuarios.gestionar'), exigirAlcanceCompleto, createFinca);
router.put('/:id', autorizarPermiso('usuarios.gestionar'), autorizarFincaObjetivo, updateFinca);
router.patch('/:id/estado', autorizarPermiso('usuarios.gestionar'), autorizarFincaObjetivo, updateEstado);
router.patch('/:id/principal', autorizarPermiso('usuarios.gestionar'), exigirAlcanceCompleto, autorizarFincaObjetivo, setPrincipal);
router.patch('/:id/lineas-productivas', autorizarPermiso('usuarios.gestionar'), autorizarFincaObjetivo, updateLineasProductivas);

module.exports = router;
