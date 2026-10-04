const test = require('node:test');
const assert = require('node:assert/strict');

const Animal = require('../models/Animal');
const CompraAnimal = require('../models/CompraAnimal');
const Costo = require('../models/Costo');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { Tarea } = require('../models/Tarea');
const VentaAnimal = require('../models/VentaAnimal');
const { CATEGORIAS_ARCHIVO } = require('../middleware/uploadOrganizacion');
const { COLUMNAS } = require('../services/importarExcel-service');

test('el conteo por dron es el único módulo que almacena imágenes', () => {
    assert.deepEqual([...CATEGORIAS_ARCHIVO], ['conteo-drone']);
});

test('los modelos operativos ya no exponen campos de comprobantes o fotografías', () => {
    assert.equal(CompraAnimal.schema.path('comprobanteUrl'), undefined);
    assert.equal(VentaAnimal.schema.path('comprobanteUrl'), undefined);
    assert.equal(MovimientoFinanciero.schema.path('comprobante'), undefined);
    assert.equal(Costo.schema.path('comprobante'), undefined);
    assert.equal(Tarea.schema.path('evidenciaUrl'), undefined);
    assert.equal(Animal.schema.path('fotoUrl'), undefined);
});

test('la plantilla financiera no vuelve a ofrecer una columna de comprobante', () => {
    assert.equal(COLUMNAS.FINANZAS.opcionales.includes('COMPROBANTE'), false);
});
