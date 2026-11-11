const { randomUUID } = require('node:crypto');
const { setTimeout: dormir } = require('node:timers/promises');
const limitador = require('./limiteCorreo-service');

const MAX_INTENTOS = 4;
const PLAZO_MS = 120000;

const esperaProveedor = (headers, ahora = Date.now()) => {
    const valor = headers?.get?.('retry-after');
    if (valor === null || valor === undefined || valor === '') return 0;
    const segundos = Number(valor);
    if (Number.isFinite(segundos) && segundos >= 0) return Math.ceil(segundos * 1000);
    const fecha = Date.parse(valor);
    return Number.isFinite(fecha) ? Math.max(0, fecha - ahora) : 0;
};

const crearTransporteResend = ({
    solicitar = (...args) => fetch(...args), controlar = limitador,
    esperar = dormir, reloj = () => performance.now(), azar = Math.random,
    avisar = (datos) => console.warn('Reintento de correo:', JSON.stringify(datos))
} = {}) => async ({ mensaje, apiKey, claveIdempotencia = `correo:${randomUUID()}`, comprobarBloqueo = async () => {} }) => {
    const limiteTiempo = reloj() + PLAZO_MS;
    const body = JSON.stringify(mensaje);
    for (let intento = 1; intento <= MAX_INTENTOS; intento += 1) {
        await controlar.esperarTurno({ limiteTiempo, comprobarBloqueo });
        await comprobarBloqueo();
        if (reloj() >= limiteTiempo) throw limitador.errorPlazo();
        let fallo, reintentable = false, demoraProveedor = 0;
        try {
            const respuesta = await solicitar('https://api.resend.com/emails', {
                method: 'POST',
                signal: AbortSignal.timeout(Math.max(1, Math.min(30000, Math.ceil(limiteTiempo - reloj())))),
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': claveIdempotencia },
                body
            });
            const data = await respuesta.json().catch(() => ({}));
            if (respuesta.ok && data.id) return data;
            const codigo = data.name || data.error?.name || (respuesta.ok ? 'invalid_provider_response' : 'provider_error');
            fallo = Object.assign(new Error(data.message || (typeof data.error === 'string' ? data.error : null) || 'Error enviando correo con Resend'), {
                code: 'EMAIL_PROVIDER_ERROR', proveedorCodigo: codigo, status: respuesta.status, intentos: intento
            });
            reintentable = (respuesta.status === 429 && codigo === 'rate_limit_exceeded')
                || (respuesta.status === 409 && codigo === 'concurrent_idempotent_requests')
                || [500, 502, 503, 504].includes(respuesta.status) || respuesta.ok;
            demoraProveedor = esperaProveedor(respuesta.headers);
        } catch (error) {
            fallo = error;
            reintentable = error instanceof TypeError || ['TimeoutError', 'AbortError'].includes(error.name);
        }
        if (!reintentable) throw fallo;
        const demora = Math.max(demoraProveedor, Math.min(1000 * 2 ** (intento - 1), 10000) + Math.floor(azar() * 250));
        // Comparte el enfriamiento con API y cron, aun si este envio ya agoto sus intentos.
        if (fallo.status === 429) await controlar.pausar(demora);
        if (intento === MAX_INTENTOS) throw fallo;
        if (demora >= limiteTiempo - reloj()) throw Object.assign(limitador.errorPlazo(), { cause: fallo });
        avisar({ intento, maxIntentos: MAX_INTENTOS, status: fallo.status || null, codigo: fallo.proveedorCodigo || fallo.name, esperaMs: demora });
        const finEspera = reloj() + demora;
        while (reloj() < finEspera) {
            await comprobarBloqueo();
            await esperar(Math.min(1000, finEspera - reloj()));
        }
    }
};

module.exports = { crearTransporteResend, enviarMensajeResend: crearTransporteResend(), esperaProveedor, MAX_INTENTOS, PLAZO_MS };
