const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { crearLimitadorTrabajosPesados, conTrabajoPesado } = require('../services/trabajosPesados-service');
const diferida = () => { let resolver; const promesa = new Promise((r) => { resolver = r; }); return { promesa, resolver }; };
const tick = () => new Promise((r) => setImmediate(r));

test('maximo dos trabajos globales; tercero espera en FIFO y libera al terminar', async () => {
    const l = crearLimitadorTrabajosPesados({ esperaMs: 1000 }); const a = diferida(), b = diferida(); const orden = [];
    const uno = l.ejecutar(async () => { orden.push(1); await a.promesa; });
    const dos = l.ejecutar(async () => { orden.push(2); await b.promesa; });
    const tres = l.ejecutar(async () => { orden.push(3); });
    await tick(); assert.deepEqual(l.estado(), { activos: 2, enEspera: 1 }); assert.deepEqual(orden, [1, 2]);
    a.resolver(); await uno; await tres; assert.deepEqual(orden, [1, 2, 3]);
    b.resolver(); await dos; assert.deepEqual(l.estado(), { activos: 0, enEspera: 0 });
});

test('cola acotada, timeout 429 y abortar espera no ejecuta trabajo ni pierde cupos', async () => {
    const l = crearLimitadorTrabajosPesados({ maxConcurrentes: 1, maxCola: 1, esperaMs: 20 }); const a = diferida();
    const uno = l.ejecutar(() => a.promesa); const espera = l.ejecutar(() => assert.fail('No debe ejecutarse'));
    await assert.rejects(l.ejecutar(async () => {}), { status: 429, code: 'HEAVY_JOBS_BUSY' });
    await assert.rejects(espera, { status: 429, code: 'HEAVY_JOBS_BUSY' });
    const abort = new AbortController(); const cancelado = l.ejecutar(() => assert.fail('Cancelado'), { signal: abort.signal });
    abort.abort(); await assert.rejects(cancelado, { code: 'HEAVY_JOB_ABORTED' });
    assert.deepEqual(l.estado(), { activos: 1, enEspera: 0 }); a.resolver(); await uno;
    await assert.rejects(l.ejecutar(async () => { throw Error('Fallo'); }), /Fallo/);
    await l.ejecutar(async () => {}); assert.equal(l.estado().activos, 0);
});

test('el plazo no se elude si el event loop demora el callback del timeout', async () => {
    let reloj = 0; const a = diferida();
    const l = crearLimitadorTrabajosPesados({ maxConcurrentes: 1, esperaMs: 1000, ahora: () => reloj });
    const uno = l.ejecutar(() => a.promesa);
    const espera = l.ejecutar(() => assert.fail('El plazo ya vencio'));
    const rechazo = assert.rejects(espera, { status: 429 });
    await tick(); reloj = 1500; a.resolver(); await uno; await rechazo;
    assert.deepEqual(l.estado(), { activos: 0, enEspera: 0 });
});

test('HTTP: al agotarse la espera responde 429 y Retry-After sin procesar el archivo', async () => {
    const rutaModulo = require.resolve('../services/trabajosPesados-service');
    const anterior = require.cache[rutaModulo], envAnterior = process.env.HEAVY_JOB_QUEUE_TIMEOUT_MS;
    process.env.HEAVY_JOB_QUEUE_TIMEOUT_MS = '20'; delete require.cache[rutaModulo];
    const { conTrabajoPesado: envolver } = require(rutaModulo);
    if (envAnterior === undefined) delete process.env.HEAVY_JOB_QUEUE_TIMEOUT_MS; else process.env.HEAVY_JOB_QUEUE_TIMEOUT_MS = envAnterior;
    require.cache[rutaModulo] = anterior;
    const app = express(), bloqueo = diferida(), inicios = diferida(); let activos = 0, lecturas = 0;
    app.get('/bloqueo', envolver(async (req, res) => { if (++activos === 2) inicios.resolver(); await bloqueo.promesa; res.json({}); }));
    app.post('/archivo', envolver((req, res, next) => { lecturas++; next(); }, async (req, res) => res.json({})));
    const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const uno = fetch(base + '/bloqueo'), dos = fetch(base + '/bloqueo'); await inicios.promesa;
        const tercero = await fetch(base + '/archivo', { method: 'POST' }); assert.equal(tercero.status, 429);
        assert.ok(tercero.headers.get('retry-after')); assert.match((await tercero.json()).mensaje, /archivos pesados/); assert.equal(lecturas, 0);
        bloqueo.resolver(); await Promise.all([uno, dos]);
        assert.equal((await fetch(base + '/archivo', { method: 'POST' })).status, 200); assert.equal(lecturas, 1);
    } finally { bloqueo.resolver(); server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});

test('HTTP: importaciones y exportaciones comparten cupos antes de leer archivo y errores liberan', async () => {
    const app = express(), a = diferida(), b = diferida(), llegoA = diferida(), llegoB = diferida(); let archivosLeidos = 0;
    app.get('/exportar', conTrabajoPesado(async (req, res) => { llegoA.resolver(); await a.promesa; res.json({ ok: true }); }));
    app.get('/cierre', conTrabajoPesado(async (req, res) => { llegoB.resolver(); await b.promesa; res.json({ ok: true }); }));
    app.post('/importar', conTrabajoPesado((req, res, next) => { archivosLeidos++; next(); }, async (req, res) => res.json({ ok: true })));
    app.get('/error', conTrabajoPesado(async () => { throw Error('Simulado'); }));
    app.use((error, req, res, next) => res.status(500).json({ mensaje: error.message }));
    const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const uno = fetch(base + '/exportar'), dos = fetch(base + '/cierre'); await Promise.all([llegoA.promesa, llegoB.promesa]);
        const tres = fetch(base + '/importar', { method: 'POST' }); await new Promise((r) => setTimeout(r, 30)); assert.equal(archivosLeidos, 0);
        a.resolver(); assert.equal((await uno).status, 200); assert.equal((await tres).status, 200); assert.equal(archivosLeidos, 1);
        b.resolver(); assert.equal((await dos).status, 200); assert.equal((await fetch(base + '/error')).status, 500);
        assert.equal((await fetch(base + '/importar', { method: 'POST' })).status, 200);
    } finally { a.resolver(); b.resolver(); server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});
