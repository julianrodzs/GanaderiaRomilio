const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { generarPlantillaExcel, procesarExcelPreview } = require('../services/importarExcel-service');

const crearLibro = (filasInventario) => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['VERSION_PLANTILLA', '1']]), 'INSTRUCCIONES');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA'],
        ...filasInventario
    ]), 'INVENTARIO');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['DIIO', 'FECHA', 'PESO_KG'],
        ['1001', '24/09/2026', 125]
    ]), 'PESAJES');
    return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
};

test('genera una plantilla versionada con las hojas estandar', () => {
    const libro = XLSX.read(generarPlantillaExcel(), { type: 'buffer' });
    assert.deepEqual(libro.SheetNames, ['INSTRUCCIONES', 'POTREROS', 'INVENTARIO', 'FINANZAS', 'PESAJES', 'CATALOGOS']);
});

test('acepta inventario y pesajes con encabezados estandar', async () => {
    const resultado = await procesarExcelPreview(crearLibro([['1001', 'Bovino', 'Hembra', 'Vaca']]));
    assert.equal(resultado.valido, true);
    assert.equal(resultado.resumen.Animal, 1);
    assert.equal(resultado.resumen.Pesaje, 1);
});

test('bloquea DIIO duplicado dentro del mismo archivo', async () => {
    const resultado = await procesarExcelPreview(crearLibro([
        ['1001', 'Bovino', 'Hembra', 'Vaca'],
        ['1001', 'Bovino', 'Hembra', 'Vaca']
    ]));
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((item) => item.codigo === 'DUPLICADO_ARCHIVO'));
});
