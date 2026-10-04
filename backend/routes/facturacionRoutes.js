const { Router } = require('express');
const { autorizarRoles } = require('../middleware/auth');
const {
    abrirPortal,
    iniciarCheckout,
    obtenerEstadoFacturacion
} = require('../controllers/facturacion-controller');

const router = Router();
router.use(autorizarRoles('Administrador'));
router.get('/estado', obtenerEstadoFacturacion);
router.post('/checkout', iniciarCheckout);
router.post('/portal', abrirPortal);

module.exports = router;
