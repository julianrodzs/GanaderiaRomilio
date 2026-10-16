const { Router } = require('express');
const router = Router();

router.use((req, res) => res.status(410).json({
    mensaje: 'El registro independiente de costos fue retirado. Use Movimientos financieros para registrar ingresos y egresos.',
    codigo: 'COSTOS_LEGACY_RETIRED'
}));

module.exports = router;
