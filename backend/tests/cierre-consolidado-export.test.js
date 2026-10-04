const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const {
    exportarCierreExcel,
    exportarCierrePdf,
    filasFincas
} = require('../services/cierreConsolidado-export-service');

const cierre = {
    nombre: 'Cierre septiembre',
    fechaInicio: new Date('2026-09-01T00:00:00Z'),
    fechaFin: new Date('2026-09-30T00:00:00Z'),
    especie: 'Todos',
    datos: {
        consolidado: { fincas: 1, animalesActivos: 18, ingresos: 2000, egresos: 900, balance: 1100 },
        fincas: [{
            finca: { codigo: 'F-01', nombre: 'Principal' },
            inventario: { activos: 18, bovinos: 12, porcinos: 6, pesoPromedio: 322 },
            finanzas: { ingresos: 2000, egresos: 900, balance: 1100 },
            reproduccion: { partos: 2, destetes: 1 },
            sanidad: { aplicaciones: 4, tratamientosActivos: 1 }
        }],
        evolucionMensual: [],
        metas: []
    }
};

test('la exportación histórica usa exclusivamente el snapshot guardado', () => {
    assert.equal(filasFincas(cierre)[0].Finca, 'Principal');
    assert.equal(filasFincas(cierre)[0].Balance, 1100);
    const libro = XLSX.read(exportarCierreExcel(cierre));
    assert.deepEqual(libro.SheetNames, ['Resumen', 'Fincas', 'Evolución mensual', 'Metas']);
    assert.equal(XLSX.utils.sheet_to_json(libro.Sheets.Fincas)[0].Finca, 'Principal');
});

test('la exportación PDF produce un documento válido', async () => {
    const archivo = await exportarCierrePdf(cierre);
    assert.equal(archivo.subarray(0, 4).toString(), '%PDF');
    assert.ok(archivo.length > 500);
});
