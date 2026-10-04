const { Router } = require('express');
const { webhookStripe } = require('../controllers/facturacion-controller');

const router = Router();
router.post('/', webhookStripe);

module.exports = router;
