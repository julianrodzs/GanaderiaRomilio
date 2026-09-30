const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOGO_PASTOS_BASE } = require('../config/catalogoPastos');
const {
    coincideBusquedaCatalogo,
    normalizarTexto,
    obtenerCoberturaEnFecha
} = require('../services/potreroCobertura-service');

test('el catalogo diferencia Brizantha generica de sus cultivares', () => {
    const resultados = CATALOGO_PASTOS_BASE.filter((item) => coincideBusquedaCatalogo(item, 'Brizantha'));
    assert.ok(resultados.some((item) => item.clave === 'brizantha'));
    assert.ok(resultados.some((item) => item.clave === 'brizantha-toledo'));
    assert.ok(resultados.some((item) => item.clave === 'brizantha-marandu'));
    assert.equal(CATALOGO_PASTOS_BASE.filter((item) => coincideBusquedaCatalogo(item, 'Toledo')).length, 1);
});

test('la busqueda normalizada ignora mayusculas y tildes', () => {
    assert.equal(normalizarTexto('  MARANDÚ '), 'marandu');
    const marandu = CATALOGO_PASTOS_BASE.find((item) => item.clave === 'brizantha-marandu');
    assert.equal(coincideBusquedaCatalogo(marandu, 'marandu'), true);
});

test('resuelve la cobertura historica vigente en una fecha', () => {
    const historial = [
        { _id: 'h1', fechaInicio: '2026-01-01', fechaFin: '2026-03-14' },
        { _id: 'h2', fechaInicio: '2026-03-15', fechaFin: null }
    ];
    assert.equal(obtenerCoberturaEnFecha(historial, '2026-03-14')._id, 'h1');
    assert.equal(obtenerCoberturaEnFecha(historial, '2026-03-15')._id, 'h2');
    assert.equal(obtenerCoberturaEnFecha(historial, '2025-12-31'), null);
});
