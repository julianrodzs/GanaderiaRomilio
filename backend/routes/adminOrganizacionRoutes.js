const { Router } = require('express');
const {
    cambiarEstadoOrganizacion,
    crearOrganizacion,
    listarOrganizaciones,
    registrarPago, cambiarSuscripcion, anularPago, listarPagos, resumenCartera
} = require('../controllers/adminOrganizacion-controller');

const router = Router();

router.route('/')
    .get(listarOrganizaciones)
    .post(crearOrganizacion);

router.patch('/:id/estado', cambiarEstadoOrganizacion);
router.get('/cartera/resumen', resumenCartera);
router.route('/:id/pagos').get(listarPagos).post(registrarPago);
router.post('/:id/pagos/:pagoId/anular', anularPago);
router.patch('/:id/suscripcion', cambiarSuscripcion);

module.exports = router;
