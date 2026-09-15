const registros = new Map();

const limpiarExpirados = () => {
    const ahora = Date.now();
    for (const [clave, registro] of registros.entries()) {
        if (registro.expiraEn <= ahora) {
            registros.delete(clave);
        }
    }
};

const crearRateLimit = ({
    ventanaMs,
    maxIntentos,
    mensaje,
    keyGenerator
}) => (req, res, next) => {
    limpiarExpirados();

    const clave = keyGenerator ? keyGenerator(req) : req.ip;
    const ahora = Date.now();
    const registro = registros.get(clave) || {
        intentos: 0,
        expiraEn: ahora + ventanaMs
    };

    if (registro.expiraEn <= ahora) {
        registro.intentos = 0;
        registro.expiraEn = ahora + ventanaMs;
    }

    registro.intentos += 1;
    registros.set(clave, registro);

    const restante = Math.max(maxIntentos - registro.intentos, 0);
    res.setHeader('X-RateLimit-Limit', String(maxIntentos));
    res.setHeader('X-RateLimit-Remaining', String(restante));

    if (registro.intentos > maxIntentos) {
        const segundos = Math.ceil((registro.expiraEn - ahora) / 1000);
        res.setHeader('Retry-After', String(segundos));
        return res.status(429).json({
            mensaje,
            reintentarEnSegundos: segundos
        });
    }

    next();
};

const normalizarCorreo = (correo = '') => String(correo || '').trim().toLowerCase();

const rateLimitLogin = crearRateLimit({
    ventanaMs: 15 * 60 * 1000,
    maxIntentos: 5,
    mensaje: 'Demasiados intentos de inicio de sesion. Intenta de nuevo mas tarde.',
    keyGenerator: (req) => `login:${req.ip}:${normalizarCorreo(req.body?.correo)}`
});

const rateLimitRecuperacion = crearRateLimit({
    ventanaMs: 30 * 60 * 1000,
    maxIntentos: 3,
    mensaje: 'Demasiadas solicitudes de recuperacion. Intenta de nuevo mas tarde.',
    keyGenerator: (req) => `recuperacion:${req.ip}:${normalizarCorreo(req.body?.correo)}`
});

module.exports = {
    crearRateLimit,
    rateLimitLogin,
    rateLimitRecuperacion
};
