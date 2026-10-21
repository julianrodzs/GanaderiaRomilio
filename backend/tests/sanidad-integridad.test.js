const test = require('node:test');
const assert = require('node:assert/strict');
const Animal = require('../models/Animal');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const {
    sanitizarAplicacionSanitaria,
    sanitizarPlanSanitario,
    sanitizarTratamientoSanitario
} = require('../services/sanidad-dto-service');
const { calcularFechaFinRetiroCarne, normalizarDiasRetiro } = require('../services/retiro-carne-service');
const { obtenerFechaTareaTratamiento } = require('../services/sanidad-tarea-service');

test('los modelos sanitarios conservan retiro de carne e idempotencia', () => {
    assert.ok(Animal.schema.path('fechaFinRetiroCarne'));
    assert.ok(Animal.schema.path('medicamentoEnRetiro'));
    assert.ok(TratamientoSanitario.schema.path('diasRetiroCarne'));
    assert.ok(TratamientoSanitario.schema.path('fechaFinRetiroCarne'));
    assert.ok(AplicacionSanitaria.schema.path('diasRetiroCarne'));
    assert.ok(AplicacionSanitaria.schema.path('fechaFinRetiroCarne'));
    assert.ok(AplicacionSanitaria.schema.path('claveIdempotencia'));
});

test('los DTO sanitarios rechazan tenant, operadores y campos internos', () => {
    assert.throws(() => sanitizarPlanSanitario({ fincaId: 'ajena' }), /se obtiene de la sesión/);
    assert.throws(() => sanitizarTratamientoSanitario({ '$set': { estado: 'Completado' } }), /no está permitida/);
    assert.throws(() => sanitizarAplicacionSanitaria({ 'tratamiento.estado': 'Completado' }), /no está permitida/);
    assert.throws(() => sanitizarAplicacionSanitaria({ naturaleza: 'Tratamiento' }), /Campos no permitidos/);
});

test('el DTO de aplicación conserva únicamente datos clínicos permitidos', () => {
    assert.deepEqual(sanitizarAplicacionSanitaria({
        animales: ['a1'],
        producto: 'Oxitetraciclina',
        diasRetiroCarne: 28,
        fechaAplicacion: '2026-10-19'
    }), {
        animales: ['a1'],
        producto: 'Oxitetraciclina',
        diasRetiroCarne: 28,
        fechaAplicacion: '2026-10-19'
    });
});

test('el retiro de carne se calcula desde la aplicación real', () => {
    assert.equal(
        calcularFechaFinRetiroCarne('2026-10-19T00:00:00.000Z', 28).toISOString(),
        '2026-11-16T00:00:00.000Z'
    );
    assert.equal(calcularFechaFinRetiroCarne('2026-10-19', 0), null);
    assert.throws(() => normalizarDiasRetiro(1.5), /entero/);
});

test('un tratamiento sin aplicaciones agenda la primera dosis en fechaInicio', () => {
    const fechaInicio = new Date('2026-10-20T00:00:00.000Z');
    const proxima = new Date('2026-10-25T00:00:00.000Z');
    assert.equal(obtenerFechaTareaTratamiento({ aplicacionesRealizadas: 0, fechaInicio, proximaAplicacion: proxima }), fechaInicio);
    assert.equal(obtenerFechaTareaTratamiento({ aplicacionesRealizadas: 1, fechaInicio, proximaAplicacion: proxima }), proxima);
});
