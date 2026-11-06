// Replica set desechable en loopback. No lee .env ni usa Atlas/Resend reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const Organizacion = require('../models/Organizacion');
const Pago = require('../models/PagoSuscripcion');
const Usuario = require('../models/Usuario');
const Finca = require('../models/Finca');
const Auditoria = require('../models/Auditoria');
const { Membresia } = require('../models/Membresia');
const { registrarPago, cambiarSuscripcion, anularPago, listarPagos } = require('../services/suscripcionManual-service');
const { resolverSuscripcion, sumarMeses } = require('../services/suscripcion-estado-service');
const { procesarSuscripcionesManuales } = require('../services/suscripcionesProgramadas-service');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { generarToken } = require('../middleware/auth');
const { aprovisionarOrganizacion } = require('../services/aprovisionamientoOrganizacion-service');
const { obtenerPlanActual } = require('../services/plan-service');
const id = () => new mongoose.Types.ObjectId(), admin = id(), productor = id();
const ahora = new Date('2026-11-05T12:00:00Z'), DIA = 86400000;
let mongod, cliente, server, base, org, finca;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const puerto = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const pago = (datos = {}) => ({ metodoPago: 'SINPE_MOVIL', moneda: 'CRC', monto: 12000, referenciaComprobante: id().toString(), mesesCubiertos: 1, claveIdempotencia: id().toString(), ...datos });
const renovar = (datos, fecha = ahora) => registrarPago(org._id, datos, admin, fecha);

test.before(async () => {
    process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'Prueba-suscripcion-local-0123456789';
    process.env.FRONTEND_URL = 'https://app.example.test'; process.env.RESEND_API_KEY = 'simulado-no-real';
    process.env.CRON_MODE = 'external'; process.env.EMAIL_ADMIN = 'operador@example.test';
    const port = await puerto(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-suscripciones-'));
    mongod = spawn(process.env.CIERRE_MONGOD || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' : 'mongod'),
        ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', 'suscripcionesTest', '--logpath', path.join(dir, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: 'ignore' });
    let arranque; mongod.on('error', (e) => { arranque = e; });
    cliente = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 300 });
    for (let n = 0; n < 60; n++) { if (arranque) throw arranque; try { await cliente.connect(); break; } catch (e) { if (n === 59) throw e; await esperar(100); } }
    await cliente.db('admin').command({ replSetInitiate: { _id: 'suscripcionesTest', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let n = 0; n < 100; n++) { if ((await cliente.db('admin').command({ hello: 1 })).isWritablePrimary) break; if (n === 99) throw Error('Sin primario'); await esperar(100); }
    await mongoose.connect(`mongodb://127.0.0.1:${port}/suscripciones?replicaSet=suscripcionesTest`);
    for (const m of Object.values(mongoose.models)) await m.init();
    const app = require('../app');
    for (const m of Object.values(mongoose.models)) await m.init();
    server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    await esperar(200); await mongoose.disconnect(); await cliente?.close();
    if (mongod && mongod.exitCode === null) { const fin = new Promise((r) => mongod.once('exit', r)); mongod.kill(); await fin; }
});
test.beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.collection.deleteMany({});
    org = await Organizacion.create({ nombre: 'Cliente manual', slug: 'cliente-manual', estado: 'Activa', plan: { codigo: 'PREMIUM', estado: 'Activo' },
        fechaInicioPeriodoActual: new Date('2026-10-10T12:00:00Z'), fechaProximoVencimiento: new Date('2026-11-10T12:00:00Z'), estadoSuscripcion: 'ACTIVA' });
    finca = id();
    await Finca.collection.insertOne({ _id: finca, organizacionId: org._id, nombre: 'Principal', codigo: 'P', estado: 'Activa', lineasProductivas: [{ especie: 'Bovino', objetivos: ['ENGORDE'], activa: true }] });
    await Organizacion.updateOne({ _id: org._id }, { $set: { fincaPrincipal: finca } });
    await Usuario.collection.insertMany([{ _id: admin, nombre: 'Operador', correo: 'operador@example.test', estado: 'Activo', esSuperAdministrador: true },
        { _id: productor, nombre: 'Ganadero', correo: 'ganadero@example.test', estado: 'Activo', rol: 'Administrador' }]);
    await Membresia.create({ organizacionId: org._id, usuario: productor, estado: 'Activo', rol: 'Administrador', accesoTodasFincas: true, fincas: [finca] });
});

