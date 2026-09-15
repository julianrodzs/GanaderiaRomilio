const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const {
    getAuditoriaById,
    getAuditorias
} = require('../controllers/auditoria-controller');

const router = Router();
const soloAdministrador = autorizarPermiso('usuarios.gestionar');

router.use(soloAdministrador);

router.get('/', getAuditorias);
router.get('/:id', getAuditoriaById);

module.exports = router;
