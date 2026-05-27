const { Router } = require('express');
const router = Router();

const { getEstadoModulo } = require('../controllers/conteoDrone-controller');

router.get('/', getEstadoModulo);

module.exports = router;