test('renovacion anticipada conserva cinco dias; enero 31 suma febrero sin desbordarlo', async () => {
    const r = await renovar(pago());
    assert.equal(r.pago.periodoCubiertoInicio.toISOString(), '2026-11-10T12:00:00.000Z');
    assert.equal(r.organizacion.fechaProximoVencimiento.toISOString(), '2026-12-10T12:00:00.000Z');
    assert.equal(sumarMeses(new Date('2027-01-31T12:00:00Z'), 1).toISOString(), '2027-02-28T12:00:00.000Z');
    assert.equal(sumarMeses(new Date('2027-03-01T05:59:59.999Z'), 1).toISOString(), '2027-03-29T05:59:59.999Z');
    assert.equal(await Auditoria.collection.countDocuments({ evento: 'Pago de suscripción registrado' }), 1);
});

test('renovar vencida y prueba inicia desde hoy, no cobra dias perdidos ni suma prueba gratuita', async () => {
    for (const estado of ['Activo', 'Prueba']) {
        await Organizacion.updateOne({ _id: org._id }, { $set: { 'plan.estado': estado, fechaProximoVencimiento: new Date(estado === 'Prueba' ? +ahora + 10 * DIA : +ahora - 10 * DIA), estadoSuscripcion: estado === 'Prueba' ? 'PRUEBA' : 'VENCIDA' } });
        const r = await renovar(pago());
        assert.equal(+r.pago.periodoCubiertoInicio, +ahora);
        assert.equal(r.organizacion.fechaProximoVencimiento.toISOString(), '2026-12-05T12:00:00.000Z');
        assert.equal(r.organizacion.estadoSuscripcion, 'ACTIVA');
    }
});

test('anular restaura snapshot exacto y conserva registro; otras organizaciones no ven ese pago', async () => {
    const r = await renovar(pago());
    const x = await anularPago(org._id, r.pago._id, { motivo: 'Error de digitación' }, admin);
    assert.equal(x.organizacion.fechaProximoVencimiento.toISOString(), '2026-11-10T12:00:00.000Z');
    assert.equal((await Pago.collection.findOne({ _id: r.pago._id })).estado, 'ANULADO');
    assert.equal((await anularPago(org._id, r.pago._id, { motivo: 'Reintento' }, admin)).duplicado, true);
    assert.equal((await listarPagos(id())).pagos.length, 0);
    await assert.rejects(anularPago(id(), r.pago._id, { motivo: 'Cruce de organización' }, admin), { status: 404 });
    await assert.rejects(ejecutarConOrganizacion(org._id, () => Pago.deleteOne({ _id: r.pago._id })), /edición ni eliminación/);
});

test('anulacion de pagos encadenados exige orden inverso sin quitar meses pagados posteriores', async () => {
    const a = await renovar(pago()), b = await renovar(pago());
    await assert.rejects(anularPago(org._id, a.pago._id, { motivo: 'Error' }, admin), { code: 'SUBSCRIPTION_PAYMENT_HAS_SUCCESSORS' });
    await anularPago(org._id, b.pago._id, { motivo: 'Error' }, admin);
    await anularPago(org._id, a.pago._id, { motivo: 'Error' }, admin);
    assert.equal((await Organizacion.findById(org._id)).fechaProximoVencimiento.toISOString(), '2026-11-10T12:00:00.000Z');
});

test('downgrade devuelve 409 con fincas y especies; no modifica plan ni historial', async () => {
    await Finca.collection.insertOne({ organizacionId: org._id, nombre: 'Porcina', codigo: 'C', estado: 'Activa', lineasProductivas: [{ especie: 'Porcino', activa: true }] });
    await assert.rejects(cambiarSuscripcion(org._id, { plan: 'ESENCIAL', especiePlan: 'Bovino' }, admin, ahora), (e) => {
        assert.equal(e.status, 409); assert.ok(e.detalles.some((d) => d.recurso === 'fincas')); assert.ok(e.detalles.some((d) => d.recurso === 'especies')); return true;
    });
    assert.equal((await Organizacion.findById(org._id)).plan.codigo, 'PREMIUM');
    assert.equal(await Pago.collection.countDocuments({}), 0);
});

test('concurrencia y reintentos no duplican un pago; una clave no acepta otro periodo o monto', async () => {
    const datos = pago();
    await Promise.all([renovar(datos), renovar(datos)]);
    assert.equal(await Pago.collection.countDocuments({}), 1);
    assert.equal((await Organizacion.findById(org._id)).fechaProximoVencimiento.toISOString(), '2026-12-10T12:00:00.000Z');
    await assert.rejects(renovar({ ...datos, monto: 15000 }), { status: 409 });
    await assert.rejects(renovar({ ...datos, fechaFinPersonalizada: '2027-01-01' }), { status: 409 });
    await assert.rejects(renovar({ ...datos, claveIdempotencia: id().toString() }), { code: 11000 });
});

