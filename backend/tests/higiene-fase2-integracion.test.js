// MongoDB efimero en loopback. R2 y Resend simulados; nunca lee .env.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process'), { createHash } = require('node:crypto');
const mongoose = require('mongoose'), { MongoClient } = require('mongodb');
const { S3Client } = require('@aws-sdk/client-s3');
const Org = require('../models/Organizacion'), Finca = require('../models/Finca'), Usuario = require('../models/Usuario');
const Notificacion = require('../models/Notificacion'), Importacion = require('../models/ImportacionExcel');
const Invitacion = require('../models/Invitacion'), Archivo = require('../models/ArchivoMultimedia');
const Alerta = require('../models/AlertaCorreo'), Auditoria = require('../models/Auditoria');
const Configuracion = require('../models/ConfiguracionEmail'), Limite = require('../models/RateLimitSeguridad');
const { Membresia } = require('../models/Membresia'), { Tarea } = require('../models/Tarea');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { generarToken } = require('../middleware/auth');
const { marcarComoLeida, marcarTodasComoLeidas } = require('../services/notificacion-service');
const { prepararRetencion } = require('../scripts/prepararRetencionDatos');
const apariencia = require('../services/apariencia-service');
const { enviarCorreosTareas } = require('../services/alertasCorreo-service');
const { procesarResumenesOrganizacion } = require('../services/resumenEmail-service');
const { procesarSuscripcionesManuales } = require('../services/suscripcionesProgramadas-service');
const { enviarCorreoResend, obtenerDestinatariosAdministradores } = require('../services/correoElectronico-service');
const { correoValido } = require('../services/correo-validacion-service');
const DIA = 86400000, id = () => new mongoose.Types.ObjectId(), esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let mongo, cliente, dir, server, base, org, finca, usuario, token;
const fetchLocal = global.fetch;
const contexto = (fn) => ejecutarConOrganizacion(org._id, fn, finca);
const foto = () => ({ originalname: 'foto.png', mimetype: 'image/png', size: 8, buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
const opcionesImagen = (extra = {}) => ({ organizacionId: org._id, fincaId: finca, usuarioId: usuario, archivo: foto(), ...extra });

test.before(async () => {
    process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'Higiene-local-0123456789-abcdefghijklmnop';
    process.env.RESEND_API_KEY = 'fixture'; process.env.EMAIL_ALERTS_ENABLED = 'true';
    delete process.env.EMAIL_TEST_TO; delete process.env.EMAIL_ADMIN;
    Object.assign(process.env, { R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture',
        R2_BUCKET: 'publico-test', R2_PUBLIC_URL: 'https://imagenes.example.test' });
    global.fetch = async () => { throw Error('Red externa bloqueada'); };
    const s = net.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const port = s.address().port; await new Promise((r) => s.close(r));
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-higiene-fase2-'));
    mongo = spawn(process.env.CIERRE_MONGOD || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' : 'mongod'),
        ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', 'higieneTest', '--logpath', path.join(dir, 'mongo.log'),
            '--wiredTigerCacheSizeGB', '0.25', '--setParameter', 'ttlMonitorSleepSecs=1'], { windowsHide: true, stdio: 'ignore' });
    let error; mongo.on('error', (e) => { error = e; });
    cliente = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 300 });
    for (let n = 0; n < 70; n++) { if (error) throw error; try { await cliente.connect(); break; } catch (e) { if (n === 69) throw e; await esperar(100); } }
    await cliente.db('admin').command({ replSetInitiate: { _id: 'higieneTest', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let n = 0; n < 100; n++) { if ((await cliente.db('admin').command({ hello: 1 })).isWritablePrimary) break; if (n === 99) throw Error('Sin primario'); await esperar(100); }
    await mongoose.connect(`mongodb://127.0.0.1:${port}/higiene_test?replicaSet=higieneTest`);
    const app = require('../app');
    for (const modelo of Object.values(mongoose.models)) await modelo.init();
    server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    await mongoose.disconnect(); await cliente?.close();
    if (mongo?.pid && mongo.exitCode === null && mongo.signalCode === null) { const fin = new Promise((r) => mongo.once('exit', r)); mongo.kill(); await fin; }
    global.fetch = fetchLocal;
    if (dir && (mongo?.exitCode !== null || mongo?.signalCode)) {
        assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.match(path.basename(dir), /^cir-higiene-fase2-/);
        fs.rmSync(dir, { force: true, recursive: true });
    }
});
test.beforeEach(async () => {
    for (const modelo of Object.values(mongoose.models)) await modelo.collection.deleteMany({});
    org = await Org.create({ nombre: 'Organizacion prueba', slug: 'higiene', estado: 'Activa', plan: { codigo: 'PREMIUM', estado: 'Activo' } });
    finca = id(); usuario = id();
    await Finca.collection.insertOne({ _id: finca, organizacionId: org._id, nombre: 'Principal', codigo: 'P', estado: 'Activa' });
    org.fincaPrincipal = finca; await org.save();
    await Usuario.create({ _id: usuario, nombre: 'Admin', correo: 'admin@example.test', contrasena: 'hash-fixture', estado: 'Activo' });
    await Membresia.create({ organizacionId: org._id, usuario, rol: 'Administrador', estado: 'Activo', accesoTodasFincas: true });
    token = generarToken({ id: String(usuario), organizacionId: String(org._id), tokenVersion: 0 });
});

test('marcado individual y masivo: TTL 90 dias, idempotencia y aislamiento de destinatario', async () => contexto(async () => {
    const datos = { destinatario: usuario, naturaleza: 'Operativa', tipo: 'TAREA', titulo: 'Revisar', mensaje: 'Prueba' };
    const a = await Notificacion.create(datos), b = await Notificacion.create(datos);
    const ajena = await Notificacion.create({ ...datos, destinatario: id() });
    assert.equal((await Notificacion.findById(a._id).select('+expiraEn')).expiraEn, null);
    await marcarComoLeida(a._id, usuario);
    const leida = await Notificacion.findById(a._id).select('+expiraEn').lean();
    assert.equal(+leida.expiraEn - +leida.fechaLectura, 90 * DIA);
    await marcarComoLeida(a._id, usuario);
    assert.equal(+(await Notificacion.findById(a._id).select('+expiraEn')).expiraEn, +leida.expiraEn);
    await marcarTodasComoLeidas(usuario);
    assert.ok((await Notificacion.findById(b._id).select('+expiraEn')).expiraEn);
    assert.equal((await Notificacion.findById(ajena._id).select('+expiraEn')).expiraEn, null);
    assert.equal(await marcarComoLeida(ajena._id, usuario), null);
}));

test('TTL real borra solo temporales vencidos; conserva no leidas, confirmadas, procesando, aceptadas y Auditoria', async () => {
    const pasado = new Date(Date.now() - 1000), futuro = new Date(Date.now() + DIA);
    const temporal = id(), noLeida = id();
    await Notificacion.collection.insertMany([
        { _id: temporal, leida: true, expiraEn: pasado }, { _id: noLeida, leida: false, expiraEn: pasado }
    ]);
    const confirmada = id(), procesando = id(), preview = id(), aceptada = id(), invitacion = id(), auditoria = id(), alerta = id();
    await Importacion.collection.insertMany([
        { _id: confirmada, estado: 'Aplicada', purgarEn: pasado }, { _id: procesando, estado: 'Procesando', purgarEn: pasado },
        { _id: preview, estado: 'Pendiente', purgarEn: pasado }
    ]);
    await Invitacion.collection.insertMany([
        { _id: aceptada, correo: 'a@example.test', tokenHash: 'a', estado: 'Aceptada', purgarEn: pasado },
        { _id: invitacion, correo: 'b@example.test', tokenHash: 'b', estado: 'Pendiente', purgarEn: pasado }
    ]);
    await Auditoria.collection.insertOne({ _id: auditoria, createdAt: pasado });
    await Alerta.collection.insertOne({ _id: alerta, clave: 'vieja', updatedAt: new Date(Date.now() - 121 * DIA) });
    await Alerta.collection.insertOne({ _id: id(), clave: 'activa', createdAt: new Date(Date.now() - 200 * DIA), updatedAt: futuro });
    for (let n = 0; n < 80; n++) {
        if (!await Notificacion.collection.findOne({ _id: temporal }) && !await Importacion.collection.findOne({ _id: preview })
            && !await Invitacion.collection.findOne({ _id: invitacion }) && !await Alerta.collection.findOne({ _id: alerta })) break;
        if (n === 79) assert.fail('TTL no elimino los temporales vencidos'); await esperar(100);
    }
    for (const [modelo, _id] of [[Notificacion, noLeida], [Importacion, confirmada], [Importacion, procesando], [Invitacion, aceptada], [Auditoria, auditoria]]) {
        assert.ok(await modelo.collection.findOne({ _id }));
    }
    assert.ok(await Alerta.collection.findOne({ clave: 'activa' }));
    assert.ok((await Auditoria.collection.indexes()).every((i) => i.expireAfterSeconds === undefined));
});

test('migracion de retencion: check no escribe; apply compacta confirmadas y conserva resumen/hash/auditoria', async () => {
    const expiraEn = new Date(Date.now() + DIA), confirmada = id();
    await Importacion.collection.insertOne({ _id: confirmada, estado: 'Aplicada', registros: { Animal: ['pesado'] }, errores: ['detalle'],
        resultado: { Animal: { creados: 1 } }, resumenDetectado: { animales: 1 }, hashArchivo: 'hash', purgarEn: expiraEn });
    const vista = await contexto(() => Importacion.create({ estado: 'Pendiente', expiraEn }));
    assert.equal(+vista.purgarEn - +expiraEn, 7 * DIA);
    await Invitacion.collection.insertOne({ _id: id(), correo: 'operario@example.test', tokenHash: 'legacy', estado: 'Revocada', expiraEn });
    const antes = await Importacion.collection.findOne({ _id: confirmada });
    await prepararRetencion(); assert.deepEqual(await Importacion.collection.findOne({ _id: confirmada }), antes);
    await prepararRetencion({ aplicar: true });
    const despues = await Importacion.collection.findOne({ _id: confirmada });
    assert.equal(despues.registros, undefined); assert.equal(despues.errores, undefined); assert.equal(despues.purgarEn, undefined);
    assert.deepEqual(despues.resultado, antes.resultado); assert.deepEqual(despues.resumenDetectado, antes.resumenDetectado); assert.equal(despues.hashArchivo, 'hash');
    assert.equal(+(await Invitacion.collection.findOne({ tokenHash: 'legacy' })).purgarEn - +expiraEn, 30 * DIA);
    assert.ok((await prepararRetencion({ aplicar: true })).cambios.every((c) => c.modificados === 0));
});

test('confirmacion HTTP limpia filas crudas, conserva resultado y bloquea confirmar otra vez', async () => {
    const vista = await contexto(() => Importacion.create({ usuario, estado: 'Pendiente', hashArchivo: 'fixture',
        registros: { Animal: [], Potrero: [], Pesaje: [], MovimientoFinanciero: [] }, errores: [], resumenDetectado: { animales: 0 }, expiraEn: new Date(Date.now() + DIA) }));
    const pedir = () => fetchLocal(`${base}/api/importar/excel/confirmar`, { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), 'Content-Type': 'application/json' }, body: JSON.stringify({ importacionId: vista._id }) });
    const r = await pedir(), datos = await r.json(); assert.equal(r.status, 201, JSON.stringify(datos));
    const guardada = await Importacion.collection.findOne({ _id: vista._id });
    assert.equal(guardada.estado, 'Aplicada'); assert.equal(guardada.registros, undefined); assert.equal(guardada.purgarEn, undefined);
    assert.deepEqual(guardada.resultado, datos.resultado); assert.equal((await pedir()).status, 409);
});

