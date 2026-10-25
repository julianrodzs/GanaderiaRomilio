const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calcularAnimalesDia,
    construirPoblacionAFecha
} = require('../services/poblacionHistorica-service');
const { rangoFechaCivil, rangoInstantesEnZona } = require('../services/fechaZonaHoraria-service');
const {
    asignarEconomiaPorCamada,
    construirContratoSustentabilidad
} = require('../services/finanzas-calculos-service');
const { COLUMNAS_PDF, dibujarEncabezadoTabla } = require('../services/cierreConsolidado-export-service');
const { prepararMigracion } = require('../scripts/completarFechaMuerteDesdeEventos');

const animal = {
    _id: 'a1', fincaId: 'f2', especie: 'Bovino', fechaNacimiento: new Date('2026-01-01T00:00:00Z'),
    fechaVenta: new Date('2026-01-20T00:00:00Z')
};
const historias = [
    { animal: 'a1', tipo: 'Ingreso inicial', fincaDestino: 'f1', fecha: new Date('2026-01-01T00:00:00Z') },
    { animal: 'a1', tipo: 'Traslado', fincaOrigen: 'f1', fincaDestino: 'f2', fecha: new Date('2026-01-10T00:00:00Z') }
];

test('la población histórica no cambia por una venta posterior al corte', () => {
    const enFinca1 = construirPoblacionAFecha({ animales: [animal], historias, fincaId: 'f1', fecha: new Date('2026-01-05T23:59:59Z') });
    const enFinca2 = construirPoblacionAFecha({ animales: [animal], historias, fincaId: 'f2', fecha: new Date('2026-01-15T23:59:59Z') });
    const despuesVenta = construirPoblacionAFecha({ animales: [animal], historias, fincaId: 'f2', fecha: new Date('2026-01-20T23:59:59Z') });
    assert.equal(enFinca1.length, 1);
    assert.equal(enFinca2.length, 1);
    assert.equal(despuesVenta.length, 0);
});

test('animales-día reparte exactamente la presencia entre fincas', () => {
    const f1 = calcularAnimalesDia({ animales: [animal], historias, fincaId: 'f1', fechaInicio: new Date('2026-01-01'), fechaFin: new Date('2026-01-20') });
    const f2 = calcularAnimalesDia({ animales: [animal], historias, fincaId: 'f2', fechaInicio: new Date('2026-01-01'), fechaFin: new Date('2026-01-20') });
    assert.equal(f1.animalesDia, 9);
    assert.equal(f2.animalesDia, 10);
});

test('fechas civiles e instantes locales tienen contratos distintos y validan rangos', () => {
    const civil = rangoFechaCivil({ fechaInicio: '2026-10-01', fechaFin: '2026-10-31' });
    const local = rangoInstantesEnZona({ fechaInicio: '2026-10-01', fechaFin: '2026-10-31' });
    assert.equal(civil.inicio.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(local.inicio.toISOString(), '2026-10-01T06:00:00.000Z');
    assert.equal(local.finExclusivo.toISOString(), '2026-11-01T06:00:00.000Z');
    assert.throws(() => rangoFechaCivil({ fechaInicio: '2026-11-01', fechaFin: '2026-10-01' }));
});

test('dashboard recibe contrato de sustentabilidad por moneda y sin extrapolación', () => {
    const contrato = construirContratoSustentabilidad({
        gastos: { CRC: 300, USD: 30 }, ventas: { CRC: 1000, USD: 100 }, compras: { CRC: 200, USD: 20 },
        animalesPromedio: 10, movimientosPeriodo: 4
    });
    assert.deepEqual(contrato.monedas.CRC, {
        montoVentasAnimales: 1000, montoComprasAnimales: 200, gastosOperativosPeriodo: 300,
        costoPorAnimalPeriodo: 30, balancePeriodo: 500
    });
    assert.equal(contrato.monedas.USD.balancePeriodo, 50);
    assert.equal(contrato.movimientosPeriodo, 4);
});

test('economía de camadas no reparte directos de otra cohorte', () => {
    const resultado = asignarEconomiaPorCamada({
        camadaIds: ['c1'],
        movimientos: [
            { referenciaModelo: 'Camada', referenciaId: 'c1', naturaleza: 'Egreso', monto: 100, moneda: 'CRC' },
            { referenciaModelo: 'Camada', referenciaId: 'c2', naturaleza: 'Egreso', monto: 500, moneda: 'CRC' },
            { naturaleza: 'Egreso', monto: 50, moneda: 'CRC' }
        ]
    });
    assert.equal(resultado.asignaciones.c1.monedas.CRC.costoAsignado, 150);
    assert.equal(resultado.resumenMonedas.CRC.egresosDirectosFueraCohorte, 500);
    assert.equal(resultado.cobertura.movimientosDirectosFueraCohorte, 1);
});

test('todos los encabezados PDF usan la misma coordenada vertical', () => {
    const coordenadas = [];
    const documento = {
        font() { return this; }, fontSize() { return this; },
        heightOfString() { return 10; },
        text(texto, x, y) { coordenadas.push({ texto, x, y }); return this; }
    };
    dibujarEncabezadoTabla(documento, 72);
    assert.equal(coordenadas.length, COLUMNAS_PDF.length);
    assert.deepEqual(new Set(coordenadas.map((item) => item.y)), new Set([72]));
});

test('migración de fecha de muerte usa solo eventos confiables y es idempotente', () => {
    const resultado = prepararMigracion({
        animales: [{ _id: 'a1', diio: '100' }, { _id: 'a2', diio: '200' }],
        eventos: [{ animal: 'a1', tipoEvento: 'Muerte', fecha: new Date('2026-01-15') }]
    });
    assert.equal(resultado.operaciones.length, 1);
    assert.deepEqual(resultado.operaciones[0].updateOne.filter, { _id: 'a1', fechaMuerte: { $exists: false } });
    assert.equal(resultado.sinFuente[0].diio, '200');
});
