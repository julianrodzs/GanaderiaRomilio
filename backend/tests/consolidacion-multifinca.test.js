const test = require('node:test');
const assert = require('node:assert/strict');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const HistorialFincaAnimal = require('../models/HistorialFincaAnimal');
const CierreConsolidado = require('../models/CierreConsolidado');
const {
    calcularDistribucionGasto,
    claveCierre
} = require('../services/consolidacionMultiFinca-service');
const { prepararOperaciones } = require('../scripts/inicializarHistorialFincasAnimales');

test('distribuye un gasto en partes iguales sin perder centavos', () => {
    const resultado = calcularDistribucionGasto({
        montoTotal: 100,
        modo: 'IGUAL',
        distribucion: [{ fincaId: 'a' }, { fincaId: 'b' }, { fincaId: 'c' }]
    });
    assert.deepEqual(resultado.map((item) => item.monto), [33.33, 33.33, 33.34]);
    assert.equal(resultado.reduce((total, item) => total + item.monto, 0), 100);
});

test('acepta distribución por porcentaje o por monto exacto', () => {
    const porcentajes = calcularDistribucionGasto({
        montoTotal: 1000,
        modo: 'PORCENTAJE',
        distribucion: [{ fincaId: 'a', porcentaje: 25 }, { fincaId: 'b', porcentaje: 75 }]
    });
    assert.deepEqual(porcentajes.map((item) => item.monto), [250, 750]);

    const montos = calcularDistribucionGasto({
        montoTotal: 1000,
        modo: 'MONTO',
        distribucion: [{ fincaId: 'a', monto: 400 }, { fincaId: 'b', monto: 600 }]
    });
    assert.deepEqual(montos.map((item) => item.monto), [400, 600]);
});

test('rechaza distribuciones que duplican fincas o no cuadran', () => {
    assert.throws(() => calcularDistribucionGasto({
        montoTotal: 100,
        modo: 'PORCENTAJE',
        distribucion: [{ fincaId: 'a', porcentaje: 40 }, { fincaId: 'b', porcentaje: 40 }]
    }), /sumar 100/);
    assert.throws(() => calcularDistribucionGasto({
        montoTotal: 100,
        distribucion: [{ fincaId: 'a' }, { fincaId: 'a' }]
    }), /repetidas/);
});

test('la clave de cierre es estable aunque cambie el orden de fincas', () => {
    const base = { fechaInicio: '2026-01-01', fechaFin: '2026-01-31', especie: 'Todos' };
    assert.equal(
        claveCierre({ ...base, fincaIds: ['b', 'a'] }),
        claveCierre({ ...base, fincaIds: ['a', 'b'] })
    );
});

test('los modelos conservan trazabilidad y reglas de eliminación consolidada', () => {
    assert.deepEqual(MovimientoFinanciero.schema.path('alcanceFinanciero').enumValues, [
        'EXTERNO', 'TRANSFERENCIA_INTERNA', 'GASTO_COMPARTIDO'
    ]);
    assert.equal(MovimientoFinanciero.schema.path('excluirConsolidacion').defaultValue, false);
    assert.ok(HistorialFincaAnimal.schema.path('fincaDestino'));
    assert.equal(CierreConsolidado.schema.path('estado').defaultValue, 'Cerrado');
});

test('la inicialización del historial omite animales ya preparados y es idempotente', () => {
    const animales = [
        { _id: '1', organizacionId: 'org', fincaId: 'finca-a', createdAt: new Date('2026-01-01') },
        { _id: '2', organizacionId: 'org', fincaId: 'finca-b', createdAt: new Date('2026-01-02') }
    ];
    assert.equal(prepararOperaciones(animales, new Set(['1'])).length, 1);
    assert.equal(prepararOperaciones(animales, new Set(['1', '2'])).length, 0);
});