test('reemplazar/restaurar imagenes elimina R2 solo al perder su ultima referencia', async (t) => contexto(async () => {
    const eliminadas = [];
    t.mock.method(S3Client.prototype, 'send', async (cmd) => { if (cmd.constructor.name === 'DeleteObjectCommand') eliminadas.push(cmd.input.Key); return {}; });
    await apariencia.subirLogoOrganizacion(opcionesImagen());
    const logo = (await Org.findById(org._id)).branding.logo;
    const claveLogo = (await Archivo.findById(logo)).clave;
    await apariencia.subirLogoOrganizacion(opcionesImagen()); assert.ok(eliminadas.includes(claveLogo));
    await apariencia.restaurarImagen({ alcance: 'organizacion', tipo: 'logo', organizacionId: org._id }); assert.equal(eliminadas.length, 2);
    await apariencia.subirImagenFinca(opcionesImagen({ tipo: 'dashboard' }));
    const imagen = (await Finca.findById(finca)).imagenes.dashboard, clave = (await Archivo.findById(imagen)).clave;
    await apariencia.reutilizarDashboardEnPotreros(opcionesImagen());
    await apariencia.subirImagenFinca(opcionesImagen({ tipo: 'dashboard' })); assert.ok(!eliminadas.includes(clave));
    await apariencia.restaurarImagen({ alcance: 'finca', tipo: 'potreros', fincaId: finca, organizacionId: org._id });
    assert.ok(eliminadas.includes(clave)); assert.equal((await Archivo.findById(imagen)).activo, false);
}));

