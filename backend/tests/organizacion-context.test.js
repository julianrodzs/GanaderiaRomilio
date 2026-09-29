const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ejecutarConOrganizacion,
    obtenerFincaActual,
    obtenerOrganizacionActual
} = require('../context/organizacion-context');

test('conserva la organizacion durante operaciones asincronas', async () => {
    const organizacion = '64b000000000000000000001';
    const resultado = await ejecutarConOrganizacion(organizacion, async () => {
        await Promise.resolve();
        return obtenerOrganizacionActual();
    });

    assert.equal(resultado, organizacion);
    assert.equal(obtenerOrganizacionActual(), null);
});

test('conserva la finca principal dentro del contexto de organización', async () => {
    const resultado = await ejecutarConOrganizacion(
        '64b000000000000000000001',
        async () => ({ organizacion: obtenerOrganizacionActual(), finca: obtenerFincaActual() }),
        '64c000000000000000000001'
    );
    assert.deepEqual(resultado, {
        organizacion: '64b000000000000000000001',
        finca: '64c000000000000000000001'
    });
});

test('separa contextos concurrentes', async () => {
    const resultados = await Promise.all([
        ejecutarConOrganizacion('64b000000000000000000001', async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return obtenerOrganizacionActual();
        }),
        ejecutarConOrganizacion('64b000000000000000000002', async () => obtenerOrganizacionActual())
    ]);

    assert.deepEqual(resultados, [
        '64b000000000000000000001',
        '64b000000000000000000002'
    ]);
});
