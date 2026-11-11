const test = require('node:test');
const assert = require('node:assert/strict');
const { crearTransporteResend, esperaProveedor, MAX_INTENTOS } = require('../services/resend-transporte-service');
const { enviarCorreoResend } = require('../services/correoElectronico-service');

const respuesta = (status = 200, name, headers = {}) => ({ ok: status === 200, status, headers: new Headers(headers),
    json: async () => status === 200 ? { id: 'simulado' } : { name, message: 'Fallo simulado' } });
const mensaje = { from: 'CIR <avisos@example.test>', to: ['cliente@example.test'], subject: 'Prueba', text: 'Sin red' };
const fixture = (respuestas, opciones = {}) => {
    let tiempo = 0;
    const solicitudes = [], pausas = [], avisos = [], esperas = [];
    const enviar = crearTransporteResend({ reloj: () => tiempo, azar: () => 0,
        esperar: async (ms) => { esperas.push(ms); tiempo += ms; },
        avisar: (datos) => avisos.push(datos),
        controlar: { esperarTurno: async ({ comprobarBloqueo }) => comprobarBloqueo(), pausar: async (ms) => pausas.push(ms) },
        solicitar: async (url, config) => { solicitudes.push({ url, ...config }); const r = respuestas.shift(); if (r instanceof Error) throw r; return r; },
        ...opciones
    });
    return { enviar: (datos = {}) => enviar({ mensaje, apiKey: 'ficticia', ...datos }), solicitudes, pausas, avisos, esperas };
};

test('Resend: 429 de velocidad espera Retry-After y conserva cuerpo/clave en el reintento', async () => {
    const f = fixture([respuesta(429, 'rate_limit_exceeded', { 'retry-after': '2' }), respuesta()]);
    assert.equal((await f.enviar()).id, 'simulado');
    assert.equal(f.solicitudes.length, 2); assert.deepEqual(f.pausas, [2000]);
    assert.equal(f.esperas.reduce((a, b) => a + b, 0), 2000);
    assert.equal(f.solicitudes[0].headers['Idempotency-Key'], f.solicitudes[1].headers['Idempotency-Key']);
    assert.ok(f.solicitudes[0].headers['Idempotency-Key']);
    assert.equal(f.solicitudes[0].body, f.solicitudes[1].body);
    assert.doesNotMatch(JSON.stringify(f.avisos), /cliente@|avisos@|ficticia|Sin red/);
});

test('Resend: Retry-After admite segundos, fecha HTTP, ausente y valores invalidos', () => {
    const ahora = Date.parse('2026-11-10T12:00:00Z');
    assert.equal(esperaProveedor(new Headers({ 'retry-after': '0.5' })), 500);
    assert.equal(esperaProveedor(new Headers({ 'retry-after': 'Tue, 10 Nov 2026 12:00:03 GMT' }), ahora), 3000);
    assert.equal(esperaProveedor(new Headers({ 'retry-after': 'Tue, 10 Nov 2026 11:00:00 GMT' }), ahora), 0);
    assert.equal(esperaProveedor(new Headers({ 'retry-after': 'invalido' })), 0);
    assert.equal(esperaProveedor(undefined), 0);
});

for (const [status, codigo] of [[429, 'daily_quota_exceeded'], [429, 'monthly_quota_exceeded'], [429, 'otro_limite'], [400, 'validation_error'], [401, 'missing_api_key'], [403, 'restricted_api_key'], [409, 'invalid_idempotent_request'], [422, 'invalid_parameter']]) {
    test(`Resend: ${status} ${codigo} no se reintenta ni oculta`, async () => {
        const f = fixture([respuesta(status, codigo)]);
        await assert.rejects(f.enviar(), (e) => e.status === status && e.proveedorCodigo === codigo);
        assert.equal(f.solicitudes.length, 1); assert.equal(f.pausas.length, 0); assert.equal(f.avisos.length, 0);
    });
}

test('Resend: errores transitorios y red usan backoff acotado con la clave original', async () => {
    const f = fixture([new TypeError('Conexion interrumpida'), respuesta(503, 'service_unavailable'), respuesta(409, 'concurrent_idempotent_requests'), respuesta()]);
    await f.enviar({ claveIdempotencia: 'evento:original' });
    assert.equal(f.solicitudes.length, MAX_INTENTOS);
    assert.ok(f.solicitudes.every((s) => s.headers['Idempotency-Key'] === 'evento:original'));
    assert.equal(f.esperas.reduce((a, b) => a + b, 0), 7000);
});

test('Resend: al agotar intentos conserva el fallo; un envio siguiente no queda bloqueado', async () => {
    const f = fixture([...Array.from({ length: MAX_INTENTOS }, () => respuesta(429, 'rate_limit_exceeded')), respuesta()]);
    await assert.rejects(f.enviar(), (e) => e.status === 429 && e.intentos === MAX_INTENTOS);
    assert.equal(f.solicitudes.length, MAX_INTENTOS); assert.equal(f.pausas.length, MAX_INTENTOS);
    assert.equal((await f.enviar()).id, 'simulado');
});

test('Resend: Retry-After mayor al plazo no provoca reintento anticipado ni espera ilimitada', async () => {
    const f = fixture([respuesta(429, 'rate_limit_exceeded', { 'retry-after': '300' })]);
    await assert.rejects(f.enviar(), { code: 'EMAIL_SEND_DEADLINE' });
    assert.equal(f.solicitudes.length, 1); assert.deepEqual(f.pausas, [300000]); assert.deepEqual(f.esperas, []);
});

test('Resend: perdida de bloqueo durante backoff impide volver a enviar', async () => {
    let comprobaciones = 0;
    const f = fixture([respuesta(429, 'rate_limit_exceeded'), respuesta()]);
    await assert.rejects(f.enviar({ comprobarBloqueo: async () => {
        if (++comprobaciones >= 3) throw Object.assign(Error('Bloqueo perdido'), { code: 'JOB_LOCK_LOST' });
    } }), { code: 'JOB_LOCK_LOST' });
    assert.equal(f.solicitudes.length, 1);
});

test('Resend: timeout o respuesta ilegible se reintenta idempotentemente; llamadas distintas no se deduplican por contenido', async () => {
    const f = fixture([Object.assign(Error('Timeout'), { name: 'TimeoutError' }), { ok: true, status: 200, json: async () => { throw Error('JSON cortado'); } }, respuesta(), respuesta()]);
    await f.enviar(); await f.enviar();
    assert.equal(f.solicitudes[0].headers['Idempotency-Key'], f.solicitudes[2].headers['Idempotency-Key']);
    assert.notEqual(f.solicitudes[2].headers['Idempotency-Key'], f.solicitudes[3].headers['Idempotency-Key']);
});

test('Resend: sin destinatarios o sin API key no consume turno ni envia correos reales', async (t) => {
    t.mock.method(global, 'fetch', () => { throw Error('No debe acceder a la red'); });
    const anterior = process.env.RESEND_API_KEY, entorno = process.env.NODE_ENV;
    t.after(() => { if (anterior === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = anterior;
        if (entorno === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = entorno; });
    delete process.env.RESEND_API_KEY; process.env.NODE_ENV = 'production';
    assert.equal((await enviarCorreoResend({ to: [], subject: 'Sin destinatarios' })).enviado, false);
    await assert.rejects(enviarCorreoResend({ to: 'prueba@example.test' }), /proveedor de correo/);
});
