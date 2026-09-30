const test = require('node:test');
const assert = require('node:assert/strict');
const { Tarea, TIPOS_TAREA } = require('../models/Tarea');

test('Siembra es un tipo estructurado de tarea sin persistir datos lunares', () => {
    assert.ok(TIPOS_TAREA.includes('Siembra'));
    assert.equal(Tarea.schema.path('faseLunar'), undefined);
    assert.equal(Tarea.schema.path('lunaLlena'), undefined);
    assert.equal(Tarea.schema.path('lunaNueva'), undefined);
});
