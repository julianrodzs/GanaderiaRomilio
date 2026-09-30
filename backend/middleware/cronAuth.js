const crypto = require('crypto');

const compararSeguro = (valorA, valorB) => {
    const a = Buffer.from(valorA || '');
    const b = Buffer.from(valorB || '');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const autorizarCron = (req, res, next) => {
    const secreto = process.env.CRON_SECRET;
    if (!secreto) {
        return res.status(503).json({ mensaje: 'CRON_SECRET no esta configurado' });
    }

    const authorization = req.headers.authorization || '';
    const [tipo, token] = authorization.split(' ');
    if (tipo !== 'Bearer' || !compararSeguro(token, secreto)) {
        return res.status(401).json({ mensaje: 'Credencial de trabajo programado invalida' });
    }
    return next();
};

module.exports = { autorizarCron };