test('R2 best effort: fallo de borrado no revierte imagen nueva; referencia ajena nunca se elimina', async (t) => contexto(async () => {
    const warnings = []; let borrados = 0;
    t.mock.method(console, 'warn', (...args) => warnings.push(args));
    t.mock.method(S3Client.prototype, 'send', async (cmd) => {
        if (cmd.constructor.name === 'DeleteObjectCommand') { borrados++; throw Error('R2 simulado'); } return {};
    });
    await apariencia.subirLogoOrganizacion(opcionesImagen()); const anterior = (await Org.findById(org._id)).branding.logo;
    await apariencia.subirLogoOrganizacion(opcionesImagen());
    assert.notEqual(String((await Org.findById(org._id)).branding.logo), String(anterior)); assert.equal(warnings.length, 1);
    assert.equal((await Archivo.findById(anterior)).activo, true);
    const extranjero = id(); await Archivo.collection.insertOne({ _id: extranjero, organizacionId: id(), activo: true, visibilidad: 'PUBLICO', uso: 'LOGO_ORGANIZACION', clave: 'organizaciones/ajena/imagen.png' });
    await apariencia.limpiarImagenSinReferencias(extranjero, org._id); assert.equal(borrados, 1);
    const claveAjena = id(); await Archivo.collection.insertOne({ _id: claveAjena, organizacionId: org._id, activo: true, visibilidad: 'PUBLICO', uso: 'LOGO_ORGANIZACION', clave: 'organizaciones/ajena/foto.png' });
    await apariencia.limpiarImagenSinReferencias(claveAjena, org._id); assert.equal(borrados, 1);
}));

