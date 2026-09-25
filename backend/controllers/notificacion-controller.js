const {
    marcarComoLeida,
    marcarTodasComoLeidas,
    obtenerCantidadNoLeidas,
    obtenerNotificacionesUsuario
} = require('../services/notificacion-service');

const notificacionCtrl = {};

notificacionCtrl.getNotificaciones = async (req, res) => {
    try {
        res.json(await obtenerNotificacionesUsuario(req.usuario.id, req.query));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener notificaciones', error: error.message });
    }
};

notificacionCtrl.getCantidadNoLeidas = async (req, res) => {
    try {
        res.json({ cantidad: await obtenerCantidadNoLeidas(req.usuario.id) });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al contar notificaciones', error: error.message });
    }
};

notificacionCtrl.marcarLeida = async (req, res) => {
    try {
        const notificacion = await marcarComoLeida(req.params.id, req.usuario.id);
        if (!notificacion) return res.status(404).json({ mensaje: 'Notificación no encontrada' });
        res.json(notificacion);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al marcar la notificación', error: error.message });
    }
};

notificacionCtrl.marcarTodasLeidas = async (req, res) => {
    try {
        const resultado = await marcarTodasComoLeidas(req.usuario.id);
        res.json({ actualizadas: resultado.modifiedCount || 0 });
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al marcar las notificaciones', error: error.message });
    }
};

module.exports = notificacionCtrl;
