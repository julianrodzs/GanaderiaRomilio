const test = require('node:test');
const assert = require('node:assert/strict');

const Animal = require('../models/Animal');
const ArchivoMultimedia = require('../models/ArchivoMultimedia');
const CompraAnimal = require('../models/CompraAnimal');
const Costo = require('../models/Costo');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { Tarea } = require('../models/Tarea');
const VentaAnimal = require('../models/VentaAnimal');
const { CATEGORIAS_ARCHIVO } = require('../middleware/uploadOrganizacion');
const { COLUMNAS } = require('../services/importarExcel-service');

test('dron conserva el almacenamiento operativo local y multimedia visual queda aislada en R2', () => {
    assert.deepEqual([...CATEGORIAS_ARCHIVO], ['conteo-drone']);
    assert.deepEqual(ArchivoMultimedia.schema.path('uso').enumValues, [
        'LOGO_ORGANIZACION',
        'DASHBOARD_FINCA',
        'POTREROS_FINCA',
        'FOTO_ANIMAL'
    ]);
    assert.deepEqual(ArchivoMultimedia.schema.path('proveedor').enumValues, ['R2']);
});

test('los modelos operativos ya no exponen campos de comprobantes o fotografías', () => {
    assert.equal(CompraAnimal.schema.path('comprobanteUrl'), undefined);
    assert.equal(VentaAnimal.schema.path('comprobanteUrl'), undefined);
    assert.equal(MovimientoFinanciero.schema.path('comprobante'), undefined);
    assert.equal(Costo.schema.path('comprobante'), undefined);
    assert.equal(Tarea.schema.path('evidenciaUrl'), undefined);
    assert.equal(Animal.schema.path('fotoUrl'), undefined);
    assert.equal(Animal.schema.path('fotoPrincipal').options.ref, 'ArchivoMultimedia');
});

test('la plantilla financiera no vuelve a ofrecer una columna de comprobante', () => {
    assert.equal(COLUMNAS.FINANZAS.opcionales.includes('COMPROBANTE'), false);
});
