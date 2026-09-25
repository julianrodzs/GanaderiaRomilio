const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calcularDiasRotacion,
    calcularRendimientoPotrero,
    resolverPeriodo
} = require('../services/potreroRendimiento-service');

const periodoSeptiembre = resolverPeriodo({ fechaInicio: '2026-09-01', fechaFin: '2026-09-30' });

test('recorta rotaciones que cruzan meses y omite las planificadas', () => {
    assert.equal(calcularDiasRotacion({
        estado: 'Finalizada',
        fechaEntrada: '2026-08-29',
        fechaSalida: '2026-09-03'
    }, periodoSeptiembre), 2);
    assert.equal(calcularDiasRotacion({
        estado: 'Planificada',
        fechaEntrada: '2026-09-05',
        fechaSalida: '2026-09-08'
    }, periodoSeptiembre), 0);
});

test('una rotacion real de entrada y salida el mismo dia cuenta un dia', () => {
    assert.equal(calcularDiasRotacion({
        estado: 'Finalizada',
        fechaEntrada: '2026-09-10',
        fechaSalida: '2026-09-10'
    }, periodoSeptiembre), 1);
});

test('calcula rendimiento, carga por hectarea y descansos sin guardar derivados', () => {
    const resultado = calcularRendimientoPotrero(
        { _id: 'potrero-1', codigo: 'P-1', nombre: 'Potrero 1', area: 2.5, estado: 'Descanso' },
        [
            { _id: 'r1', estado: 'Finalizada', fechaEntrada: '2026-08-29', fechaSalida: '2026-09-03', numeroAnimales: 10 },
            { _id: 'r2', estado: 'Finalizada', fechaEntrada: '2026-09-10', fechaSalida: '2026-09-10', numeroAnimales: 5 },
            { _id: 'r3', estado: 'Planificada', fechaEntrada: '2026-09-20', fechaSalida: '2026-09-22', numeroAnimales: 100 }
        ],
        periodoSeptiembre,
        { hoy: '2026-09-24' }
    );

    assert.equal(resultado.rendimiento.diasOcupados, 3);
    assert.equal(resultado.rendimiento.numeroRotaciones, 2);
    assert.equal(resultado.rendimiento.animalDias, 25);
    assert.equal(resultado.rendimiento.animalDiasPorHectarea, 10);
    assert.equal(resultado.rendimiento.descansoPromedio, 7);
    assert.equal(resultado.usoProyectado.numeroRotaciones, 1);
});

test('una rotacion activa usa solo el tiempo transcurrido hasta hoy', () => {
    const resultado = calcularRendimientoPotrero(
        { _id: 'potrero-2', codigo: 'P-2', nombre: 'Potrero 2', area: null, estado: 'Ocupado' },
        [{ _id: 'r1', estado: 'Activa', fechaEntrada: '2026-09-23', numeroAnimales: 20 }],
        periodoSeptiembre,
        { hoy: '2026-09-24' }
    );

    assert.equal(resultado.rendimiento.diasOcupados, 1);
    assert.equal(resultado.rendimiento.animalDias, 20);
    assert.equal(resultado.rendimiento.animalDiasPorHectarea, null);
    assert.equal(resultado.rendimiento.descansoActual, null);
});