test('downgrade valida usuarios activos, invitaciones y animales incluidos los lechones colectivos', async () => {
    await Membresia.collection.insertMany(Array.from({ length: 3 }, () => ({ organizacionId: org._id, usuario: id(), estado: 'Activo', rol: 'Trabajador' })));
    await require('../models/Invitacion').collection.insertOne({ organizacionId: org._id, estado: 'Pendiente', expiraEn: new Date(Date.now() + DIA) });
    const Animal = require('../models/Animal');
    await Animal.collection.insertMany(Array.from({ length: 211 }, () => ({ organizacionId: org._id, fincaId: finca, estado: 'Activo', especie: 'Bovino', identificadorFinca: id().toString() })));
    await assert.rejects(cambiarSuscripcion(org._id, { plan: 'ESENCIAL', especiePlan: 'Bovino' }, admin, ahora), (e) => {
        assert.equal(e.status, 409); assert.ok(e.detalles.some((d) => d.recurso === 'usuarios' && d.actual === 5));
        assert.ok(e.detalles.some((d) => d.recurso === 'animales' && d.actual === 211)); return true;
    });
    await Animal.collection.deleteMany({});
    await Finca.collection.updateOne({ _id: finca }, { $set: { lineasProductivas: [{ especie: 'Porcino', activa: true }] } });
    await require('../models/Camada').collection.insertOne({ organizacionId: org._id, fincaId: finca, nacidosVivos: 501, muertosPreDestete: 0, estado: 'Activa' });
    await assert.rejects(cambiarSuscripcion(org._id, { plan: 'ESENCIAL', especiePlan: 'Porcino' }, admin, ahora), (e) => {
        assert.ok(e.detalles.some((d) => d.recurso === 'animales' && d.actual === 501)); return true;
    });
});

test('fallo de auditoria revierte pago y organizacion dentro de la misma transaccion', async (t) => {
    t.mock.method(Auditoria, 'create', async () => { throw Error('Fallo deliberado de auditoria'); });
    await assert.rejects(renovar(pago()), /Fallo deliberado/);
    assert.equal(await Pago.collection.countDocuments({}), 0);
    assert.equal((await Organizacion.findById(org._id)).fechaProximoVencimiento.toISOString(), '2026-11-10T12:00:00.000Z');
});

test('una alta con permiso anterior al downgrade se rechaza y libera la reserva', async () => {
    const anterior = await ejecutarConOrganizacion(org._id, () => obtenerPlanActual());
    await cambiarSuscripcion(org._id, { plan: 'PRO' }, admin, ahora);
    const { reservarCuotaPlan } = require('../services/plan-service');
    await assert.rejects(ejecutarConOrganizacion(org._id, () => reservarCuotaPlan({ organizacionId: org._id, recurso: 'animales', cantidad: 1, actual: 0, limite: 10000, permiso: anterior })), { code: 'PLAN_CHANGED' });
    assert.equal((await require('../models/ReservaCuotaPlan').collection.findOne({ organizacionId: org._id, recurso: 'animales' })).reservas.length, 0);
});

test('cron pasa por por-vencer, gracia y vencida; avisa una vez por ciclo a productor y operador', async (t) => {
    const mensajes = [];
    t.mock.method(global, 'fetch', async (url, opciones) => { assert.equal(url, 'https://api.resend.com/emails'); mensajes.push(JSON.parse(opciones.body)); return { ok: true, json: async () => ({ id: 'simulado' }) }; });
    for (const [fecha, estado] of [[ahora, 'POR_VENCER'], [new Date('2026-11-11T12:00:00Z'), 'EN_GRACIA'], [new Date('2026-11-16T12:00:00Z'), 'VENCIDA']]) {
        const r = await procesarSuscripcionesManuales({ ahora: fecha });
        assert.equal(r.find((x) => x.organizacionId)?.estado, estado);
        assert.equal((await Organizacion.findById(org._id)).estadoSuscripcion, estado);
    }
    assert.equal(mensajes.length, 2);
    assert.ok(mensajes.some((m) => m.to.includes('ganadero@example.test'))); assert.ok(mensajes.some((m) => m.to.includes('operador@example.test')));
    assert.equal((await Organizacion.findById(org._id)).plan.estado, 'Suspendido');
});

