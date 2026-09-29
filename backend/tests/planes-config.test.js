const test = require('node:test');
const assert = require('node:assert/strict');
const { PLAN_MINIMO_POR_FEATURE, planesConfig } = require('../config/planes');

test('define los cuatro planes comerciales con precios y limites esperados', () => {
    assert.deepEqual(Object.keys(planesConfig), ['ESENCIAL', 'GESTION', 'PRO', 'PREMIUM']);
    assert.equal(planesConfig.ESENCIAL.precioMensualUSD, 6);
    assert.equal(planesConfig.GESTION.limites.animalesActivosTotal, 2000);
    assert.equal(planesConfig.PRO.limites.conteosDroneMensuales, 150);
    assert.equal(planesConfig.PREMIUM.limites.modoConteoDrone, 'USO_INTENSIVO');
    assert.equal(planesConfig.PREMIUM.limites.conteosDroneMensuales, null);
});

test('mantiene la progresion de funcionalidades comerciales', () => {
    assert.equal(planesConfig.ESENCIAL.funcionalidades.centroAlertas, true);
    assert.equal(planesConfig.ESENCIAL.funcionalidades.analiticaProductiva, false);
    assert.equal(planesConfig.GESTION.funcionalidades.analiticaProductiva, true);
    assert.equal(planesConfig.GESTION.funcionalidades.analiticaEconomica, false);
    assert.equal(planesConfig.PRO.funcionalidades.analiticaEconomica, true);
    assert.equal(planesConfig.PREMIUM.funcionalidades.configuracionEmailAvanzada, true);
    assert.equal(PLAN_MINIMO_POR_FEATURE.analiticaProductiva, 'GESTION');
    assert.equal(PLAN_MINIMO_POR_FEATURE.analiticaEconomica, 'PRO');
});

test('el plan esencial reserva una sola especie y limites separados', () => {
    assert.equal(planesConfig.ESENCIAL.especies.modo, 'UNA_ESPECIE');
    assert.equal(planesConfig.ESENCIAL.limites.bovinosSiSeleccionados, 210);
    assert.equal(planesConfig.ESENCIAL.limites.porcinosSiSeleccionados, 500);
    assert.equal(planesConfig.ESENCIAL.limites.conteosDroneMensualesBovino, 15);
});
