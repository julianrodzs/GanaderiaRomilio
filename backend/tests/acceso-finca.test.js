const test = require('node:test');
const assert = require('node:assert/strict');
const { membresiaPuedeAccederFinca } = require('../services/accesoFinca-service');

test('una membresía global puede cambiar a cualquier finca de su organización', () => {
    assert.equal(membresiaPuedeAccederFinca({ accesoTodasFincas: true, fincas: [] }, 'finca-2'), true);
});

test('una membresía limitada solo acepta fincas asignadas', () => {
    const membresia = { accesoTodasFincas: false, fincas: ['finca-1'] };
    assert.equal(membresiaPuedeAccederFinca(membresia, 'finca-1'), true);
    assert.equal(membresiaPuedeAccederFinca(membresia, 'finca-2'), false);
});
