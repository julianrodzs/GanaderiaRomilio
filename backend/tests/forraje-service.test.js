const test = require('node:test');
const assert = require('node:assert/strict');
const CorteForraje = require('../models/CorteForraje');
const { CATALOGO_PASTOS_BASE } = require('../config/catalogoPastos');
const { convertirAKg, sumarDias } = require('../services/forraje-service');

test('el catálogo único incluye materiales de corte con usos productivos', () => {
    const claves = ['cuba-om-22', 'cuba-ct-115', 'king-grass', 'maralfalfa', 'maiz-forrajero'];
    claves.forEach((clave) => {
        const material = CATALOGO_PASTOS_BASE.find((item) => item.clave === clave);
        assert.ok(material, `Falta ${clave}`);
        assert.equal(material.categoria, 'Pasto de corte');
        assert.ok(material.usosPermitidos.includes('CORTE'));
    });
});

test('normaliza toneladas a kg sin alterar cantidades expresadas en kg', () => {
    assert.equal(convertirAKg(4.25, 'TON'), 4250);
    assert.equal(convertirAKg(4250, 'KG'), 4250);
    assert.throws(() => convertirAKg(-1, 'KG'));
});

test('calcula el próximo corte desde la fecha real registrada', () => {
    assert.equal(sumarDias('2026-08-22', 60).toISOString().slice(0, 10), '2026-10-21');
});

test('CorteForraje conserva cantidades normalizadas, destino e índices operativos', () => {
    assert.ok(CorteForraje.schema.path('cantidadForrajeVerdeKg'));
    assert.ok(CorteForraje.schema.path('cantidadMateriaSecaKg'));
    assert.ok(CorteForraje.schema.path('areaCortadaHa'));
    assert.ok(CorteForraje.schema.path('destino.tipo').enumValues.includes('ENGORDE_BOVINO'));
    const indices = CorteForraje.schema.indexes().map(([campos]) => Object.keys(campos).join(','));
    assert.ok(indices.some((item) => item.includes('potrero') && item.includes('fechaCorte')));
    assert.ok(indices.some((item) => item.includes('forraje') && item.includes('fechaCorte')));
});
