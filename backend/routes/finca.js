const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { getFincas, updateLineasProductivas } = require('../controllers/finca-controller');

const router = Router();

router.get('/', getFincas);
router.patch('/:id/lineas-productivas', autorizarPermiso('usuarios.gestionar'), updateLineasProductivas);

module.exports = router;
