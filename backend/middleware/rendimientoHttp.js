const compression = require('compression');

const compresionHttp = compression({ threshold: 1024 });

const cachePrivadaRevalidada = (req, res, next) => {
    if (req.method === 'GET' && /^\/api\/(animales|pesajes|potreros|notificaciones|plan\/actual|usuarios\/perfil)(\/|$)/.test(req.path)) {
        res.set('Cache-Control', 'private, no-cache');
        res.vary('Authorization');
        res.vary('X-Finca-Id');
        // Nunca almacenar errores de autenticacion, cuota, validacion o servidor.
        const json = res.json.bind(res);
        res.json = (contenido) => {
            if (res.statusCode >= 400) res.set('Cache-Control', 'no-store');
            return json(contenido);
        };
    }
    next();
};

const medirRespuestasHttp = (req, res, next) => {
    if (process.env.PERFORMANCE_HTTP_LOGS !== 'true') return next();
    const inicio = process.hrtime.bigint();
    let bytes = 0;
    let ruta = '[sin ruta]';
    const contar = (chunk, encoding) => {
        if (typeof chunk === 'string') bytes += Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : undefined);
        else if (chunk) bytes += chunk.length || 0;
    };
    const write = res.write;
    const end = res.end;
    res.write = function (chunk, encoding, ...args) { contar(chunk, encoding); return write.call(this, chunk, encoding, ...args); };
    res.end = function (chunk, encoding, ...args) {
        ruta = `${req.baseUrl || ''}${typeof req.route?.path === 'string' ? req.route.path : '/[sin ruta]'}`;
        contar(chunk, encoding);
        return end.call(this, chunk, encoding, ...args);
    };
    res.once('finish', () => {
        // No registrar query, cabeceras, identidad ni cuerpos con datos de clientes.
        console.info(JSON.stringify({ tipo: 'http-performance', metodo: req.method,
            ruta,
            estado: res.statusCode, bytesBody: bytes,
            codificacion: res.get('Content-Encoding') || 'identity',
            duracionMs: Number(process.hrtime.bigint() - inicio) / 1e6 }));
    });
    return next();
};

module.exports = { compresionHttp, cachePrivadaRevalidada, medirRespuestasHttp };
