const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { getPlanActual, seleccionarEspeciePlan } = require('../controllers/plan-controller');

const router = Router();

router.get('/actual', getPlanActual);
router.patch('/especie', autorizarPermiso('usuarios.gestionar'), seleccionarEspeciePlan);

module.exports = router;
