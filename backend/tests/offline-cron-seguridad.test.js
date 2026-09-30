const test = require('node:test');
const assert = require('node:assert/strict');
const { autorizarCron } = require('../middleware/cronAuth');
const { Tarea } = require('../models/Tarea');

const ejecutarMiddleware = (authorization) => {
    let codigo = null;
    let cuerpo = null;
    let siguiente = false;
    const req = { headers: { authorization }, get: (nombre) => req.headers[nombre.toLowerCase()] };
    const res = {
        status(valor) {
            codigo = valor;
            return this;
        },
        json(valor) {
            cuerpo = valor;
            return this;
        }
    };
    autorizarCron(req, res, () => { siguiente = true; });
    return { codigo, cuerpo, siguiente };
};

test('el cron HTTP exige un bearer secreto y acepta la credencial correcta', () => {
    const anterior = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'secreto-de-prueba-suficientemente-largo';

    assert.equal(ejecutarMiddleware('').codigo, 401);
    assert.equal(ejecutarMiddleware('Bearer incorrecto').codigo, 401);
    assert.equal(
        ejecutarMiddleware('Bearer secreto-de-prueba-suficientemente-largo').siguiente,
        true
    );

    if (anterior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = anterior;
});

test('el modelo Tarea conserva claves idempotentes y usa concurrencia optimista', () => {
    assert.ok(Tarea.schema.path('operacionesIdempotentes'));
    assert.equal(Tarea.schema.options.optimisticConcurrency, true);
});
