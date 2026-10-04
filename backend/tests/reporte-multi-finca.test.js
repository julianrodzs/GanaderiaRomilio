const test = require('node:test');
const assert = require('node:assert/strict');
const {
    construirComparativoMultiFinca,
    periodoReporte,
    resolverFincaHistorica
} = require('../services/reporteMultiFinca-service');

test('consolida fincas sin promediar promedios de peso', () => {
    const resultado = construirComparativoMultiFinca({
        fincas: [{ _id: '1', codigo: 'A', nombre: 'Finca A' }, { _id: '2', codigo: 'B', nombre: 'Finca B' }],
        inventario: [
            { _id: '1', activos: 2, bovinos: 2, animalesConPeso: 2, pesoTotal: 800 },
            { _id: '2', activos: 1, porcinos: 1, animalesConPeso: 1, pesoTotal: 100 }
        ],
        finanzas: [
            { _id: '1', ingresos: 1000, egresos: 400, transferenciasSalientes: 250, gastosCompartidos: 100 },
            { _id: '2', ingresos: 200, egresos: 300, transferenciasEntrantes: 250, gastosCompartidos: 50 }
        ],
        partos: [{ _id: '1', cantidad: 2 }],
        destetes: [{ _id: '1', cantidad: 2, conPeso: 2, pesoTotal: 400 }],
        aplicaciones: [{ _id: '2', cantidad: 3 }],
        tratamientos: [{ _id: '2', cantidad: 1 }]
    });

    assert.equal(resultado.consolidado.animalesActivos, 3);
    assert.equal(resultado.consolidado.pesoPromedio, 300);
    assert.equal(resultado.consolidado.balance, 500);
    assert.equal(resultado.consolidado.transferenciasInternas, 250);
    assert.equal(resultado.consolidado.gastosCompartidos, 150);
    assert.equal(resultado.fincas[0].finanzas.transferenciaInternaNeta, -250);
    assert.equal(resultado.fincas[1].finanzas.transferenciaInternaNeta, 250);
    assert.equal(Math.round(resultado.fincas[0].participacion.inventarioPct), 67);
    assert.equal(resultado.fincas[1].sanidad.aplicaciones, 3);
});

test('rechaza rangos multi-finca invertidos', () => {
    assert.throws(() => periodoReporte({ fechaInicio: '2026-12-01', fechaFin: '2026-01-01' }), /período/);
});

test('mantiene CRC y USD separados en finanzas consolidadas', () => {
    const resultado = construirComparativoMultiFinca({
        fincas: [{ _id: '1', codigo: 'A', nombre: 'Finca A' }],
        finanzas: [
            { _id: { fincaId: '1', moneda: 'CRC' }, ingresos: 100000, egresos: 25000 },
            { _id: { fincaId: '1', moneda: 'USD' }, ingresos: 500, egresos: 100 }
        ]
    });

    assert.equal(resultado.consolidado.ingresos, 100000);
    assert.equal(resultado.consolidado.balance, 75000);
    assert.deepEqual(resultado.consolidado.monedas.CRC, {
        ingresos: 100000,
        egresos: 25000,
        balance: 75000,
        transferenciasInternas: 0,
        gastosCompartidos: 0
    });
    assert.deepEqual(resultado.consolidado.monedas.USD, {
        ingresos: 500,
        egresos: 100,
        balance: 400,
        transferenciasInternas: 0,
        gastosCompartidos: 0
    });
});

test('atribuye el destete a la finca vigente en la fecha real', () => {
    const historias = [
        { fecha: new Date('2026-01-01'), fincaDestino: 'finca-a' },
        { fecha: new Date('2026-08-01'), fincaDestino: 'finca-b' }
    ];

    assert.equal(
        resolverFincaHistorica({ fincaId: 'finca-b' }, historias, new Date('2026-07-15')),
        'finca-a'
    );
    assert.equal(
        resolverFincaHistorica({ fincaId: 'finca-b' }, historias, new Date('2026-09-01')),
        'finca-b'
    );
});
