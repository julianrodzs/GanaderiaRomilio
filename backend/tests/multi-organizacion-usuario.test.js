const test = require('node:test');
const assert = require('node:assert/strict');
const { Membresia } = require('../models/Membresia');
const { generarToken, verificarToken } = require('../middleware/auth');

test('una identidad puede tener una membresía independiente en cada organización', () => {
    const indice = Membresia.schema.indexes().find(([campos]) => campos.organizacionId === 1 && campos.usuario === 1);
    assert.ok(indice);
    assert.equal(indice[1].unique, true);
});

test('el JWT renovado fija organización y rol de la membresía seleccionada', () => {
    const secretoAnterior = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'secreto-de-prueba-suficientemente-largo';
    try {
        const token = generarToken({ id: 'usuario-1', organizacionId: 'organizacion-b', rol: 'Contador' });
        const datos = verificarToken(token);
        assert.equal(datos.organizacionId, 'organizacion-b');
        assert.equal(datos.rol, 'Contador');
    } finally {
        if (secretoAnterior === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = secretoAnterior;
    }
});
