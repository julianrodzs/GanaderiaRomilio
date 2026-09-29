const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calcularEdadMeses,
    obtenerCategoriaBovinaPorEdad
} = require('../services/categoriaAnimal-service');

const referencia = new Date('2026-09-28T12:00:00.000Z');

test('calcula la edad en meses sin adelantar el mes incompleto', () => {
    assert.equal(calcularEdadMeses('2024-09-29', referencia), 23);
    assert.equal(calcularEdadMeses('2024-09-28', referencia), 24);
});

test('clasifica bovinos por edad y sexo', () => {
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Hembra', fechaNacimiento: '2026-01-01' }, referencia), 'Ternero');
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Hembra', fechaNacimiento: '2025-01-01' }, referencia), 'Novilla');
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Hembra', fechaNacimiento: '2024-01-01' }, referencia), 'Vaca');
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Macho', fechaNacimiento: '2025-01-01' }, referencia), 'Novillo');
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Macho', fechaNacimiento: '2024-01-01' }, referencia), 'Toro');
});

test('no inventa categoría si falta una fecha válida', () => {
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Macho' }, referencia), null);
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Hembra', fechaNacimiento: 'fecha-invalida' }, referencia), null);
});
