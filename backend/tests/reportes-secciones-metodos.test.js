const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../services/plan-service');
const modelos = [require('../models/Animal'), require('../models/Potrero'), require('../models/PlanSanitario').PlanSanitario,
    require('../models/RotacionPotrero'), require('../models/MovimientoFinanciero'), require('../models/ConteoDrone'), require('../models/RegistroReproductivo').RegistroReproductivo];
const respuesta = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(body) { this.body = body; } });
const consulta = (datos = []) => {
    const q = { then: (ok, fallo) => Promise.resolve(datos).then(ok, fallo), lean: async () => datos };
    for (const metodo of ['select', 'sort', 'limit', 'populate', 'setOptions']) q[metodo] = () => q;
    return q;
};

for (const [seccion, permitidos, campos] of [
    ['inventario', ['Animal', 'ConteoDrone'], ['inventario', 'drone']],
    ['produccion', ['Potrero', 'RotacionPotrero'], ['potreros']],
    ['sanidad', ['PlanSanitario'], ['sanidad']],
    ['finanzas', ['MovimientoFinanciero'], ['finanzas']],
    ['reproduccion', ['Animal'], ['reproduccion']]
]) {
    test(`resumen ${seccion} no consulta modelos de otras secciones`, async (t) => {
        const llamadas = [];
        t.mock.method(plan, 'tieneFeature', async () => false);
        for (const modelo of modelos) for (const metodo of ['countDocuments', 'aggregate', 'find']) {
            t.mock.method(modelo, metodo, () => { llamadas.push(modelo.modelName); return metodo === 'countDocuments' ? Promise.resolve(2) : consulta(); });
        }
        const id = require.resolve('../controllers/reporte-controller'); delete require.cache[id]; t.after(() => { delete require.cache[id]; });
        const res = respuesta();
        await require(id).getResumenReportes({ query: { seccion, fechaInicio: '2026-01-01', fechaFin: '2026-12-31' } }, res);
        assert.equal(res.statusCode, 200, JSON.stringify(res.body));
        assert.deepEqual(Object.keys(res.body).sort(), ['filtros', ...campos].sort());
        assert.ok(llamadas.every((m) => permitidos.includes(m)), JSON.stringify(llamadas));
        assert.ok(llamadas.length > 0);
    });
}

test('el resumen sin seccion conserva el contrato anterior y rechaza secciones desconocidas', async (t) => {
    t.mock.method(plan, 'tieneFeature', async () => false);
    for (const modelo of modelos) for (const metodo of ['countDocuments', 'aggregate', 'find']) {
        t.mock.method(modelo, metodo, () => metodo === 'countDocuments' ? Promise.resolve(0) : consulta());
    }
    const id = require.resolve('../controllers/reporte-controller'); delete require.cache[id]; t.after(() => { delete require.cache[id]; });
    const controller = require(id), res = respuesta();
    await controller.getResumenReportes({ query: {} }, res);
    assert.deepEqual(Object.keys(res.body).sort(), ['filtros', 'inventario', 'potreros', 'sanidad', 'finanzas', 'drone', 'reproduccion'].sort());
    const invalida = respuesta(); await controller.getResumenReportes({ query: { seccion: 'otra' } }, invalida);
    assert.equal(invalida.statusCode, 400);
});

test('partos declarados sin servicios no inventan servicios ni tasas de preñez', async (t) => {
    const Registro = modelos.at(-1);
    const datos = [
        { _id: 'c1', animal: 'a', fincaId: 'f', especie: 'Bovino', tipoRegistro: 'Monta', fechaPartoReal: '2026-04-17', estadoAtribucion: 'SIN_SERVICIO' },
        { _id: 'c2', animal: 'b', fincaId: 'f', especie: 'Bovino', tipoRegistro: 'Inseminación', fechaPartoReal: '2026-08-21', estadoAtribucion: 'SIN_SERVICIO' }
    ];
    t.mock.method(Registro, 'find', () => consulta(datos));
    const res = respuesta();
    await require('../controllers/metodoReproductivo-controller').indicadores({ query: { especie: 'Bovino', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' } }, res);
    assert.equal(res.statusCode, 200);
    for (const metodo of ['MONTA_NATURAL', 'IA_CONVENCIONAL']) {
        const fila = res.body.porMetodo.find((r) => r.metodo === metodo);
        assert.equal(fila.partos, 1); assert.equal(fila.partosSinServicio, 1);
        assert.equal(fila.servicios, 0); assert.equal(fila.prenecesAtribuidas, 0); assert.equal(fila.tasaPrenez, null);
    }
});

test('un parto actual no desplaza el servicio anterior a la cohorte actual', async (t) => {
    const Registro = modelos.at(-1);
    t.mock.method(Registro, 'find', () => consulta([{ _id: 'c', animal: 'a', fincaId: 'f', metodo: 'IA_CONVENCIONAL',
        fechaPartoReal: '2026-08-01', estadoAtribucion: 'CONFIRMADA', servicioAtribuidoId: 's',
        servicios: [{ _id: 's', metodo: 'IA_CONVENCIONAL', fechaServicio: '2025-10-25' }] }]));
    const res = respuesta();
    await require('../controllers/metodoReproductivo-controller').indicadores({ query: { fechaInicio: '2026-01-01', fechaFin: '2026-12-31', metodo: 'IA_CONVENCIONAL' } }, res);
    assert.equal(res.body.porMetodo.length, 1);
    assert.equal(res.body.porMetodo[0].partos, 1); assert.equal(res.body.porMetodo[0].servicios, 0); assert.equal(res.body.porMetodo[0].partosSinServicio, 0);
});

test('porcinos conserva monta e IA convencional, filtra metodo y excluye IATF y TE', async (t) => {
    const Registro = modelos.at(-1);
    t.mock.method(Registro, 'find', (filtro) => {
        assert.equal(filtro.especie, 'Porcino');
        return consulta([{ _id: 'c', animal: 'p', especie: 'Porcino', metodo: 'IA_CONVENCIONAL', fechaPartoReal: '2026-11-01',
            estadoAtribucion: 'CONFIRMADA', servicioAtribuidoId: 's', servicios: [{ _id: 's', metodo: 'IA_CONVENCIONAL', fechaServicio: '2026-07-10' }] }]);
    });
    const controller = require('../controllers/metodoReproductivo-controller');
    const res = respuesta(); await controller.indicadores({ query: { especie: 'Porcino', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' } }, res);
    assert.deepEqual(res.body.porMetodo.map((r) => r.metodo), ['MONTA_NATURAL', 'IA_CONVENCIONAL', 'DESCONOCIDO']);
    const ia = res.body.porMetodo.find((r) => r.metodo === 'IA_CONVENCIONAL');
    assert.equal(ia.servicios, 1); assert.equal(ia.prenecesAtribuidas, 1); assert.equal(ia.tasaPrenez, 100);
    const filtrado = respuesta(); await controller.indicadores({ query: { especie: 'Porcino', metodo: 'MONTA_NATURAL' } }, filtrado);
    assert.deepEqual(filtrado.body.porMetodo.map((r) => r.metodo), ['MONTA_NATURAL']);
    const invalido = respuesta(); await controller.indicadores({ query: { metodo: '$set' } }, invalido);
    assert.equal(invalido.statusCode, 400);
});
