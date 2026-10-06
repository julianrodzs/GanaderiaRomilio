const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularProductividadPorcina } = require('../services/productividadCria-service');

test('la productividad porcina usa indicadores de camada y no un IPG bovino', () => {
    const resultado = calcularProductividadPorcina([
        { madre: 'm1', estado: 'Destetada', nacidosVivos: 10, destetados: 9, muertosPreDestete: 1 },
        { madre: 'm1', estado: 'Cerrada', nacidosVivos: 12, destetados: 10, muertosPreDestete: 2 },
        { madre: 'm2', estado: 'Activa', nacidosVivos: 8, destetados: 0, muertosPreDestete: 0 }
    ]);

    assert.equal(resultado.tipo, 'Porcino');
    assert.equal(resultado.totalCamadas, 3);
    assert.equal(resultado.camadasDestetadas, 2);
    assert.equal(resultado.promedioNacidosVivosPorCamada, 10);
    assert.equal(resultado.promedioDestetadosPorCamada, 9.5);
    assert.equal(resultado.supervivenciaPredestete, 86.36);
    assert.equal(resultado.icrp, 90.4);
    assert.equal(resultado.clasificacion, 'Cerca de la meta');
    assert.equal(Object.hasOwn(resultado, 'ipg'), false);
});

test('una camada activa no reduce artificialmente la supervivencia predestete', () => {
    const resultado = calcularProductividadPorcina([
        { madre: 'm1', estado: 'Destetada', nacidosVivos: 10, destetados: 9 },
        { madre: 'm2', estado: 'Activa', nacidosVivos: 15, destetados: 0 }
    ]);

    assert.equal(resultado.supervivenciaPredestete, 90);
    assert.equal(resultado.promedioDestetadosPorCamada, 9);
});

test('el índice de cría porcina usa solo camadas con destete cerrado', () => {
    const resultado = calcularProductividadPorcina([
        { madre: 'm1', estado: 'Destetada', nacidosVivos: 12, destetados: 11 },
        { madre: 'm2', estado: 'Activa', nacidosVivos: 20, destetados: 0 }
    ]);

    assert.equal(resultado.promedioNacidosVivosPorCamada, 16);
    assert.equal(resultado.promedioNacidosVivosCamadasCerradas, 12);
    assert.equal(resultado.icrp, 100);
    assert.equal(resultado.clasificacion, 'Meta alcanzada');
});

test('el índice de cría porcina devuelve datos insuficientes sin destetes cerrados', () => {
    const resultado = calcularProductividadPorcina([
        { madre: 'm1', estado: 'Activa', nacidosVivos: 12, destetados: 0 }
    ]);

    assert.equal(resultado.icrp, null);
    assert.equal(resultado.datosInsuficientesIndice, true);
});

test('el índice de cría porcina respeta las metas configuradas', () => {
    const resultado = calcularProductividadPorcina([
        { madre: 'm1', estado: 'Cerrada', nacidosVivos: 10, destetados: 9 }
    ], {
        configuracion: {
            porcinosCria: {
                nacidosVivosObjetivoCamada: 10,
                destetadosObjetivoCamada: 9,
                supervivenciaPredesteteObjetivoPct: 90
            }
        }
    });

    assert.equal(resultado.icrp, 100);
});
