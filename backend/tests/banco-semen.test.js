const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { BancoSemen, MovimientoSemen } = require('../models/BancoSemen');
const { cantidad, comprobarInvariante, validarEntrada } = require('../services/bancoSemen-service');
const { analizarLegado } = require('../scripts/migrar-banco-semen');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { esMovimientoFinancieroAutomatico } = require('../services/movimientoFinanciero-proteccion-service');

test('banco: cantidades enteras positivas y limite de seguridad', () => {
    for (const n of [0, -1, 0.5, NaN, Infinity, 100000001]) assert.throws(() => cantidad(n));
    assert.equal(cantidad('5'), 5);
});
test('banco: invariante fisico y saldos por moneda independientes', () => {
    const ficha = new BancoSemen({ esExterno: true, nombreSemental: 'Prueba', especie: 'Bovino', totalIngresado: 50, stockReproductivo: 30, stockComercial: 20, saldos: { CRC: { reproductivo: 30, comercial: 20 } } });
    assert.equal(comprobarInvariante(ficha), true);
    ficha.saldos.USD.reproductivo = 1;
    assert.throws(() => comprobarInvariante(ficha), /moneda/);
});
test('banco: indices parciales no usan sparse ni claves nulas', () => {
    for (const [campos, opciones] of BancoSemen.schema.indexes().filter(([, o]) => o.unique)) {
        assert.ok(campos.toroId || campos.diioNormalizado);
        assert.ok(opciones.partialFilterExpression); assert.notEqual(opciones.sparse, true);
    }
    const indice = MovimientoSemen.schema.indexes().find(([c]) => c.claveIdempotencia);
    assert.deepEqual(indice[1].partialFilterExpression, { claveIdempotencia: { $type: 'string' } });
});
test('banco: DTO rechaza operadores, tenant y saldos arbitrarios', async () => {
    const id = new mongoose.Types.ObjectId();
    await ejecutarConOrganizacion(id, async () => {
        for (const body of [{ $set: {} }, { 'saldos.CRC': 2 }, { fincaId: id }, { totalIngresado: 100 }]) assert.throws(() => validarEntrada(body));
        assert.doesNotThrow(() => validarEntrada({ cantidad: 2 }));
    }, id);
});
test('migracion: no duplica consumo compartido por ciclo y participante', () => {
    const resultado = analizarLegado({
        insumo: { _id: 's', organizacionId: 'o', fincaId: 'f', cantidadDisponible: 8, moneda: 'CRC', costoUnitario: 10 },
        campanas: [{ _id: 'c', participantes: [{ _id: 'p', semenUtilizado: 's', fechaInseminacion: new Date(), registroReproductivo: 'r', semenSnapshot: { cantidad: 2, costoUnitario: 7, moneda: 'USD' } }] }],
        registros: [{ _id: 'r', especie: 'Bovino', cantidadPajuelas: 2, campanaIATF: 'c' }]
    });
    assert.equal(resultado.usadas, 2); assert.equal(resultado.disponible, 8); assert.deepEqual(resultado.incidencias, []);
    assert.equal(resultado.usos[0].snapshot.costoUnitario, 7);
});
test('migracion: reporta saldos ambiguos sin inventar reservas', () => {
    const resultado = analizarLegado({ insumo: { cantidadDisponible: 1.5, cantidadEnUso: 2 }, campanas: [], registros: [] });
    assert.ok(resultado.incidencias.length >= 3);
});
test('finanzas: las ventas de pajillas solo se corrigen desde su origen', () => {
    assert.equal(esMovimientoFinancieroAutomatico({ referenciaModelo: 'VentaPajilla' }), true);
    assert.throws(() => require('../services/movimientoFinanciero-dto').sanitizarMovimientoManual({ tipoMovimiento: 'Venta de pajillas' }), /desde Ventas/);
});
test('IATF: costos de asignaciones usados, sin sumar CRC y USD', () => {
    const { calcularMetricasCampana } = require('../services/iatf-service');
    const metrica = calcularMetricasCampana({ participantes: [{ bancoSemenId: 'b', fechaInseminacion: new Date(), resultadoActual: 'PREÑADA', semenSnapshot: { costoUnitario: 999 } }] }, [], [], [
        { cantidadUsada: 2, costoUnitarioAplicado: 100, moneda: 'CRC' },
        { cantidadUsada: 1, costoUnitarioAplicado: 5, moneda: 'USD' },
        { cantidadUsada: 0, costoUnitarioAplicado: 200, moneda: 'USD' }
    ]);
    assert.equal(metrica.costoSemen, null); assert.equal(metrica.costoTotal, null);
    assert.deepEqual(metrica.costosSemenPorMoneda, { CRC: 200, USD: 5 });
    assert.deepEqual(metrica.costoPorPrenezPorMoneda, { CRC: 200, USD: 5 });
});
