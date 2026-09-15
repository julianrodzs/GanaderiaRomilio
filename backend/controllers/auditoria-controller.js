const Auditoria = require('../models/Auditoria');

const auditoriaCtrl = {};

const construirFiltroFecha = ({ fechaInicio, fechaFin }) => {
    if (!fechaInicio && !fechaFin) return undefined;

    const filtro = {};
    if (fechaInicio) filtro.$gte = new Date(fechaInicio);
    if (fechaFin) {
        const fin = new Date(fechaFin);
        fin.setUTCHours(23, 59, 59, 999);
        filtro.$lte = fin;
    }
    return filtro;
};

auditoriaCtrl.getAuditorias = async (req, res) => {
    try {
        const {
            fechaInicio,
            fechaFin,
            usuario,
            modulo,
            accion,
            estado,
            limite = 100
        } = req.query;

        const filtro = {};
        const filtroFecha = construirFiltroFecha({ fechaInicio, fechaFin });
        if (filtroFecha) filtro.createdAt = filtroFecha;
        if (usuario) filtro.usuario = usuario;
        if (modulo) filtro.modulo = modulo;
        if (accion) filtro.accion = accion;
        if (estado) filtro.estado = estado;

        const limiteSeguro = Math.min(Math.max(Number(limite) || 100, 1), 500);
        const auditorias = await Auditoria.find(filtro)
            .populate('usuario', 'nombre apellido correo rol estado')
            .sort({ createdAt: -1 })
            .limit(limiteSeguro);

        res.json(auditorias);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener auditoria', error: error.message });
    }
};

auditoriaCtrl.getAuditoriaById = async (req, res) => {
    try {
        const auditoria = await Auditoria.findById(req.params.id)
            .populate('usuario', 'nombre apellido correo rol estado');

        if (!auditoria) {
            return res.status(404).json({ mensaje: 'Registro de auditoria no encontrado' });
        }

        res.json(auditoria);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener detalle de auditoria', error: error.message });
    }
};

module.exports = auditoriaCtrl;
