// Servidor HTTP efimero y fixtures sinteticos. No MongoDB, .env ni red externa.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const express = require('express');
const { compresionHttp, cachePrivadaRevalidada, medirRespuestasHttp } = require('../middleware/rendimientoHttp');

const animales = Array.from({ length: 120 }, (_, n) => ({
    _id: String(n).padStart(24, '0'), diio: `18800181${String(n).padStart(4, '0')}`, identificadorFinca: String(n),
    nombre: `Animal ${n}`, especie: n % 3 ? 'Bovino' : 'Porcino', sexo: n % 2 ? 'Hembra' : 'Macho',
    estado: 'Activo', categoria: 'Vaca', fechaNacimiento: '2023-01-15T00:00:00.000Z',
    pesoActual: 400 + n, fechaUltimoPesaje: '2026-11-01T00:00:00.000Z', estadoSanitario: 'Sano',
    fotoPrincipal: { _id: 'foto', url: `https://images.example.test/animal-${n}.webp`, mimeType: 'image/webp', tamanoBytes: 80000 },
    potreroActual: { _id: 'potrero', nombre: 'Potrero 1', area: 4, observaciones: 'Pastoreo rotativo', pastosSecundarios: [] },
    madre: { _id: 'madre', diio: '18800100', nombre: 'Madre', especie: 'Bovino', sexo: 'Hembra' },
    padre: null, loteActual: { _id: 'lote', codigo: 'L-1', nombre: 'Principal', estado: 'ACTIVO' },
    observaciones: 'Registro de inventario con informacion productiva y genealogica.',
    creadoEn: '2026-01-01T00:00:00Z', actualizadoEn: '2026-11-01T00:00:00Z'
}));
const reducido = animales.map(({ _id, estado, especie, sexo, fechaNacimiento, categoria }) => ({ _id, estado, especie, sexo, fechaNacimiento, categoria }));
const pedir = (base, ruta, headers = {}) => new Promise((resolve, reject) => {
    http.get(base + ruta, { headers }, (res) => { const trozos = []; res.on('data', (c) => trozos.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(trozos) })); }).on('error', reject);
});
let server, base;
test.before(async () => {
    const app = express(); app.set('etag', 'weak');
    app.use(medirRespuestasHttp, compresionHttp, cachePrivadaRevalidada);
    app.use((req, res, next) => req.get('Authorization') === 'Bearer autorizado' ? next() : res.status(401).json({ mensaje: 'Sin permiso' }));
    app.get('/api/animales', (req, res) => res.json(req.query.vista === 'dashboard' ? reducido : animales));
    app.get('/api/notificaciones/no-leidas/count', (req, res) => res.json({ cantidad: 8 }));
    app.get('/api/potreros/:id', (req, res) => res.status(404).json({ mensaje: 'No encontrado' }));
    server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));
const auth = { Authorization: 'Bearer autorizado', 'X-Finca-Id': 'finca-fixture' };

test('gzip mayor a 1 KB; dashboard reducido y revalidacion 304 sin cuerpo', async (t) => {
    const completo = await pedir(base, '/api/animales', auth);
    const comprimido = await pedir(base, '/api/animales', { ...auth, 'Accept-Encoding': 'gzip' });
    assert.equal(comprimido.headers['content-encoding'], 'gzip');
    assert.deepEqual(zlib.gunzipSync(comprimido.body), completo.body);
    assert.ok(comprimido.body.length < completo.body.length * 0.2);
    const dashboard = await pedir(base, '/api/animales?vista=dashboard', { ...auth, 'Accept-Encoding': 'gzip' });
    assert.equal(JSON.parse(zlib.gunzipSync(dashboard.body)).length, 120);
    assert.ok(dashboard.body.length < comprimido.body.length);
    const sinCambios = await pedir(base, '/api/animales', { ...auth, 'If-None-Match': completo.headers.etag, 'Cache-Control': 'max-age=0' });
    assert.equal(sinCambios.status, 304); assert.equal(sinCambios.body.length, 0);
    for (const cabecera of ['Authorization', 'X-Finca-Id', 'Accept-Encoding']) assert.ok(completo.headers.vary.includes(cabecera));
    assert.equal(completo.headers['cache-control'], 'private, no-cache');
    t.diagnostic(JSON.stringify({ fixtureAnimales: 120, completoAntesBytes: completo.body.length,
        completoGzipBytes: comprimido.body.length, dashboardAntesBytes: completo.body.length,
        dashboardAhoraGzipBytes: dashboard.body.length, sinCambiosBodyBytes: sinCambios.body.length }));
});

test('no comprime contador pequeno, no entrega 304 a un usuario sin acceso ni almacena errores', async () => {
    const contador = await pedir(base, '/api/notificaciones/no-leidas/count', { ...auth, 'Accept-Encoding': 'gzip' });
    assert.equal(contador.headers['content-encoding'], undefined);
    const prohibido = await pedir(base, '/api/animales', { 'If-None-Match': contador.headers.etag });
    assert.equal(prohibido.status, 401); assert.equal(prohibido.headers['cache-control'], 'no-store');
    const inexistente = await pedir(base, '/api/potreros/desconocido', auth);
    assert.equal(inexistente.status, 404); assert.equal(inexistente.headers['cache-control'], 'no-store');
});

test('diagnostico opt-in mide bytes comprimidos sin registrar identidad ni filtros', async (t) => {
    const anterior = process.env.PERFORMANCE_HTTP_LOGS;
    const registros = [];
    t.mock.method(console, 'info', (linea) => registros.push(JSON.parse(linea)));
    try {
        process.env.PERFORMANCE_HTTP_LOGS = 'true';
        const r = await pedir(base, '/api/animales?nombre=privado', { ...auth, 'Accept-Encoding': 'gzip' });
        assert.equal(registros.length, 1);
        assert.equal(registros[0].bytesBody, r.body.length);
        assert.equal(registros[0].ruta, '/api/animales');
        assert.equal(registros[0].codificacion, 'gzip');
        assert.ok(registros[0].duracionMs >= 0);
        await pedir(base, '/api/potreros/secreto-identificador', auth);
        assert.equal(registros[1].ruta, '/api/potreros/:id');
        assert.doesNotMatch(JSON.stringify(registros), /privado|autorizado|finca-fixture/);
        assert.doesNotMatch(JSON.stringify(registros), /secreto-identificador/);
    } finally {
        if (anterior === undefined) delete process.env.PERFORMANCE_HTTP_LOGS;
        else process.env.PERFORMANCE_HTTP_LOGS = anterior;
    }
});
