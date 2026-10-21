const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const Animal = require('../models/Animal');
const Pesaje = require('../models/Pesaje');
const { calcularGmd } = require('../services/indicesProductivos-service');
const {
    sanitizarPesaje,
    sanitizarPesajeMasivo,
    validarAnimalesUnicos,
    validarFechaPesaje
} = require('../services/pesaje-integridad-service');

test('el DTO de pesajes rechaza tenant, autor, derivados y operadores MongoDB', () => {
    assert.throws(() => sanitizarPesaje({ $set: { peso: 400 } }), /no esta permitido/);
    assert.throws(() => sanitizarPesaje({ organizacionId: new Types.ObjectId() }), /administrado por el sistema/);
    assert.throws(() => sanitizarPesaje({ registradoPor: new Types.ObjectId() }), /administrado por el sistema/);
    assert.throws(() => sanitizarPesaje({ aumentoKg: 100 }), /administrado por el sistema/);
    assert.deepEqual(sanitizarPesaje({ animal: 'a1', fecha: '2026-10-10', peso: 320 }), {
        animal: 'a1', fecha: '2026-10-10', peso: 320
    });
    assert.throws(() => sanitizarPesajeMasivo({ fincaId: new Types.ObjectId(), pesajes: [] }), /administrado por el sistema/);
    assert.throws(() => sanitizarPesajeMasivo({ pesajes: [], campoInventado: true }), /contrato de pesaje masivo/);
});

test('las fechas futuras o anteriores al nacimiento se rechazan', () => {
    const ahora = new Date('2026-10-16T12:00:00.000Z');
    assert.throws(() => validarFechaPesaje('2999-01-01', null, ahora), /futuro/);
    assert.throws(() => validarFechaPesaje('2025-01-01', '2025-02-01', ahora), /anterior al nacimiento/);
    assert.equal(validarFechaPesaje('2026-10-16', '2025-02-01', ahora).toISOString(), '2026-10-16T00:00:00.000Z');
});

test('un pesaje masivo no acepta el mismo animal dos veces', () => {
    assert.throws(() => validarAnimalesUnicos([
        { animal: 'animal-1', peso: 200 },
        { animal: 'animal-1', peso: 210 }
    ]), /mismo animal/);
    assert.deepEqual(validarAnimalesUnicos([{ animal: 'a1' }, { animal: 'a2' }]), ['a1', 'a2']);
});

test('GMD mantiene pérdidas reales y no divide entre fechas iguales', () => {
    assert.equal(calcularGmd([
        { fecha: '2026-10-01', peso: 100 },
        { fecha: '2026-10-11', peso: 90 }
    ]).gmdReal, -1);
    assert.equal(calcularGmd([
        { fecha: '2026-10-01', peso: 100 },
        { fecha: '2026-10-01', peso: 110 }
    ]), null);
});

test('los modelos conservan la proyeccion de peso y la trazabilidad del pesaje', () => {
    assert.ok(Animal.schema.path('fechaUltimoPesaje'));
    assert.ok(Pesaje.schema.path('lote'));
    assert.deepEqual(Pesaje.schema.path('tipoPesaje').enumValues, ['Individual', 'Lote', 'Importacion']);
    assert.ok(Pesaje.schema.path('editadoPor'));
    assert.ok(Pesaje.schema.path('fechaEdicion'));
});