test('sinAccesoCorreo excluye alertas, resumenes, administradores y renovaciones, sin llamadas a Resend', async (t) => contexto(async () => {
    await Usuario.updateOne({ _id: usuario }, { $set: { sinAccesoCorreo: true } });
    t.mock.method(global, 'fetch', async () => { assert.fail('No debe llamar a Resend'); });
    const tarea = await Tarea.create({ titulo: 'Revisar', tipo: 'Otro', asignadoA: usuario, creadoPor: usuario, fechaProgramada: new Date() });
    assert.equal((await enviarCorreosTareas([{ tarea, fecha: new Date(), dias: 0, asunto: 'Tareas' }])).enviadas, 0);
    assert.deepEqual(await obtenerDestinatariosAdministradores(), []);
    await Configuracion.create({ usuario, frecuencia: 'Diario' });
    assert.deepEqual(await procesarResumenesOrganizacion(org, new Date(), async () => {}, { modoEjecucion: 'cron_diario' }), []);
    await Org.updateOne({ _id: org._id }, { $set: { modoFacturacion: 'MANUAL', fechaInicioPeriodoActual: new Date(), fechaProximoVencimiento: new Date(Date.now() + 2 * DIA) } });
    assert.ok((await procesarSuscripcionesManuales()).every((r) => !r.error && r.enviadas === 0));
}));

test('correo invalido: rechaza antes de transporte/limitador y valida Usuario', async (t) => {
    let llamadas = 0;
    t.mock.method(global, 'fetch', async () => { llamadas++; throw Error('No debe enviar'); });
    t.mock.method(console, 'warn', () => {});
    for (const correo of ['sin-arroba', 'a@', '@example.test', 'a@@example.test', 'a@-dominio.com', 'a@dominio..com', 'a@example.com\r\nBcc:b@example.com']) {
        assert.equal(correoValido(correo), false);
        assert.equal((await enviarCorreoResend({ to: correo, subject: 'Prueba' })).modo, 'correo_invalido');
        await assert.rejects(new Usuario({ nombre: 'Prueba', correo, contrasena: 'fixture' }).validate());
    }
    assert.equal((await enviarCorreoResend({ to: ['a@example.test', 'mal'] })).enviado, false);
    assert.equal(llamadas, 0); assert.equal(correoValido('nombre.apellido+finca@example.test'), true);
});

test('crear usuario operativo persiste exclusion de correo (HTTP) sin modificar otros usuarios', async () => {
    const r = await fetchLocal(`${base}/api/usuarios`, { method: 'POST', headers: {
        Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), 'Content-Type': 'application/json'
    }, body: JSON.stringify({ nombre: 'Operario', correo: 'operario@example.test', rol: 'Trabajador', sinAccesoCorreo: true, contrasena: 'Temporal-Segura-2026!' }) });
    assert.equal(r.status, 201, JSON.stringify(await r.json()));
    assert.equal((await Usuario.findOne({ correo: 'operario@example.test' })).sinAccesoCorreo, true);
    assert.equal((await Usuario.findById(usuario)).sinAccesoCorreo, false);
});

test('contexto publico de invitacion: limite por IP antes de consultar invitaciones, con Retry-After', async (t) => {
    const clave = `contexto_invitacion:ip:${createHash('sha256').update('127.0.0.1').digest('hex')}`;
    await Limite.collection.insertOne({ clave, intentos: 30, ventanaHasta: new Date(Date.now() + 60000), expiraEn: new Date(Date.now() + 60000) });
    let consultas = 0; t.mock.method(Invitacion, 'findOne', () => { consultas++; throw Error('No debe consultar invitaciones'); });
    const r = await fetchLocal(`${base}/api/invitaciones/contexto?token=${'a'.repeat(64)}`);
    assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0); assert.equal(consultas, 0);
    await Limite.collection.deleteMany({});
    const libre = await fetchLocal(`${base}/api/invitaciones/contexto?token=invalido`);
    assert.equal(libre.status, 400); assert.equal(await Limite.collection.countDocuments({ accion: 'inexistente' }), 0);
    assert.equal((await Limite.collection.findOne({ clave })).intentos, 1);
});
