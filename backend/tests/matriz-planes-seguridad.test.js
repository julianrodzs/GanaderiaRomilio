const test = require('node:test');
const assert = require('node:assert/strict');
const { planesConfig } = require('../config/planes');
const { requireFeature } = require('../middleware/plan');
const ReservaCuotaPlan = require('../models/ReservaCuotaPlan');
const { proyectarDetalleLotePorPlan } = require('../services/lote-service');
const { simulacionPermitida } = require('../services/iaConteoService');

const ejecutarGuard = async ({ codigo, feature, estado = 'Activo', estadoOrganizacion = 'Activa' }) => {
    const req = { organizacionId: 'organizacion-test' };
    const respuesta = { status: null, body: null, next: false };
    const res = {
        status(codigoHttp) { respuesta.status = codigoHttp; return this; },
        json(body) { respuesta.body = body; return this; }
    };
    const actual = {
        codigo,
        estado,
        vigente: estadoOrganizacion === 'Activa' && ['Activo', 'Prueba'].includes(estado),
        vigencia: { estadoOrganizacion, estadoPlan: estado, code: estadoOrganizacion === 'Activa' ? 'PLAN_SUBSCRIPTION_INACTIVE' : 'PLAN_ORGANIZATION_INACTIVE' },
        configuracion: planesConfig[codigo]
    };
    await requireFeature(feature, { obtenerPlanActual: async () => actual })(req, res, () => {
        respuesta.status = 200;
        respuesta.next = true;
    });
    return respuesta;
};

test('la matriz HTTP permite y bloquea funciones según los cuatro planes', async () => {
    const casos = [
        ['ESENCIAL', 'reportesBasicos', 200],
        ['ESENCIAL', 'analiticaProductiva', 403],
        ['GESTION', 'analiticaProductiva', 200],
        ['GESTION', 'analiticaEconomica', 403],
        ['PRO', 'analiticaEconomica', 200],
        ['PRO', 'reportesMultiFinca', 403],
        ['PREMIUM', 'reportesMultiFinca', 200]
    ];
    for (const [codigo, feature, esperado] of casos) {
        const resultado = await ejecutarGuard({ codigo, feature });
        assert.equal(resultado.status, esperado, `${codigo} / ${feature}`);
        assert.equal(resultado.next, esperado === 200);
        if (esperado === 403) assert.equal(resultado.body.code, 'PLAN_FEATURE_NOT_AVAILABLE');
    }
});

test('una suscripción suspendida o cancelada devuelve 403 para cualquier plan', async () => {
    for (const codigo of Object.keys(planesConfig)) {
        for (const estado of ['Suspendido', 'Cancelado']) {
            const resultado = await ejecutarGuard({ codigo, feature: 'reportesBasicos', estado });
            assert.equal(resultado.status, 403, `${codigo} / ${estado}`);
            assert.equal(resultado.body.code, 'PLAN_SUBSCRIPTION_INACTIVE');
        }
    }
});

test('la proyección de lotes elimina GMD y cumplimiento en Esencial', () => {
    const detalle = {
        gmdObjetivoKgDia: 0.8,
        resumen: { animales: 12, gmdPromedioLote: 0.72, cumplimientoGmd: 90, alcanzaronPesoObjetivo: 3 }
    };
    const basico = proyectarDetalleLotePorPlan(detalle, false);
    assert.equal(basico.gmdObjetivoKgDia, undefined);
    assert.deepEqual(basico.resumen, { animales: 12 });
    assert.equal(proyectarDetalleLotePorPlan(detalle, true), detalle);
});

test('las reservas de cuota son únicas por organización y recurso', () => {
    const indice = ReservaCuotaPlan.schema.indexes().find(([campos]) => campos.organizacionId === 1 && campos.recurso === 1);
    assert.ok(indice);
    assert.equal(indice[1].unique, true);
    assert.deepEqual(ReservaCuotaPlan.schema.path('recurso').enumValues, ['animales', 'usuarios', 'fincas']);
});

test('la simulación de IA nunca está disponible en producción', () => {
    const anteriorNodeEnv = process.env.NODE_ENV;
    const anteriorSimulacion = process.env.IA_ALLOW_SIMULATION;
    try {
        process.env.NODE_ENV = 'production';
        process.env.IA_ALLOW_SIMULATION = 'true';
        assert.equal(simulacionPermitida(), false);
        process.env.NODE_ENV = 'test';
        assert.equal(simulacionPermitida(), true);
        process.env.IA_ALLOW_SIMULATION = 'false';
        assert.equal(simulacionPermitida(), false);
    } finally {
        if (anteriorNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = anteriorNodeEnv;
        if (anteriorSimulacion === undefined) delete process.env.IA_ALLOW_SIMULATION; else process.env.IA_ALLOW_SIMULATION = anteriorSimulacion;
    }
});