test('alta asistida con pago inicial no regala otro mes; prueba usa dias configurados', async (t) => {
    t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ id: 'simulado' }) }));
    const entrada = { organizacion: { nombre: 'Nueva', slug: 'nueva' }, finca: { nombre: 'Finca nueva' }, administrador: { nombre: 'Ana', correo: 'ana@example.test' }, plan: { codigo: 'PRO', estado: 'Activo' }, pagoInicial: pago() };
    const r = await aprovisionarOrganizacion(entrada, admin);
    const p = await Pago.collection.findOne({ organizacionId: r.organizacion._id });
    assert.equal(+p.periodoCubiertoFin, +sumarMeses(p.periodoCubiertoInicio, 1));
    const prueba = await aprovisionarOrganizacion({ ...entrada, organizacion: { nombre: 'Prueba', slug: 'prueba' }, administrador: { nombre: 'Otra', correo: 'otra@example.test' }, plan: { codigo: 'PRO', estado: 'Prueba' }, suscripcion: { diasPrueba: 20 }, pagoInicial: null }, admin);
    assert.equal(+prueba.organizacion.fechaProximoVencimiento - +prueba.organizacion.fechaInicioPeriodoActual, 20 * DIA);
});

test('legados sin fecha no se vencen automaticamente y Stripe queda fuera del motor manual', async () => {
    await Organizacion.collection.insertOne({ _id: id(), nombre: 'Legado', slug: 'legado', estado: 'Activa', plan: { codigo: 'PRO', estado: 'Activo' } });
    const legado = await Organizacion.findOne({ slug: 'legado' }).lean();
    assert.equal(resolverSuscripcion(legado, ahora).permiteOperar, true); assert.equal(resolverSuscripcion(legado, ahora).vigenciaPendiente, true);
    await Organizacion.updateOne({ _id: org._id }, { $set: { modoFacturacion: 'STRIPE', 'plan.proveedorPago': 'Stripe' } });
    assert.equal((await procesarSuscripcionesManuales({ ahora })).length, 0);
    await assert.rejects(renovar(pago()), { code: 'SUBSCRIPTION_STRIPE_MANAGED' });
});

test('preparacion de indices es aditiva e idempotente y no asigna vencimientos a cuentas actuales', async () => {
    await Organizacion.collection.createIndex({ notaOperador: 1 }, { name: 'indice-ajeno-test' });
    const antes = await Organizacion.findById(org._id).lean();
    const { prepararIndices } = require('../scripts/prepararIndicesSuscripciones');
    await prepararIndices(); await prepararIndices();
    assert.deepEqual(await Organizacion.findById(org._id).lean(), antes);
    assert.ok((await Organizacion.collection.indexes()).some((i) => i.name === 'indice-ajeno-test'));
    assert.ok((await Pago.collection.indexes()).some((i) => i.unique && i.key.claveIdempotencia));
});

test('HTTP: solo superadmin cobra; cuenta vencida consulta Mi plan y sus pagos pero no escribe ganado', async () => {
    const fin = new Date(Date.now() - 20 * DIA);
    await Organizacion.updateOne({ _id: org._id }, { $set: { fechaInicioPeriodoActual: new Date(+fin - 30 * DIA), fechaProximoVencimiento: fin } });
    const token = generarToken({ id: String(productor), organizacionId: String(org._id), tokenVersion: 0 });
    const headers = { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), 'Content-Type': 'application/json' };
    const pedir = (ruta, opts = {}) => fetch(base + ruta, { headers, ...opts });
    assert.equal((await pedir('/api/admin/organizaciones')).status, 403);
    assert.equal((await pedir('/api/animales', { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await pedir('/api/facturacion/pagos')).status, 200);
    const plan = await pedir('/api/plan/actual'); assert.equal(plan.status, 200);
    assert.equal((await plan.json()).plan.vigente, false);
    const plataforma = generarToken({ id: String(admin), tokenVersion: 0 });
    const r = await fetch(`${base}/api/admin/organizaciones/${org._id}/pagos`, { method: 'POST', headers: { Authorization: `Bearer ${plataforma}`, 'Content-Type': 'application/json' }, body: JSON.stringify(pago()) });
    assert.equal(r.status, 201, JSON.stringify(await r.json()));
    assert.equal((await ejecutarConOrganizacion(org._id, () => obtenerPlanActual())).vigente, true);
});
