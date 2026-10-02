const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarLineasProductivas } = require('../config/lineasProductivas');
const { validarLineasProductivas } = require('../services/finca-service');

test('normaliza líneas productivas sin duplicar objetivos ni especies', () => {
    const resultado = normalizarLineasProductivas([
        { especie: 'Porcino', objetivos: ['Engorde', 'Engorde', 'Reproducción'] },
        { especie: 'Bovino', objetivos: ['Cría'] }
    ]);
    assert.deepEqual(resultado, [
        { especie: 'Bovino', objetivos: ['REPRODUCCION'], activa: true },
        { especie: 'Porcino', objetivos: ['ENGORDE', 'REPRODUCCION'], activa: true }
    ]);
});

test('rechaza especies repetidas y líneas activas sin objetivo', () => {
    assert.throws(() => validarLineasProductivas([
        { especie: 'Bovino', objetivos: ['Cría'] },
        { especie: 'Bovino', objetivos: ['Engorde'] }
    ]), /repetida/);
    assert.throws(() => validarLineasProductivas([
        { especie: 'Porcino', objetivos: [] }
    ]), /al menos un objetivo/);
});
