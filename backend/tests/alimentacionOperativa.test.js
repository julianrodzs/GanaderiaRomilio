const test = require('node:test');
const assert = require('node:assert/strict');
const {
    convertirAKg,
    construirTotales,
    validarCompatibilidadRacionLote
} = require('../services/alimentacion-service');
const SuministroAlimentacion = require('../models/SuministroAlimentacion');
const AsignacionRacionLote = require('../models/AsignacionRacionLote');

test('convierte unidades directas y presentaciones usando factores explícitos', () => {
    assert.deepEqual(convertirAKg({ cantidad: 1.5, unidad: 'TONELADA' }), { cantidadKg: 1500, factor: 1000, estimado: false });
    assert.deepEqual(convertirAKg({ cantidad: 3, unidad: 'SACO', presentacion: { cantidadBaseKg: 40, estimada: false } }), { cantidadKg: 120, factor: 40, estimado: false });
    assert.deepEqual(convertirAKg({ cantidad: 2, unidad: 'CARRETA', factorConversionKg: 350 }), { cantidadKg: 700, factor: 350, estimado: false });
});

test('rechaza unidades operativas sin conversión conocida a kg', () => {
    assert.throws(() => convertirAKg({ cantidad: 2, unidad: 'PACA' }), /necesita una presentación o factor/);
});

test('solo calcula consumo cuando todos los componentes tienen sobrante', () => {
    const incompleto = construirTotales([{ cantidadKg: 100, sobranteKg: 10 }, { cantidadKg: 50, sobranteKg: null }], 10);
    assert.equal(incompleto.totalKgSuministrados, 150);
    assert.equal(incompleto.kgSuministradosPorCabeza, 15);
    assert.equal(incompleto.totalConsumoEstimadoKg, null);

    const completo = construirTotales([{ cantidadKg: 100, sobranteKg: 10 }, { cantidadKg: 50, sobranteKg: 5 }], 10);
    assert.equal(completo.totalConsumoEstimadoKg, 135);
    assert.equal(completo.consumoEstimadoPorCabeza, 13.5);
});

test('bloquea raciones incompatibles con especie, propósito o lote cerrado', () => {
    assert.throws(() => validarCompatibilidadRacionLote({ activo: true, especie: 'Porcino', proposito: 'ENGORDE' }, { estado: 'ACTIVO', especie: 'Bovino', proposito: 'ENGORDE' }), /especie/);
    assert.throws(() => validarCompatibilidadRacionLote({ activo: true, especie: 'Bovino', proposito: 'ENGORDE' }, { estado: 'ACTIVO', especie: 'Bovino', proposito: 'CRIA' }), /propósito/);
    assert.throws(() => validarCompatibilidadRacionLote({ activo: true, especie: 'Bovino', proposito: 'ENGORDE' }, { estado: 'CERRADO', especie: 'Bovino', proposito: 'ENGORDE' }), /no está activo/);
});

test('el suministro conserva snapshots e historial de correcciones', () => {
    const paths = SuministroAlimentacion.schema.paths;
    assert.ok(paths.planAlimentacionSnapshot);
    assert.ok(paths.racionSnapshot);
    assert.ok(paths.cantidadAnimalesSnapshot);
    assert.ok(paths.historialCorrecciones);
    assert.equal(SuministroAlimentacion.schema.options.optimisticConcurrency, true);
});

test('una restricción parcial impide dos raciones activas por lote', () => {
    const indice = AsignacionRacionLote.schema.indexes().find(([campos]) => campos.lote === 1 && Object.keys(campos).length === 3);
    assert.ok(indice);
    assert.equal(indice[1].unique, true);
    assert.deepEqual(indice[1].partialFilterExpression, { activo: true });
});
