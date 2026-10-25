const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { recibirImagenApariencia } = require('../middleware/uploadApariencia');
const ctrl = require('../controllers/apariencia-controller');
const { exigirAccesoFincaObjetivo } = require('../services/accesoFinca-service');
const { asegurarFincasOperativasPlan } = require('../services/plan-service');

const router = Router();
const administrar = autorizarPermiso('usuarios.gestionar');
const autorizarFinca = async (req, res, next) => {
    try {
        exigirAccesoFincaObjetivo({
            accesoTodasFincas: req.usuario?.accesoTodasFincas,
            fincas: req.usuario?.fincas || []
        }, req.params.fincaId);
        await asegurarFincasOperativasPlan({ organizacionId: req.organizacionId, fincaIds: [req.params.fincaId] });
        next();
    } catch (error) {
        res.status(error.status || 403).json({ mensaje: error.message, code: error.code });
    }
};

router.get('/', ctrl.getActual);
router.get('/configuracion', administrar, ctrl.getConfiguracion);
router.post('/organizacion/logo', administrar, recibirImagenApariencia, ctrl.postLogo);
router.post('/fincas/:fincaId/:tipo', administrar, autorizarFinca, recibirImagenApariencia, ctrl.postImagenFinca);
router.patch('/fincas/:fincaId/reutilizar-dashboard', administrar, autorizarFinca, ctrl.patchReutilizarDashboard);
router.delete('/:alcance/:tipo', administrar, ctrl.deleteImagen);

module.exports = router;
