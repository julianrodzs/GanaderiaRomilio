const test = require('node:test');
const assert = require('node:assert/strict');

const Animal = require('../models/Animal');
const ArchivoMultimedia = require('../models/ArchivoMultimedia');
const { construirClave } = require('../services/almacenamientoR2-service');

test('la fotografía principal usa un archivo R2 separado del documento Animal', () => {
    assert.equal(Animal.schema.path('fotoPrincipal').options.ref, 'ArchivoMultimedia');
    assert.equal(ArchivoMultimedia.schema.path('animalId').options.ref, 'Animal');
    assert.ok(ArchivoMultimedia.schema.path('uso').enumValues.includes('FOTO_ANIMAL'));
});

test('las claves de fotografías quedan aisladas por organización, finca y uso', () => {
    const clave = construirClave({
        organizacionId: 'org-1',
        fincaId: 'finca-2',
        uso: 'FOTO_ANIMAL',
        archivo: { originalname: 'Luna 1845.JPG', mimetype: 'image/jpeg' }
    });

    assert.match(clave, /^organizaciones\/org-1\/fincas\/finca-2\/foto_animal\/luna-1845-/);
    assert.match(clave, /\.jpg$/);
});
