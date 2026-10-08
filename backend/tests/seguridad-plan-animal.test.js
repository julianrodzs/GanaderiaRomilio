const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizarAnimal } = require('../services/animal-dto');
const { evaluarVigenciaPlan } = require('../services/plan-service');

test('el DTO de animal rechaza operadores MongoDB y rutas con punto', () => {
    assert.throws(() => sanitizarAnimal({ $set: { estado: 'Activo' } }), /no está permitida/);
    assert.throws(() => sanitizarAnimal({ 'estado.valor': 'Activo' }), /no está permitida/);
    assert.throws(() => sanitizarAnimal({ observaciones: { $where: 'x' } }), /no está permitida/);
});

test('el DTO bloquea cambios de tenant y conserva solo campos de negocio', () => {
    assert.throws(() => sanitizarAnimal({ nombre: 'Luna', fincaId: 'otra' }), /Trasladar animales/);
    assert.deepEqual(sanitizarAnimal({ diio: '1880001817986' }), { diio: '1880001817986' });
    assert.deepEqual(sanitizarAnimal({ nombre: 'Luna', __v: 2, createdAt: 'ayer' }), { nombre: 'Luna' });
    assert.deepEqual(sanitizarAnimal({ fotoPrincipal: 'archivo-inyectado' }), {});
});

test('solo Activo y Prueba son estados de suscripción vigentes', () => {
    assert.equal(evaluarVigenciaPlan({ estadoOrganizacion: 'Activa', estadoPlan: 'Activo' }).vigente, true);
    assert.equal(evaluarVigenciaPlan({ estadoOrganizacion: 'Activa', estadoPlan: 'Prueba' }).vigente, true);
    assert.equal(evaluarVigenciaPlan({ estadoOrganizacion: 'Activa', estadoPlan: 'Suspendido' }).vigente, false);
    assert.equal(evaluarVigenciaPlan({ estadoOrganizacion: 'Activa', estadoPlan: 'Cancelado' }).vigente, false);
    assert.equal(evaluarVigenciaPlan({ estadoOrganizacion: 'Suspendida', estadoPlan: 'Activo' }).vigente, false);
});
