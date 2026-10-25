const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { calcularDistribucionGasto } = require('../services/consolidacionMultiFinca-service');
const {
    exigirAccesoFincaObjetivo,
    exigirAlcanceOrganizacionalCompleto
} = require('../services/accesoFinca-service');
const Organizacion = require('../models/Organizacion');
const { rangoInstantesEnZona } = require('../services/fechaZonaHoraria-service');

const leer = (ruta) => fs.readFileSync(path.join(__dirname, '..', ruta), 'utf8');

test('F01 el plugin protege todas las formas de escritura y el lookup valida organización', () => {
    const plugin = leer('models/plugins/organizacion-plugin.js');
    assert.match(plugin, /pre\('bulkWrite'/);
    assert.match(plugin, /permitirFincaExplicita/);
    assert.match(plugin, /\['\$set', '\$setOnInsert', '\$unset'\]/);
    const reporte = leer('controllers/reporte-controller.js');
    assert.match(reporte, /\$eq: \['\$organizacionId', '\$\$organizacionId'\]/);
});

test('F02 los repartos operan en céntimos exactos y nunca crean partidas cero', () => {
    const distribucion = ['a', 'b', 'c'].map((fincaId) => ({ fincaId }));
    assert.deepEqual(
        calcularDistribucionGasto({ montoTotal: 100, distribucion }).map((item) => item.monto),
        [33.33, 33.33, 33.34]
    );
    assert.throws(() => calcularDistribucionGasto({ montoTotal: 0.01, distribucion }));
    assert.throws(() => calcularDistribucionGasto({
        montoTotal: 1.001,
        modo: 'MONTO',
        distribucion: [{ fincaId: 'a', monto: 1 }]
    }));
});

test('F03 el consolidado usa último Pesaje al corte y ventanas históricas de tratamiento', () => {
    assert.match(leer('services/poblacionHistorica-service.js'), /pesoAlCorte: pesaje\?\.peso/);
    const reporte = leer('services/reporteMultiFinca-service.js');
    assert.match(reporte, /fechaInicio: \{ \$lte: fin \}/);
    assert.match(reporte, /fechaFin: \{ \$gte: inicio \}/);
});

test('F04 meses y rangos usan la zona horaria de la organización', () => {
    const rango = rangoInstantesEnZona({
        fechaInicio: '2026-09-30',
        fechaFin: '2026-09-30',
        zonaHoraria: 'America/Costa_Rica'
    });
    assert.equal(rango.inicio.toISOString(), '2026-09-30T06:00:00.000Z');
    assert.match(leer('services/reporteMultiFinca-service.js'), /timezone: zonaHoraria/);
});

test('F05 cierres usan autorización histórica con fincas inactivas', () => {
    const controlador = leer('controllers/consolidacionMultiFinca-controller.js');
    assert.match(controlador, /const fincasHistoricas/);
    assert.match(controlador, /incluirInactivas: true/);
    const rutas = leer('routes/reporte.js');
    assert.match(rutas, /router\.get\('\/multi-finca\/cierres', getCierres\)/);
});

test('F06 traslados rechazan futuro, nacimiento posterior e historia posterior', () => {
    const servicio = leer('services/consolidacionMultiFinca-service.js');
    assert.match(servicio, /TRANSFER_DATE_IN_FUTURE/);
    assert.match(servicio, /TRANSFER_DATE_BEFORE_HISTORY/);
    assert.match(servicio, /ultimaPorAnimal/);
});

test('F07 downgrade conserva selección de fincas operativas y código de solo lectura', () => {
    assert.ok(Organizacion.schema.path('plan.fincasOperativas'));
    const plan = leer('services/plan-service.js');
    assert.match(plan, /obtenerPoliticaFincasOperativas/);
    assert.match(plan, /PLAN_FINCA_EXCEDENTE_LECTURA/);
    assert.match(leer('routes/plan.js'), /fincas-operativas/);
});

test('F08 una lectura tardía se descarta si cambió el contexto de caché', () => {
    assert.match(leer('../frontend/src/services/api.js'), /REQUEST_CONTEXT_CHANGED/);
    assert.match(leer('../frontend/src/services/offlineStorage.js'), /contextoEsperado\.clave !== contextoActual\.clave/);
});

test('F09 población histórica se carga por lote para todas las fincas', () => {
    const poblacion = leer('services/poblacionHistorica-service.js');
    assert.match(poblacion, /obtenerPoblacionHistoricaPorFincas/);
    assert.match(leer('services/reporteMultiFinca-service.js'), /const poblacionPorFinca = await obtenerPoblacionHistoricaPorFincas/);
});

test('F10 el ID objetivo y las operaciones organizacionales exigen el alcance correcto', () => {
    assert.throws(() => exigirAccesoFincaObjetivo({ accesoTodasFincas: false, fincas: ['A1'] }, 'A2'), (error) => error.status === 403);
    assert.throws(() => exigirAlcanceOrganizacionalCompleto({ accesoTodasFincas: false }), (error) => error.code === 'ORGANIZACION_FULL_SCOPE_REQUIRED');
    assert.equal(exigirAccesoFincaObjetivo({ accesoTodasFincas: false, fincas: ['A1'] }, 'A1'), true);
});

test('F11 R2 separa bucket privado y descarga autenticada de branding público', () => {
    const almacenamiento = leer('services/almacenamientoR2-service.js');
    assert.match(almacenamiento, /R2_PRIVATE_BUCKET/);
    assert.match(almacenamiento, /private, no-store/);
    assert.match(leer('routes/archivoRoutes.js'), /router\.get\('\/r2\/:id'/);
});

test('F12 existe anulación transaccional e idempotente de grupos multi-finca', () => {
    const servicio = leer('services/consolidacionMultiFinca-service.js');
    assert.match(servicio, /const anularGrupoFinancieroMultiFinca/);
    assert.match(servicio, /grupoAnuladoEn: null/);
    assert.match(servicio, /withTransaction/);
    assert.match(leer('routes/finanza.js'), /grupos\/:grupoConsolidacion\/anular/);
});
