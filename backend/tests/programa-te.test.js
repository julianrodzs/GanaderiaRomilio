const test = require('node:test');
const assert = require('node:assert/strict');
const { comprobarInvariante, dinero, motivo } = require('../services/bancoEmbriones-service');
const { sumar, prepararProtocolo, datosServicioLote } = require('../services/programaTE-service');
const { analizar } = require('../scripts/migrar-reproduccion-y-te');
const { MovimientoEmbrion } = require('../models/ProgramaTE');

test('TE: invariante de existencias incluye ambas gavetas, reservas y destinos reales', () => {
    const l = { totalIngresados: 6, stockReproductivo: 2, stockComercial: 1, asignadoCampanas: 0, totalTransferidos: 1, totalVendidos: 1, totalMermas: 1 };
    assert.equal(comprobarInvariante(l), true);
    for (const cambio of [{ stockComercial: -1 }, { stockReproductivo: 1.5 }, { totalIngresados: 7 }]) assert.throws(() => comprobarInvariante({ ...l, ...cambio }));
});
test('TE: costos no convierten ni mezclan CRC y USD y se rechazan importes invalidos', () => {
    assert.deepEqual(sumar([{ monto: 600, moneda: 'USD' }, { monto: 60000, moneda: 'CRC' }]), { CRC: 60000, USD: 600 });
    for (const n of [-1, Infinity, NaN, 1e12]) assert.throws(() => dinero(n));
    assert.throws(() => motivo('   '));
});
test('TE: cronograma usa el motor existente y rechaza operadores o acciones ajenas', () => {
    assert.equal(prepararProtocolo([{ nombre: 'Control', tipoAccion: 'CONTROL', offsetHoras: 0 }]).pasos[0].referenciaTemporal, 'DESDE_INICIO');
    assert.throws(() => prepararProtocolo([{ nombre: 'Control', tipoAccion: 'IATF', offsetHoras: 0 }]));
    assert.throws(() => prepararProtocolo([{ nombre: 'Control', tipoAccion: 'CONTROL', offsetHoras: 24 }]));
    assert.throws(() => prepararProtocolo([{ $set: { nombre: 'Ataque' } }]));
});
test('TE: servicio del banco conserva DIIO de donante externa y origen FIV', () => {
    const s = datosServicioLote({ origenEmbrion: 'FIV', estadoConservacion: 'VITRIFICADO', donanteExterna: { nombre: 'Donante', diio: 'D-1' }, padreExterno: { nombre: 'Padre', diio: 'P-1' }, costoUnitario: 50, moneda: 'USD' }, 'receptora', '2026-01-01');
    assert.equal(s.metodo, 'TRANSFERENCIA_EMBRIONES'); assert.equal(s.embrion.donanteDiio, 'D-1'); assert.equal(s.diioSemental, 'P-1'); assert.equal(s.embrion.origenEmbrion, 'FIV');
});
test('TE: ledger tiene clave parcial por tenant y prohibe mutaciones', () => {
    assert.ok(MovimientoEmbrion.schema.indexes().some(([k, o]) => k.claveIdempotencia && o.unique && o.partialFilterExpression.claveIdempotencia.$type === 'string'));
    for (const op of ['updateOne', 'deleteMany', 'bulkWrite']) assert.ok(MovimientoEmbrion.schema.s.hooks._pres.has(op));
});
test('TE: migracion no inventa ciclos para transferencias sin trazabilidad', () => {
    assert.throws(() => analizar({ organizacionId: 'org', fincaId: 'finca', moneda: 'USD', costoTotal: 0, origenEmbrion: 'FIV', donanteExternaNombre: 'Donante', embriones: [{ estado: 'TRANSFERIDO', estadoEmbrion: 'FRESCO', receptoraId: 'r' }] }), /sin ciclo/);
});
