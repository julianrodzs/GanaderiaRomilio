const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Readable } = require('node:stream');
const Archivo = require('../models/ArchivoMultimedia');
const R2 = require('../services/almacenamientoR2-service');

test('HTTP privado: 304 previo a R2, variantes y controles de acceso antes del ETag', async (t) => {
    let llamadas = 0, visible = true, fecha = '2026-11-14T12:00:00Z';
    t.mock.method(Archivo, 'findOne', () => ({ lean: async () => visible ? {
        _id: 'archivo-fixture', fincaId: 'finca-A', clave: 'privado/a.webp', tamanoBytes: 5, updatedAt: fecha, mimeType: 'image/webp'
    } : null }));
    t.mock.method(R2, 'obtenerImagenR2', async () => { llamadas++; return { ContentType: 'image/webp', Body: Readable.from(Buffer.from('imagen')) }; });
    delete require.cache[require.resolve('../routes/archivoRoutes')];
    const app = express();
    app.use((req, res, next) => {
        if (!req.get('Authorization')) return res.status(401).json({ mensaje: 'Sin acceso' });
        req.usuario = { fincas: [req.get('X-Finca-Id')] }; next();
    });
    app.use('/api/archivos', require('../routes/archivoRoutes'));
    const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
    const url = `http://127.0.0.1:${server.address().port}/api/archivos/r2/fixture`;
    const headers = { Authorization: 'Bearer fixture', 'X-Finca-Id': 'finca-A', 'Cache-Control': 'max-age=0' };
    try {
        const primero = await fetch(url, { headers }); assert.equal(primero.status, 200); await primero.arrayBuffer();
        assert.equal(llamadas, 1); assert.equal(primero.headers.get('cache-control'), 'private, no-cache');
        assert.match(primero.headers.get('vary'), /Authorization/); assert.match(primero.headers.get('vary'), /X-Finca-Id/);
        const etag = primero.headers.get('etag'); assert.ok(etag);
        for (const condicion of [etag, `W/${etag}`, `"otro", ${etag}`]) {
            const igual = await fetch(url, { headers: { ...headers, 'If-None-Match': condicion } }); assert.equal(igual.status, 304); assert.equal((await igual.arrayBuffer()).byteLength, 0);
        }
        assert.equal(llamadas, 1);
        assert.equal((await fetch(url, { headers: { ...headers, 'X-Finca-Id': 'otra', 'If-None-Match': etag } })).status, 404);
        assert.equal((await fetch(url, { headers: { 'If-None-Match': etag } })).status, 401);
        visible = false; assert.equal((await fetch(url, { headers: { ...headers, 'If-None-Match': etag } })).status, 404);
        visible = true; fecha = '2026-11-15T12:00:00Z';
        const actualizado = await fetch(url, { headers: { ...headers, 'If-None-Match': etag } }); assert.equal(actualizado.status, 200); await actualizado.arrayBuffer();
        assert.notEqual(actualizado.headers.get('etag'), etag); assert.equal(llamadas, 2);
    } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});
