const MENSAJE_OCUPADO = 'El servidor está procesando otros archivos pesados en este momento. Por favor intenta nuevamente en unos segundos.';
const errorCancelado = () => Object.assign(new Error('La solicitud fue cancelada.'), { code: 'HEAVY_JOB_ABORTED' });
const errorOcupado = () => Object.assign(new Error(MENSAJE_OCUPADO), { status: 429, code: 'HEAVY_JOBS_BUSY' });
const entero = (valor, defecto, minimo = 1) => String(valor ?? '').trim() && Number.isInteger(Number(valor)) && Number(valor) >= minimo ? Number(valor) : defecto;

const crearLimitadorTrabajosPesados = ({ maxConcurrentes = 2, esperaMs = 15000, maxCola = 20, ahora = Date.now } = {}) => {
    let activos = 0;
    const cola = [];
    const adquirir = (signal) => new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(errorCancelado());
        const trabajo = { timer: null, cancelar: null, otorgar: null, venceEn: Infinity };
        const retirar = () => {
            clearTimeout(trabajo.timer);
            signal?.removeEventListener('abort', trabajo.cancelar);
            const indice = cola.indexOf(trabajo);
            if (indice >= 0) cola.splice(indice, 1);
        };
        trabajo.otorgar = () => {
            if (ahora() >= trabajo.venceEn) { retirar(); reject(errorOcupado()); return; }
            retirar(); activos++;
            let liberado = false;
            resolve(() => {
                if (liberado) return;
                liberado = true; activos--;
                while (activos < maxConcurrentes && cola.length) cola[0].otorgar();
            });
        };
        if (activos < maxConcurrentes) return trabajo.otorgar();
        if (cola.length >= maxCola) return reject(errorOcupado());
        trabajo.cancelar = () => { retirar(); reject(errorCancelado()); };
        trabajo.venceEn = ahora() + esperaMs;
        cola.push(trabajo);
        signal?.addEventListener('abort', trabajo.cancelar, { once: true });
        trabajo.timer = setTimeout(() => { retirar(); reject(errorOcupado()); }, esperaMs);
    });
    return {
        ejecutar: async (accion, { signal } = {}) => {
            const liberar = await adquirir(signal);
            try { return await accion(); } finally { liberar(); }
        },
        estado: () => ({ activos, enEspera: cola.length })
    };
};

const esperaGlobalMs = entero(process.env.HEAVY_JOB_QUEUE_TIMEOUT_MS, 15000, 0);
const limitador = crearLimitadorTrabajosPesados({
    maxConcurrentes: entero(process.env.MAX_CONCURRENT_HEAVY_JOBS, 2),
    esperaMs: esperaGlobalMs,
    maxCola: entero(process.env.MAX_QUEUED_HEAVY_JOBS, 20, 0)
});

// Adquiere antes de multer para que los archivos en espera no ocupen buffers de subida.
const conTrabajoPesado = (...pasos) => async (req, res, next) => {
    const abort = new AbortController();
    const cancelar = () => abort.abort();
    req.once('aborted', cancelar);
    res.once('close', cancelar);
    try {
        await limitador.ejecutar(async () => {
            for (const paso of pasos.slice(0, -1)) {
                await new Promise((resolve, reject) => {
                    const resultado = paso(req, res, (error) => error ? reject(error) : resolve());
                    resultado?.catch?.(reject);
                });
            }
            if (!req.aborted && !res.destroyed) await pasos[pasos.length - 1](req, res, next);
            if (!res.writableFinished && !res.destroyed) await new Promise((resolve) => {
                const finalizar = () => { res.removeListener('finish', finalizar); res.removeListener('close', finalizar); resolve(); };
                res.once('finish', finalizar); res.once('close', finalizar);
            });
        }, { signal: abort.signal });
    } catch (error) {
        if (error.code === 'HEAVY_JOB_ABORTED' || res.destroyed) return;
        if (error.code === 'HEAVY_JOBS_BUSY') {
            res.setHeader('Retry-After', String(Math.max(1, Math.ceil(esperaGlobalMs / 1000))));
            return res.status(429).json({ mensaje: MENSAJE_OCUPADO, codigo: error.code });
        }
        return next(error);
    } finally {
        req.removeListener('aborted', cancelar);
        res.removeListener('close', cancelar);
    }
};

module.exports = { crearLimitadorTrabajosPesados, conTrabajoPesado };
