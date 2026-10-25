const esUrlHttps = (valor) => {
    try {
        return new URL(valor).protocol === 'https:';
    } catch (error) {
        return false;
    }
};

const secretoFuerte = (valor) => (
    typeof valor === 'string'
    && valor.length >= 32
    && new Set(valor).size >= 16
);

const uriMongoValida = (valor) => {
    if (typeof valor !== 'string' || !/^mongodb(\+srv)?:\/\//.test(valor)) return false;
    try {
        new (require('mongoose').mongo.MongoClient)(valor);
        return true;
    } catch (error) {
        return false;
    }
};

const validarConfiguracionArranque = (env = process.env) => {
    if (env.NODE_ENV !== 'production') return;
    const errores = [];
    if (!uriMongoValida(env.MONGODB_URI)) {
        errores.push('MONGODB_URI debe ser una URI de MongoDB explícita en producción.');
    }
    if (!secretoFuerte(env.JWT_SECRET)) {
        errores.push('JWT_SECRET debe tener al menos 32 caracteres y 16 caracteres distintos.');
    }
    if (!secretoFuerte(env.CRON_SECRET)) {
        errores.push('CRON_SECRET debe tener al menos 32 caracteres y 16 caracteres distintos.');
    }
    if (!esUrlHttps(env.FRONTEND_URL)) {
        errores.push('FRONTEND_URL debe ser una URL HTTPS válida en producción.');
    }
    if (env.EMAIL_TEST_TO) {
        console.warn('EMAIL_TEST_TO está definida pero será ignorada en producción.');
    }
    if (errores.length) {
        const error = new Error(`Configuración de producción inválida:\n- ${errores.join('\n- ')}`);
        error.code = 'INVALID_PRODUCTION_ENV';
        throw error;
    }
};

module.exports = { esUrlHttps, secretoFuerte, uriMongoValida, validarConfiguracionArranque };
