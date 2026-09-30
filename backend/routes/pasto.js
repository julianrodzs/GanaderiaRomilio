const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const { getPastos } = require('../controllers/pasto-controller');

const router = Router();
router.get('/', autorizarPermiso('potreros.ver'), getPastos);

module.exports = router;
