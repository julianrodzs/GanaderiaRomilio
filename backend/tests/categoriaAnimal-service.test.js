const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calcularEdadMeses,
    obtenerCategoriaBovinaPorEdad,
    obtenerCategoriaPorcinaPorEdad,
    validarYPrepararCategoriaAnimal
} = require('../services/categoriaAnimal-service');
const Animal = require('../models/Animal');
const mongoose = require('mongoose');
const { agregarCandidata, claveIdentificador } = require('../scripts/vincularMadresInternas');

const referencia = new Date('2026-09-28T12:00:00.000Z');

test('calcula la edad en meses sin adelantar el mes incompleto', () => {
    assert.equal(calcularEdadMeses('2024-09-29', referencia), 23);
    assert.equal(calcularEdadMeses('2024-09-28', referencia), 24);
});

test('la fecha del siguiente umbral respeta fin de mes, bisiestos y categorias finales oficiales', () => {
    const { fechaProximoCambioCategoria } = require('../services/categoriaAnimal-service');
    assert.equal(fechaProximoCambioCategoria({ sexo: 'Hembra', especie: 'Bovino', fechaNacimiento: '2024-02-29' }, new Date('2025-02-28')).toISOString(), '2025-03-01T00:00:00.000Z');
    assert.equal(fechaProximoCambioCategoria({ sexo: 'Macho', especie: 'Porcino', fechaNacimiento: '2026-01-31' }, new Date('2026-04-30')).toISOString(), '2026-05-01T00:00:00.000Z');
    assert.equal(fechaProximoCambioCategoria({ sexo: 'Hembra', especie: 'Porcino', fechaNacimiento: '2025-01-01' }, referencia), null);
});

test('clasifica bovinos por edad y sexo', () => {
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Hembra', fechaNacimiento: '2026-01-01' }, referencia), 'Ternera');
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Hembra', fechaNacimiento: '2025-01-01' }, referencia), 'Novilla');
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Hembra', fechaNacimiento: '2024-01-01' }, referencia), 'Vaca');
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Macho', fechaNacimiento: '2025-01-01' }, referencia), 'Novillo');
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Macho', fechaNacimiento: '2024-01-01' }, referencia), 'Toro');
});

test('clasifica porcinos por edad y sexo sin mezclar el objetivo productivo', () => {
    assert.equal(obtenerCategoriaPorcinaPorEdad({ sexo: 'Macho', fechaNacimiento: '2026-08-01' }, referencia), 'Lechón');
    assert.equal(obtenerCategoriaPorcinaPorEdad({ sexo: 'Hembra', fechaNacimiento: '2026-08-01' }, referencia), 'Lechona');
    assert.equal(obtenerCategoriaPorcinaPorEdad({ sexo: 'Macho', fechaNacimiento: '2026-04-01' }, referencia), 'Cerdo joven');
    assert.equal(obtenerCategoriaPorcinaPorEdad({ sexo: 'Hembra', fechaNacimiento: '2026-04-01' }, referencia), 'Cerda joven');
    assert.equal(obtenerCategoriaPorcinaPorEdad({ sexo: 'Macho', fechaNacimiento: '2025-01-01' }, referencia), 'Cerdo adulto');
    assert.equal(obtenerCategoriaPorcinaPorEdad({ sexo: 'Hembra', fechaNacimiento: '2025-01-01' }, referencia), 'Chancha');
});

test('rechaza una categoría que contradice edad o sexo', () => {
    assert.throws(() => validarYPrepararCategoriaAnimal({ especie: 'Porcino', sexo: 'Macho', fechaNacimiento: '2025-01-01', categoria: 'Chancha' }, {}, referencia), /categoría correcta/);
    assert.equal(validarYPrepararCategoriaAnimal({ especie: 'Bovino', sexo: 'Hembra', fechaNacimiento: '2025-01-01' }, {}, referencia).categoria, 'Novilla');
});

test('no inventa categoría si falta una fecha válida', () => {
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Macho' }, referencia), null);
    assert.equal(obtenerCategoriaBovinaPorEdad({ sexo: 'Hembra', fechaNacimiento: 'fecha-invalida' }, referencia), null);
});

test('un ternero nacido desde reproducción conserva categoría, madre interna y objetivo separado', () => {
    const madre = new mongoose.Types.ObjectId();
    const ternero = new Animal({
        identificadorFinca: 'T-REPRO-1',
        diio: 'T-REPRO-1',
        especie: 'Bovino',
        sexo: 'Macho',
        categoria: 'Ternero',
        objetivoProductivo: 'SIN_DEFINIR',
        madre,
        madreDiio: 'MADRE-100',
        origenGenealogico: 'Interno'
    });

    const errores = ternero.validateSync()?.errors || {};
    assert.equal(errores.categoria, undefined);
    assert.equal(errores.objetivoProductivo, undefined);
    assert.equal(String(ternero.madre), String(madre));
    assert.equal(ternero.origenGenealogico, 'Interno');
});

test('la reparación genealógica limita madres por organización, finca y especie', () => {
    const madre = {
        _id: new mongoose.Types.ObjectId(),
        organizacionId: new mongoose.Types.ObjectId(),
        fincaId: new mongoose.Types.ObjectId(),
        especie: 'Bovino',
        diio: '188000659620'
    };
    const mapa = new Map();
    agregarCandidata(mapa, madre, madre.diio);
    agregarCandidata(mapa, madre, madre.diio);

    assert.equal(mapa.get(claveIdentificador(madre, '188000659620')).size, 1);
    assert.equal(mapa.has(claveIdentificador({ ...madre, especie: 'Porcino' }, madre.diio)), false);
});
