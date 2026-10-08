const test = require('node:test');
const assert = require('node:assert/strict');
const {
    escaparExpresionRegular,
    normalizarBusqueda
} = require('../services/tareaBusqueda-service');

test('la búsqueda de tareas trata los símbolos como texto y no como operadores regex', () => {
    const entrada = 'CAM-2026.[01]+(A)';
    const expresion = new RegExp(escaparExpresionRegular(entrada), 'i');

    assert.equal(expresion.test(entrada), true);
    assert.equal(expresion.test('CAM-2026001AAAA'), false);
});

test('la búsqueda de tareas recorta espacios y limita entradas excesivas', () => {
    assert.equal(normalizarBusqueda('  1880001  '), '1880001');
    assert.equal(normalizarBusqueda('a'.repeat(120)).length, 80);
});
