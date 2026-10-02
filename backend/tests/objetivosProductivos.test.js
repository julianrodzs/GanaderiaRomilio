const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarObjetivoProductivo } = require('../config/objetivosProductivos');
const { normalizarPropositoLote, propositoCompatibleConObjetivo } = require('../config/lotes');
const { prepararFincas, prepararOperaciones } = require('../scripts/migrarCriaAReproduccion');
const Animal = require('../models/Animal');

test('normaliza variantes históricas de objetivos a valores canónicos', () => {
    ['Cría', 'Cria', 'CRIA', 'cria', ' Cría ', 'Reproducción', ' reproduccion ']
        .forEach((valor) => assert.equal(normalizarObjetivoProductivo(valor), 'REPRODUCCION'));
    assert.equal(normalizarObjetivoProductivo('Engorde'), 'ENGORDE');
    assert.equal(normalizarObjetivoProductivo('Reemplazo'), 'REEMPLAZO');
    assert.equal(normalizarObjetivoProductivo('Cría y engorde'), null);
});

test('normaliza CRIA en propósitos y compatibilidad sin perpetuar el valor', () => {
    assert.equal(normalizarPropositoLote('Cría'), 'REPRODUCCION');
    assert.equal(propositoCompatibleConObjetivo('REPRODUCCION', 'Cría'), true);
    assert.equal(propositoCompatibleConObjetivo('REPRODUCCION', 'REEMPLAZO'), false);
});

test('Animal usa la normalización como última barrera de persistencia', () => {
    const animal = new Animal({ identificadorFinca: 'T-1', sexo: 'Hembra', objetivoProductivo: 'Cría' });
    assert.equal(animal.objetivoProductivo, 'REPRODUCCION');
    assert.equal(animal.validateSync()?.errors?.objetivoProductivo, undefined);
});

test('la migración separa cambios seguros de valores ambiguos y es idempotente', () => {
    const primera = prepararOperaciones({
        documentos: [
            { _id: '1', especie: 'Bovino', objetivoProductivo: 'Cría' },
            { _id: '2', especie: 'Porcino', objetivoProductivo: 'Cría futura' },
            { _id: '3', especie: 'Bovino', objetivoProductivo: 'REPRODUCCION' }
        ],
        campo: 'objetivoProductivo',
        normalizador: normalizarObjetivoProductivo,
        entidad: 'Animal',
        incluirSinDefinir: true
    });
    assert.equal(primera.cambios.length, 1);
    assert.equal(primera.ambiguos.length, 1);
    const segunda = prepararOperaciones({
        documentos: [{ _id: '1', especie: 'Bovino', objetivoProductivo: 'REPRODUCCION' }],
        campo: 'objetivoProductivo', normalizador: normalizarObjetivoProductivo, entidad: 'Animal', incluirSinDefinir: true
    });
    assert.equal(segunda.cambios.length, 0);
});

test('la migración fusiona CRIA y REPRODUCCION en líneas de finca', () => {
    const resultado = prepararFincas([{ _id: 'f1', codigo: 'F1', lineasProductivas: [{ especie: 'Bovino', objetivos: ['Cría', 'REPRODUCCION'] }] }]);
    assert.equal(resultado.operaciones.length, 1);
    assert.deepEqual(resultado.operaciones[0].updateOne.update.$set.lineasProductivas[0].objetivos, ['REPRODUCCION']);
});
