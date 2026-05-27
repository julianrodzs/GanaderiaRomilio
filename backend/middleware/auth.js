const crypto = require('crypto');

const base64UrlDecode = (valor) => {
    const base64 = valor.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
};

const firmar = (header, payload, secreto) => {
    return crypto
        .createHmac('sha256', secreto)
        .update(`${header}.${payload}`)
        .digest('base64url');
};

const base64UrlEncode = (valor) => {
    return Buffer.from(JSON.stringify(valor)).toString('base64url');
};

const generarToken = (payload, opciones = {}) => {
    const secreto = process.env.JWT_SECRET;

    if (!secreto) {
        throw new Error('JWT_SECRET no configurado');
    }

    const ahora = Math.floor(Date.now() / 1000);
    const expiraEn = opciones.expiraEnSegundos || 60 * 60 * 8;
    const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
    const datos = base64UrlEncode({
        ...payload,
        iat: ahora,
        exp: ahora + expiraEn
    });
    const firma = firmar(header, datos, secreto);

    return `${header}.${datos}.${firma}`;
};

const verificarToken = (token) => {
    const secreto = process.env.JWT_SECRET;

    if (!secreto) {
        throw new Error('JWT_SECRET no configurado');
    }

    const partes = token.split('.');

    if (partes.length !== 3) {
        throw new Error('Token invalido');
    }

    const [header, payload, firma] = partes;
    const firmaEsperada = firmar(header, payload, secreto);

    if (firma !== firmaEsperada) {
        throw new Error('Firma invalida');
    }

    const datos = JSON.parse(base64UrlDecode(payload));

    if (datos.exp && Date.now() >= datos.exp * 1000) {
        throw new Error('Token expirado');
    }

    return datos;
};

const auth = (req, res, next) => {
    try {
        const authorization = req.headers.authorization || '';
        const [tipo, token] = authorization.split(' ');

        if (tipo !== 'Bearer' || !token) {
            return res.status(401).json({ mensaje: 'Token de autenticacion requerido' });
        }

        req.usuario = verificarToken(token);
        next();
    } catch (error) {
        res.status(401).json({ mensaje: 'No autorizado', error: error.message });
    }
};

module.exports = {
    auth,
    generarToken,
    verificarToken
};
