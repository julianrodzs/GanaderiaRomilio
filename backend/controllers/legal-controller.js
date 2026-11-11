const crypto = require('node:crypto');
const Invitacion = require('../models/Invitacion');
const Organizacion = require('../models/Organizacion');
const { documentos, metadatos, obtenerDocumento } = require('../config/documentosLegales');
const legal = require('../services/legal-service');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');

const contextoInvitacion = async (req, res) => {
    try {
        const token = req.query.token;
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ mensaje: 'La invitación es inválida o ha expirado.' });
        const invitacion = await Invitacion.findOne({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), estado: 'Pendiente', expiraEn: { $gt: new Date() } }).lean();
        if (!invitacion) return res.status(400).json({ mensaje: 'La invitación es inválida o ha expirado.' });
        const org = await Organizacion.findById(invitacion.organizacionId).select('nombre').lean();
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ escenario: legal.escenarioInvitacion(invitacion),
            organizacionNombre: org?.nombre || '', requiereCuentaExistente: Boolean(invitacion.usuario && !invitacion.requiereContrasena), documentos: metadatos(), borrador: true });
    } catch (error) { return res.status(500).json({ mensaje: 'No se pudo consultar la invitación.' }); }
};
const listarDocumentos = (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); if (documentos.some((d) => d.estado === 'BORRADOR_PRUEBA')) res.setHeader('X-Robots-Tag', 'noindex'); return res.json(documentos); };
const verDocumento = (req, res) => {
    const d = obtenerDocumento(req.params.slug);
    if (!d) return res.status(404).json({ mensaje: 'Documento público no encontrado.' });
    if (d.estado === 'BORRADOR_PRUEBA') res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'no-cache'); return res.json(d);
};
const verEstado = async (req, res) => {
    try { res.setHeader('Cache-Control', 'no-store'); res.json(await legal.estadoLegal(req.usuario.id, req.organizacionId)); }
    catch (e) { res.status(e.status || 500).json({ mensaje: e.message }); }
};
const guardar = (soloComunicaciones) => async (req, res) => {
    try {
        await ejecutarEnTransaccion((session) => legal.registrar({ entrada: req.body, usuarioId: req.usuario.id, organizacionId: req.organizacionId,
            rol: req.usuario.rol, contexto: soloComunicaciones ? 'ACTUALIZACION_CONSENTIMIENTO' : 'PANEL_CUENTA', soloComunicaciones, session,
            ip: req.ip || req.socket?.remoteAddress || '', userAgent: req.get('user-agent') || '' }));
        res.json(await legal.estadoLegal(req.usuario.id, req.organizacionId));
    } catch (e) { res.status(e.code === 11000 ? 409 : (e.status || 400)).json({ mensaje: e.code === 11000 ? 'La solicitud legal ya fue registrada. Actualiza el historial.' : e.message }); }
};
module.exports = { contextoInvitacion, listarDocumentos, verDocumento, verEstado, guardarAceptaciones: guardar(false), guardarComunicaciones: guardar(true) };
