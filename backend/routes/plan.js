const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { actualizarFincasOperativas, getPlanActual, seleccionarEspeciePlan } = require('../controllers/plan-controller');

const router = Router();

router.get('/actual', getPlanActual);
router.patch('/especie', autorizarPermiso('usuarios.gestionar'), seleccionarEspeciePlan);
router.put('/fincas-operativas', autorizarPermiso('usuarios.gestionar'), actualizarFincasOperativas);

module.exports = router;
