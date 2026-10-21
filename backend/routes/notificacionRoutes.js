const { requirePlanVigente } = require('../middleware/plan');
const { Router } = require('express');
const notificacionCtrl = require('../controllers/notificacion-controller');

const router = Router();

router.get('/', notificacionCtrl.getNotificaciones);
router.get('/no-leidas/count', notificacionCtrl.getCantidadNoLeidas);
router.patch('/marcar-todas-leidas', requirePlanVigente(), notificacionCtrl.marcarTodasLeidas);
router.patch('/:id/leida', requirePlanVigente(), notificacionCtrl.marcarLeida);

module.exports = router;
