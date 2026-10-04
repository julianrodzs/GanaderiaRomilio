const test = require('node:test');
const assert = require('node:assert/strict');
const EventoFacturacion = require('../models/EventoFacturacion');
const Organizacion = require('../models/Organizacion');
const { estadoPlanStripe } = require('../services/facturacion-service');

test('los estados Stripe se traducen a estados comerciales restrictivos', () => {
    assert.equal(estadoPlanStripe('trialing'), 'Prueba');
    assert.equal(estadoPlanStripe('active'), 'Activo');
    assert.equal(estadoPlanStripe('past_due'), 'Suspendido');
    assert.equal(estadoPlanStripe('unpaid'), 'Suspendido');
    assert.equal(estadoPlanStripe('canceled'), 'Cancelado');
});

test('los webhooks son idempotentes por proveedor e identificador', () => {
    const indice = EventoFacturacion.schema.indexes().find(([campos]) => campos.proveedor === 1 && campos.eventoId === 1);
    assert.ok(indice);
    assert.equal(indice[1].unique, true);
});

test('la organización conserva referencias y vigencia del proveedor de pago', () => {
    for (const campo of ['plan.proveedorPago', 'plan.clientePagoId', 'plan.suscripcionPagoId', 'plan.fechaRenovacion', 'plan.fechaExpiracion']) {
        assert.ok(Organizacion.schema.path(campo), campo);
    }
});
