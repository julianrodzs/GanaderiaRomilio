const test = require('node:test');
const assert = require('node:assert/strict');
const { kgHaCorte, resumirRendimientoForrajes } = require('../services/forrajeRendimiento-service');

const banco = { _id: 'b1', nombre: 'Banco Norte', area: 1, intervaloCorteObjetivoDias: 60 };
const forraje = { _id: 'f1', nombre: 'Cuba OM-22' };
const corte = (fecha, kg, area, materiaSecaKg = null) => ({
    fechaCorte: fecha,
    potrero: banco,
    forraje,
    forrajeNombre: 'Cuba OM-22',
    cantidadForrajeVerdeKg: kg,
    cantidadMateriaSecaKg: materiaSecaKg,
    areaCortadaHa: area,
    destino: { tipo: 'ENGORDE_BOVINO' }
});

test('usa el área realmente cortada para kg/ha/corte', () => {
    assert.equal(kgHaCorte(corte('2026-01-01', 2100, 0.4)), 5250);
    assert.equal(kgHaCorte(corte('2026-01-01', 2100, null)), null);
});

test('un solo corte no inventa intervalos ni materia seca', () => {
    const resultado = resumirRendimientoForrajes([corte('2026-01-01', 4000, 1)]);
    assert.equal(resultado.resumen.totalCortes, 1);
    assert.equal(resultado.resumen.promedioKgHaCorte, 4000);
    assert.equal(resultado.resumen.diasPromedioEntreCortes, null);
    assert.equal(resultado.resumen.materiaSecaTotalKg, null);
});

test('diferencia producción acumulada por ha de promedio kg/ha/corte', () => {
    const resultado = resumirRendimientoForrajes([
        corte('2026-01-01', 4000, 1, 800),
        corte('2026-03-02', 4500, 1, 900),
        corte('2026-05-01', 4200, 1, 840)
    ]);
    assert.equal(resultado.resumen.forrajeVerdeTotalKg, 12700);
    assert.equal(resultado.resumen.produccionForrajeVerdeKgHa, 12700);
    assert.equal(resultado.resumen.promedioKgHaCorte, 4233.33);
    assert.equal(resultado.resumen.diasPromedioEntreCortes, 60);
    assert.equal(resultado.produccionPorForraje[0].diferenciaIntervaloDias, 0);
});

test('sin cortes devuelve nulos cuando cero sería engañoso', () => {
    const resultado = resumirRendimientoForrajes([]);
    assert.equal(resultado.resumen.totalCortes, 0);
    assert.equal(resultado.resumen.promedioKgHaCorte, null);
    assert.equal(resultado.resumen.diasPromedioEntreCortes, null);
    assert.equal(resultado.resumen.materiaSecaTotalKg, null);
});
