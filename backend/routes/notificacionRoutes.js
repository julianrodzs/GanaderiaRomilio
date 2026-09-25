const { Router } = require('express');
const notificacionCtrl = require('../controllers/notificacion-controller');

const router = Router();

router.get('/', notificacionCtrl.getNotificaciones);
router.get('/no-leidas/count', notificacionCtrl.getCantidadNoLeidas);
router.patch('/marcar-todas-leidas', notificacionCtrl.marcarTodasLeidas);
router.patch('/:id/leida', notificacionCtrl.marcarLeida);

module.exports = router;
