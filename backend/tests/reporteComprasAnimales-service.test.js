const test = require('node:test');
const assert = require('node:assert/strict');
const { construirReporteCompras, obtenerRangoPeso } = require('../services/reporteComprasAnimales-service');

const compras = [
    {
        _id: 'compra-bovina',
        especie: 'Bovino',
        fechaCompra: '2026-01-01T00:00:00.000Z',
        proveedor: 'Finca Norte',
        montoCalculado: 200000,
        montoTotal: 220000,
        animales: [
            { animal: 'animal-macho', diio: '1001', sexo: 'Macho', raza: 'Brahman', pesoCompraKg: 100, precioKg: 1000, subtotal: 100000 },
            { animal: 'animal-hembra', diio: '1002', sexo: 'Hembra', raza: 'Brahman', pesoCompraKg: 100, precioKg: 1000, subtotal: 100000 }
        ]
    },
    {
        _id: 'compra-porcina',
        especie: 'Porcino',
        fechaCompra: '2026-02-01T00:00:00.000Z',
        proveedor: 'Granja Sur',
        montoCalculado: 50000,
        montoTotal: 50000,
        animales: [
            { animal: 'animal-porcino', diio: '2001', sexo: 'Hembra', raza: 'Yorkshire', pesoCompraKg: 50, precioKg: 1000, subtotal: 50000 }
        ]
    }
];

const animales = [
    { _id: 'animal-macho', estado: 'Activo', montoCompra: 110000 },
    {
        _id: 'animal-hembra',
        estado: 'Vendido',
        fechaVenta: '2026-01-31T00:00:00.000Z',
        pesoVenta: 130,
        montoVenta: 180000
    },
    { _id: 'animal-porcino', estado: 'Muerto', fechaMuerte: '2026-02-20T00:00:00.000Z' }
];

const pesajes = [
    { animal: 'animal-macho', fecha: '2026-01-31T00:00:00.000Z', peso: 130 },
    { animal: 'animal-porcino', fecha: '2026-02-11T00:00:00.000Z', peso: 58 }
];

const tratamientos = [
    { animales: ['animal-macho'], fechaInicio: '2026-01-15T00:00:00.000Z', estado: 'Completado' },
    { animales: ['animal-hembra'], fechaInicio: '2026-04-15T00:00:00.000Z', estado: 'Completado' }
];

test('calcula precio ponderado, ajuste y seguimiento de compras bovinas', () => {
    const reporte = construirReporteCompras({
        compras,
        animales,
        pesajes,
        tratamientos,
        filtros: { especie: 'Bovino' },
        hoy: '2026-03-01T00:00:00.000Z'
    });

    assert.equal(reporte.resumen.totalCompras, 1);
    assert.equal(reporte.resumen.totalAnimales, 2);
    assert.equal(reporte.resumen.totalInvertido, 220000);
    assert.equal(reporte.resumen.totalKg, 200);
    assert.equal(reporte.resumen.precioEfectivoKg, 1100);
    assert.equal(reporte.resumen.ajusteMonto, 20000);
    assert.equal(reporte.resumen.porcentajeAjuste, 10);
    assert.equal(reporte.resumen.tratadosPrimeros60Dias, 1);
    assert.equal(reporte.resumen.animalesVendidosConMargen, 1);
    assert.equal(reporte.resumen.margenBrutoVendidos, 70000);
    assert.equal(reporte.resumen.gananciaDiariaPromedio, 1);
});

test('el filtro por sexo asigna proporcionalmente el monto final sin mezclar animales', () => {
    const reporte = construirReporteCompras({
        compras,
        animales,
        pesajes,
        tratamientos,
        filtros: { especie: 'Bovino', sexo: 'Macho' }
    });

    assert.equal(reporte.resumen.totalAnimales, 1);
    assert.equal(reporte.resumen.totalInvertido, 110000);
    assert.equal(reporte.resumen.montoCalculado, 100000);
    assert.equal(reporte.resumen.precioEfectivoKg, 1100);
    assert.deepEqual(reporte.porSexo.map((item) => item.sexo), ['Macho']);
});

test('separa porcinos y usa rangos de peso propios de la especie', () => {
    const reporte = construirReporteCompras({
        compras,
        animales,
        pesajes,
        tratamientos,
        filtros: { especie: 'Porcino' }
    });

    assert.equal(reporte.resumen.totalAnimales, 1);
    assert.equal(reporte.resumen.muertos, 1);
    assert.equal(reporte.resumen.tasaMortalidad, 100);
    assert.equal(reporte.rangosPeso[0].rango, '25 a 59 kg');
    assert.equal(reporte.rangosPeso[0].especie, 'Porcino');
    assert.equal(obtenerRangoPeso('Bovino', 250).etiqueta, '200 a 299 kg');
});

test('el resumen general conserva indicadores independientes por especie', () => {
    const reporte = construirReporteCompras({ compras, animales, pesajes, tratamientos });

    assert.deepEqual(reporte.porEspecie.map((item) => item.especie), ['Bovino', 'Porcino']);
    assert.equal(reporte.porEspecie.find((item) => item.especie === 'Bovino').precioEfectivoKg, 1100);
    assert.equal(reporte.porEspecie.find((item) => item.especie === 'Porcino').precioEfectivoKg, 1000);
});
