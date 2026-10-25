const crypto = require('crypto');
const RateLimitSeguridad = require('../models/RateLimitSeguridad');

const normalizarCorreo = (correo = '') => String(correo || '').trim().toLowerCase();
const hashCorto = (valor = '') => crypto.createHash('sha256').update(String(valor)).digest('hex');

const consumirClave = async ({ clave, ventanaMs, maxIntentos }) => {
    const ahora = new Date();
    const ventanaHasta = new Date(ahora.getTime() + ventanaMs);
    const registro = await RateLimitSeguridad.findOneAndUpdate(
        { clave },
        [{
            $set: {
                clave,
                intentos: {
                    $cond: [
                        { $or: [{ $lte: ['$ventanaHasta', ahora] }, { $eq: [{ $type: '$ventanaHasta' }, 'missing'] }] },
                        1,
                        { $add: [{ $ifNull: ['$intentos', 0] }, 1] }
                    ]
                },
                ventanaHasta: {
                    $cond: [
                        { $or: [{ $lte: ['$ventanaHasta', ahora] }, { $eq: [{ $type: '$ventanaHasta' }, 'missing'] }] },
                        ventanaHasta,
                        '$ventanaHasta'
                    ]
                },
                expiraEn: {
                    $cond: [
                        { $or: [{ $lte: ['$ventanaHasta', ahora] }, { $eq: [{ $type: '$ventanaHasta' }, 'missing'] }] },
                        ventanaHasta,
                        '$ventanaHasta'
                    ]
                }
            }
        }],
        { upsert: true, new: true }
    ).lean();
    return {
        bloqueado: registro.intentos > maxIntentos,
        intentos: registro.intentos,
        reintentarEnSegundos: Math.max(Math.ceil((new Date(registro.ventanaHasta).getTime() - Date.now()) / 1000), 1)
    };
};

const crearRateLimitCapas = ({ accion, ventanaMs, maxIp, maxCuenta, obtenerCuenta, mensaje }) => async (req, res, next) => {
    try {
        const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
        const cuenta = obtenerCuenta(req);
        const claves = [{ clave: `${accion}:ip:${hashCorto(ip)}`, maxIntentos: maxIp }];
        if (cuenta) claves.push({ clave: `${accion}:cuenta:${hashCorto(cuenta)}`, maxIntentos: maxCuenta });
        const resultados = await Promise.all(claves.map(({ clave, maxIntentos }) => consumirClave({ clave, ventanaMs, maxIntentos })));
        const bloqueo = resultados.find((item) => item.bloqueado);
        if (bloqueo) {
            res.setHeader('Retry-After', String(bloqueo.reintentarEnSegundos));
            return res.status(429).json({ mensaje, reintentarEnSegundos: bloqueo.reintentarEnSegundos });
        }
        const mayorIntento = Math.max(...resultados.map((item) => item.intentos || 1));
        if (mayorIntento > 1) await new Promise((resolve) => setTimeout(resolve, Math.min((mayorIntento - 1) * 75, 1000)));
        return next();
    } catch (error) {
        console.error('No se pudo evaluar el límite distribuido de seguridad:', error.message);
        return res.status(503).json({ mensaje: 'Servicio temporalmente no disponible.' });
    }
};

const MENSAJE = 'Demasiadas solicitudes. Intenta de nuevo más tarde.';
const rateLimitLogin = crearRateLimitCapas({
    accion: 'login', ventanaMs: 15 * 60 * 1000, maxIp: 20, maxCuenta: 10,
    obtenerCuenta: (req) => normalizarCorreo(req.body?.correo), mensaje: MENSAJE
});
const rateLimitRecuperacion = crearRateLimitCapas({
    accion: 'recuperacion', ventanaMs: 30 * 60 * 1000, maxIp: 20, maxCuenta: 5,
    obtenerCuenta: (req) => normalizarCorreo(req.body?.correo) || hashCorto(req.body?.token || ''), mensaje: MENSAJE
});
const rateLimitInvitacion = crearRateLimitCapas({
    accion: 'invitacion', ventanaMs: 60 * 60 * 1000, maxIp: 30, maxCuenta: 3,
    obtenerCuenta: (req) => normalizarCorreo(req.body?.correo), mensaje: MENSAJE
});

module.exports = { consumirClave, crearRateLimitCapas, rateLimitInvitacion, rateLimitLogin, rateLimitRecuperacion };
