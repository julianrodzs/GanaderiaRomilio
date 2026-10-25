const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const EventoAnimal = require('../models/EventoAnimal');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { validarConfiguracionArranque, secretoFuerte } = require('../config/env');
const { validarPrecioStripe } = require('../services/facturacion-service');
const { planesConfig } = require('../config/planes');

const entornoValido = {
    NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/prueba',
    JWT_SECRET: 'Jwt-Test-0123456789-abcdefghijklmnop',
    CRON_SECRET: 'Cron-Test-0123456789-abcdefghijklmnop',
    FRONTEND_URL: 'https://app.example.test'
};

test('CL-04 produccion rechaza variables ausentes, secretos repetidos y frontend HTTP', () => {
    assert.doesNotThrow(() => validarConfiguracionArranque(entornoValido));
    for (const campo of ['MONGODB_URI', 'JWT_SECRET', 'CRON_SECRET', 'FRONTEND_URL']) {
        assert.throws(() => validarConfiguracionArranque({ ...entornoValido, [campo]: '' }), new RegExp(campo));
    }
    assert.equal(secretoFuerte('a'.repeat(64)), false);
    assert.throws(() => validarConfiguracionArranque({ ...entornoValido, JWT_SECRET: 'a'.repeat(32) }), /JWT_SECRET/);
    assert.throws(() => validarConfiguracionArranque({ ...entornoValido, FRONTEND_URL: 'http://app.test' }), /FRONTEND_URL/);
    assert.throws(() => validarConfiguracionArranque({ ...entornoValido, MONGODB_URI: 'mongodb://' }), /MONGODB_URI/);
});

test('CL-01 claves vacias, nulas y ausentes se omiten antes de persistir un evento', async () => {
    await ejecutarConOrganizacion(new mongoose.Types.ObjectId(), async () => {
        for (const claveIdempotencia of [undefined, null, '', '   ']) {
            const evento = new EventoAnimal({
                animal: new mongoose.Types.ObjectId(), fecha: new Date(),
                tipoEvento: 'Observacion', titulo: 'Prueba', claveIdempotencia
            });
            await evento.validate();
            assert.equal(evento.toObject().claveIdempotencia, undefined);
        }
        const indice = EventoAnimal.schema.indexes().find(([key]) => key.claveIdempotencia);
        assert.equal(indice[1].unique, true);
        assert.equal(indice[1].sparse, undefined);
        assert.deepEqual(indice[1].partialFilterExpression, { claveIdempotencia: { $type: 'string' } });
    }, new mongoose.Types.ObjectId());
});

test('CL-08 los cuatro precios Stripe coinciden en monto, moneda y recurrencia mensual', async () => {
    for (const [codigo, plan] of Object.entries(planesConfig)) {
        const valido = {
            active: true, type: 'recurring', currency: 'usd',
            recurring: { interval: 'month', interval_count: 1 },
            unit_amount: Math.round(plan.precioMensualUSD * 100)
        };
        const stripe = (cambio = {}) => ({ prices: { retrieve: async () => ({ ...valido, ...cambio }) } });
        await validarPrecioStripe(stripe(), codigo, 'price_fixture');
        for (const cambio of [
            { active: false }, { currency: 'crc' }, { type: 'one_time' },
            { recurring: { interval: 'year', interval_count: 1 } },
            { recurring: { interval: 'month', interval_count: 2 } },
            { unit_amount: valido.unit_amount + 1 }
        ]) {
            await assert.rejects(() => validarPrecioStripe(stripe(cambio), codigo, 'price_fixture'),
                error => error.code === 'BILLING_PRICE_MISMATCH' && error.status === 503);
        }
    }
});
