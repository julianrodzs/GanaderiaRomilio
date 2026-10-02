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

test('normaliza Cría de una plantilla antigua a REPRODUCCION', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['VERSION_PLANTILLA', '1']]), 'INSTRUCCIONES');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA', 'OBJETIVO_PRODUCTIVO'],
        ['1101', 'Bovino', 'Hembra', 'Vaca', ' Cría ']
    ]), 'INVENTARIO');
    const resultado = await procesarExcelPreview(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }));
    assert.equal(resultado.valido, true);
    assert.equal(resultado.registros.Animal[0].objetivoProductivo, 'REPRODUCCION');
});

test('rechaza una categoría de inventario incompatible con edad y sexo', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['VERSION_PLANTILLA', '1']]), 'INSTRUCCIONES');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA', 'FECHA_NACIMIENTO'],
        ['2001', 'Porcino', 'Macho', 'Chancha', '01/01/2025']
    ]), 'INVENTARIO');
    const resultado = await procesarExcelPreview(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }));
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((item) => item.codigo === 'CATEGORIA_EDAD_SEXO_INCOMPATIBLE'));
});

test('bloquea DIIO duplicado dentro del mismo archivo', async () => {
    const resultado = await procesarExcelPreview(crearLibro([
        ['1001', 'Bovino', 'Hembra', 'Vaca'],
        ['1001', 'Bovino', 'Hembra', 'Vaca']
    ]));
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((item) => item.codigo === 'DUPLICADO_ARCHIVO'));
});

test('acepta columnas raciales y genealógicas opcionales', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['VERSION_PLANTILLA', '1']]), 'INSTRUCCIONES');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA', 'RAZA', 'RAZA_PRINCIPAL', 'RAZA_SECUNDARIA', 'DESCRIPCION_RACIAL', 'MADRE_DIIO', 'PADRE_DIIO'],
        ['3001', 'Bovino', 'Hembra', 'Novilla', 'Brahman con Angus', 'Brahman', 'Angus', 'Brahman con Angus', '1001', '2001']
    ]), 'INVENTARIO');
    const resultado = await procesarExcelPreview(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }));
    assert.equal(resultado.valido, true);
    assert.equal(resultado.registros.Animal[0].razaPrincipal, 'Brahman');
    assert.equal(resultado.registros.Animal[0].madreDiio, '1001');
});

test('acepta razas y fracciones porcinas en el importador', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['VERSION_PLANTILLA', '1']]), 'INSTRUCCIONES');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA', 'RAZA_PRINCIPAL', 'RAZA_SECUNDARIA', 'FRACCION_RAZA_PRINCIPAL', 'FRACCION_RAZA_SECUNDARIA'],
        ['P-301', 'Porcino', 'Hembra', 'Chancha', 'Duroc', 'Landrace', '3/8', '10/16']
    ]), 'INVENTARIO');
    const resultado = await procesarExcelPreview(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }));
    assert.equal(resultado.valido, true);
    assert.equal(resultado.registros.Animal[0].fraccionRazaPrincipal, '3/8');
    assert.equal(resultado.registros.Animal[0].fraccionRazaSecundaria, '5/8');
});

test('reconoce pasto principal y conserva nombres no catalogados para revision', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['VERSION_PLANTILLA', '1']]), 'INSTRUCCIONES');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['CODIGO', 'NOMBRE', 'PASTO_PRINCIPAL', 'DIAS_DESCANSO_OBJETIVO'],
        ['P-1', 'Potrero 1', 'Brachiaria brizantha', 30],
        ['P-2', 'Potrero 2', 'Pasto local del cliente', 25]
    ]), 'POTREROS');
    const resolverPasto = async (nombre) => nombre === 'Brachiaria brizantha' ? { _id: 'catalogo-brizantha' } : null;
    const resultado = await procesarExcelPreview(
        XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }),
        { resolverPasto }
    );

    assert.equal(resultado.valido, true);
    assert.equal(resultado.registros.Potrero[0].pastoPrincipal, 'catalogo-brizantha');
    assert.equal(resultado.registros.Potrero[0].diasDescansoObjetivo, 30);
    assert.equal(resultado.registros.Potrero[1].descripcionCobertura, 'Pasto local del cliente');
    assert.ok(resultado.advertencias.some((item) => item.mensaje.includes('pendiente de revisión')));
});

test('reconoce bancos forrajeros e intervalo de corte en el importador', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['VERSION_PLANTILLA', '1']]), 'INSTRUCCIONES');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['CODIGO', 'NOMBRE', 'TIPO_AREA', 'PASTO_PRINCIPAL', 'INTERVALO_CORTE_OBJETIVO_DIAS'],
        ['BF-1', 'Banco Norte', 'BANCO_FORRAJERO', 'Cuba OM-22', 60]
    ]), 'POTREROS');
    const resultado = await procesarExcelPreview(
        XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }),
        { resolverPasto: async (nombre, categoria, uso) => ({ _id: `${nombre}-${categoria}-${uso}` }) }
    );
    assert.equal(resultado.valido, true);
    assert.equal(resultado.registros.Potrero[0].tipoArea, 'BANCO_FORRAJERO');
    assert.equal(resultado.registros.Potrero[0].intervaloCorteObjetivoDias, 60);
    assert.match(resultado.registros.Potrero[0].pastoPrincipal, /Pasto de corte-CORTE/);
});

test('asocia inventario únicamente a lotes existentes compatibles', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['VERSION_PLANTILLA', '1']]), 'INSTRUCCIONES');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['DIIO', 'ESPECIE', 'SEXO', 'CATEGORIA', 'OBJETIVO_PRODUCTIVO', 'CODIGO_LOTE', 'PROPOSITO_LOTE'],
        ['9001', 'Bovino', 'Macho', 'Novillo', 'Engorde', 'ENG-01', 'ENGORDE']
    ]), 'INVENTARIO');
    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
    const valido = await procesarExcelPreview(buffer, {
        lotesExistentes: [{ codigo: 'ENG-01', especie: 'Bovino', proposito: 'ENGORDE', estado: 'ACTIVO' }]
    });
    assert.equal(valido.valido, true);
    assert.equal(valido.registros.Animal[0].codigoLote, 'ENG-01');
    assert.equal(valido.registros.Animal[0].objetivoProductivo, 'ENGORDE');

    const invalido = await procesarExcelPreview(buffer, { lotesExistentes: [] });
    assert.equal(invalido.valido, false);
    assert.ok(invalido.errores.some((item) => item.codigo === 'REFERENCIA_NO_ENCONTRADA'));
});
