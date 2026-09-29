const { Router } = require('express');
const {
    cambiarEstadoOrganizacion,
    crearOrganizacion,
    listarOrganizaciones
} = require('../controllers/adminOrganizacion-controller');

const router = Router();

router.route('/')
    .get(listarOrganizaciones)
    .post(crearOrganizacion);

router.patch('/:id/estado', cambiarEstadoOrganizacion);

module.exports = router;
