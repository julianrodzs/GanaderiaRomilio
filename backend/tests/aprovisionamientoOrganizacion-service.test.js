const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizarSlug,
    validarDatosAprovisionamiento
} = require('../services/aprovisionamientoOrganizacion-service');

const datosBase = () => ({
    organizacion: { nombre: 'Finca El Roble' },
    plan: { codigo: 'ESENCIAL', especiePlan: 'Bovino' },
    finca: { nombre: 'El Roble' },
    administrador: { nombre: 'Ana', correo: 'ANA@EJEMPLO.COM' }
});

test('normaliza un nombre como slug estable', () => {
    assert.equal(normalizarSlug('  Finca El Roble, S.A.  '), 'finca-el-roble-s-a');
});

test('prepara datos completos y limita el plan Esencial a su especie', () => {
    const datos = validarDatosAprovisionamiento(datosBase());
    assert.equal(datos.organizacion.slug, 'finca-el-roble');
    assert.equal(datos.administrador.correo, 'ana@ejemplo.com');
    assert.equal(datos.plan.estado, 'Prueba');
    assert.deepEqual(datos.finca.lineasProductivas.map((linea) => linea.especie), ['Bovino']);
});

test('los planes superiores preparan ambas especies por defecto', () => {
    const entrada = datosBase();
    entrada.plan = { codigo: 'PRO', estado: 'Activo' };
    const datos = validarDatosAprovisionamiento(entrada);
    assert.deepEqual(datos.finca.lineasProductivas.map((linea) => linea.especie), ['Bovino', 'Porcino']);
    assert.equal(datos.plan.especiePlan, null);
});

test('rechaza una segunda especie en el plan Esencial', () => {
    const entrada = datosBase();
    entrada.finca.lineasProductivas = [
        { especie: 'Bovino', objetivos: ['Cría'] },
        { especie: 'Porcino', objetivos: ['Engorde'] }
    ];
    assert.throws(
        () => validarDatosAprovisionamiento(entrada),
        /solo permite configurar la especie Bovino/
    );
});
