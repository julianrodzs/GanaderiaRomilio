// MongoDB REAL desechable en loopback; no carga .env ni permite correo/red externos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const Organizacion = require('../models/Organizacion');
const Usuario = require('../models/Usuario');
const Finca = require('../models/Finca');
const Invitacion = require('../models/Invitacion');
const Aceptacion = require('../models/AceptacionLegal');
const { Membresia } = require('../models/Membresia');
const { documentos, obtenerDocumento } = require('../config/documentosLegales');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { generarToken } = require('../middleware/auth');

const id = () => new mongoose.Types.ObjectId();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const password = 'LegalLocal!2026-NoReal';
const agente = 'CIR-centro-legal-integracion/1.0';
const nativeFetch = global.fetch;
const referencias = () => documentos.map(({ slug, version, hashSha256 }) => ({ slug, version, hashSha256 }));
const entrada = (aceptaciones = {}, extra = {}) => ({
    aceptaciones: { reglasUso: true, privacidad: true, terminosOrganizacion: false, comunicacionesOpcionales: false, ...aceptaciones },
    documentos: referencias(), claveIdempotencia: id().toString(), ...extra
});
const puerto = () => new Promise((r) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); });
});
let mongod, cliente, server, base, hashPassword, org, finca, usuario, token;

async function pedir(ruta, { method = 'GET', body, auth = token } = {}) {
    const r = await nativeFetch(base + ruta, {
        method, signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'User-Agent': agente,
            ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: r.status, data: await r.json(), headers: r.headers };
}
function status(r, esperado) { assert.equal(r.status, esperado, JSON.stringify(r.data)); return r.data; }
async function filas(filtro = {}) { return Aceptacion.collection.find(filtro).sort({ _id: 1 }).toArray(); }
async function invitacion({ rol = 'Encargado', activacion = false, existente = false, destino = org } = {}) {
    const secreto = randomBytes(32).toString('hex');
    let invitado;
    if (activacion) {
        invitado = await Usuario.create({ nombre: 'Titular nuevo', correo: `${id()}@example.test`, contrasena: hashPassword, estado: 'Inactivo' });
        await Membresia.create({ organizacionId: destino._id, usuario: invitado._id, rol: 'Administrador', estado: 'Inactivo', esPrincipal: true, fincas: [destino.fincaPrincipal] });
        await Organizacion.updateOne({ _id: destino._id }, { $set: { representanteLegalUsuarioId: invitado._id } });
    } else if (existente) invitado = usuario;
    const doc = await Invitacion.create({
        organizacionId: destino._id, correo: invitado?.correo || `${id()}@example.test`, nombre: 'Persona invitada',
        usuario: invitado?._id, rol: activacion ? 'Administrador' : rol, estadoMembresia: 'Activo',
        fincas: [destino.fincaPrincipal], accesoTodasFincas: true, tokenHash: createHash('sha256').update(secreto).digest('hex'),
        expiraEn: new Date(Date.now() + 86400000), invitadoPor: usuario._id,
        requiereContrasena: activacion, esActivacionOrganizacion: activacion
    });
    return { doc, secreto, invitado };
}
async function otraOrganizacion() {
    const otra = await Organizacion.create({ nombre: 'Otra empresa', slug: `otra-${id()}`, estado: 'Activa', plan: { codigo: 'PREMIUM', estado: 'Activo' } });
    const f = id();
    await Finca.collection.insertOne({ _id: f, organizacionId: otra._id, nombre: 'Otra finca', codigo: 'OTRA', estado: 'Activa' });
    otra.fincaPrincipal = f; await otra.save(); return otra;
}
function evidenciaCompleta(rows, { usuarioId, organizacionId = org._id, rol = 'Encargado', contexto = 'PANEL_CUENTA' }) {
    for (const e of rows) {
        const d = obtenerDocumento(e.documentoSlug);
        assert.equal(String(e.usuarioId), String(usuarioId));
        assert.equal(String(e.organizacionId), String(organizacionId));
        assert.equal(e.rolEnMomento, rol);
        assert.equal(e.contexto, contexto);
        assert.equal(e.versionDocumento, '0.9-borrador');
        assert.equal(e.estadoDocumento, 'BORRADOR_PRUEBA');
        assert.equal(e.hashTexto, d.hashSha256);
        assert.equal(e.copiaTextoExacto, d.contenido);
        assert.equal(createHash('sha256').update(e.copiaTextoExacto, 'utf8').digest('hex'), e.hashTexto);
        assert.ok(e.fechaAceptacion instanceof Date && Number.isFinite(+e.fechaAceptacion));
        assert.ok(Math.abs(Date.now() - +e.fechaAceptacion) < 60000);
        assert.match(e.ip, /127\.0\.0\.1|::1/);
        assert.equal(e.userAgent, agente);
        assert.ok(e.declaracion && e.claveSolicitud && e.solicitudHash);
    }
}

test.before(async () => {
    process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'Centro-Legal-Local-0123456789-abcdefghijklmnop';
    process.env.FRONTEND_URL = 'https://app.example.test'; process.env.RESEND_API_KEY = 'simulado-no-real';
    process.env.CRON_MODE = 'external'; delete process.env.EMAIL_TEST_TO;
    global.fetch = async (url) => { throw Error(`Red externa prohibida en prueba legal: ${url}`); };
    const port = await puerto(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-centro-legal-'));
    mongod = spawn(process.env.CIERRE_MONGOD || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' : 'mongod'),
        ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', 'centroLegalTest', '--logpath', path.join(dir, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'],
        { windowsHide: true, stdio: 'ignore' });
    let arranque; mongod.on('error', (e) => { arranque = e; });
    cliente = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 300 });
    for (let n = 0; n < 60; n++) {
        if (arranque) throw arranque;
        try { await cliente.connect(); break; } catch (e) { if (n === 59) throw e; await esperar(100); }
    }
    await cliente.db('admin').command({ replSetInitiate: { _id: 'centroLegalTest', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let n = 0; n < 100; n++) {
        if ((await cliente.db('admin').command({ hello: 1 })).isWritablePrimary) break;
        if (n === 99) throw Error('Sin primario local para las pruebas legales'); await esperar(100);
    }
    await mongoose.connect(`mongodb://127.0.0.1:${port}/centro_legal?replicaSet=centroLegalTest`);
    const app = require('../app');
    for (const m of Object.values(mongoose.models)) await m.init();
    hashPassword = await bcrypt.hash(password, 4);
    server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    await esperar(200); await mongoose.disconnect(); await cliente?.close();
    if (mongod && mongod.exitCode === null && mongod.pid) {
        const fin = new Promise((r) => mongod.once('exit', r)); mongod.kill(); await fin;
    }
    global.fetch = nativeFetch;
});

test.beforeEach(async () => {
    // Limpieza exclusiva de fixtures en el mongod hijo, por debajo de los hooks inmutables.
    for (const m of Object.values(mongoose.models)) await m.collection.deleteMany({});
    org = await Organizacion.create({ nombre: 'Empresa legal', slug: 'empresa-legal', estado: 'Activa', plan: { codigo: 'PREMIUM', estado: 'Activo' } });
    finca = id();
    await Finca.collection.insertOne({ _id: finca, organizacionId: org._id, nombre: 'Principal', codigo: 'P', estado: 'Activa',
        lineasProductivas: [{ especie: 'Bovino', objetivos: ['ENGORDE'], activa: true }] });
    org.fincaPrincipal = finca; await org.save();
    usuario = await Usuario.create({ nombre: 'Usuario legado', correo: 'legado@example.test', contrasena: hashPassword, estado: 'Activo' });
    await Membresia.create({ organizacionId: org._id, usuario: usuario._id, rol: 'Encargado', estado: 'Activo', accesoTodasFincas: true, fincas: [finca] });
    token = generarToken({ id: String(usuario._id), organizacionId: String(org._id), tokenVersion: 0 });
});

test('HTTP publico sin JWT: cuatro documentos exactos, detalle, sin documentos internos; estado y escrituras requieren sesion', async () => {
    const r = await pedir('/api/legal/documentos', { auth: null });
    assert.deepEqual(status(r, 200), documentos);
    for (const d of documentos) assert.deepEqual(status(await pedir(`/api/legal/documentos/${d.slug}`, { auth: null }), 200), d);
    for (const slug of ['protocolo-interno', 'AGENTS.md', 'toString', '__proto__']) status(await pedir(`/api/legal/documentos/${slug}`, { auth: null }), 404);
    for (const [ruta, method, body] of [['/estado', 'GET'], ['/aceptaciones', 'POST', entrada()], ['/comunicaciones', 'PATCH', { otorgado: true }]]) {
        status(await pedir(`/api/legal${ruta}`, { auth: null, method, body }), 401);
    }
    assert.equal((await filas()).length, 0);
});

test('contexto publico deriva escenario del flag backend, no del rol; no revela secreto ni correo', async () => {
    for (const opciones of [{ rol: 'Administrador' }, { activacion: true }]) {
        const i = await invitacion(opciones);
        const r = await pedir(`/api/invitaciones/contexto?token=${i.secreto}`, { auth: null });
        const d = status(r, 200);
        assert.equal(d.escenario, opciones.activacion ? 'ORGANIZACION' : 'COLABORADOR');
        assert.equal(d.organizacionNombre, org.nombre); assert.equal(d.borrador, true);
        assert.deepEqual(d.documentos.map((x) => x.slug).sort(), documentos.map((x) => x.slug).sort());
        assert.equal(r.headers.get('cache-control'), 'no-store');
        assert.ok(!JSON.stringify(d).includes(i.secreto) && !JSON.stringify(d).includes(i.doc.correo));
    }
    for (const valor of ['invalido', randomBytes(32).toString('hex')]) status(await pedir(`/api/invitaciones/contexto?token=${valor}`, { auth: null }), 400);
    const vencida = await invitacion();
    await Invitacion.updateOne({ _id: vencida.doc._id }, { $set: { expiraEn: new Date(0) } });
    status(await pedir(`/api/invitaciones/contexto?token=${vencida.secreto}`, { auth: null }), 400);
});

for (const rol of ['Encargado', 'Veterinario', 'Contador', 'Administrador']) {
    test(`colaborador ${rol}: reglas y privacidad sin contrato comercial, publicidad false y evidencia completa`, async () => {
        const i = await invitacion({ rol });
        status(await pedir('/api/invitaciones/aceptar', { auth: null, method: 'POST', body: { token: i.secreto, contrasena: password, legal: entrada() } }), 201);
        const invitado = await Usuario.findOne({ correo: i.doc.correo });
        const rows = await filas({ usuarioId: invitado._id });
        assert.equal(rows.length, 3);
        assert.equal(rows.filter((e) => e.tipoAceptacion === 'TERMINOS_Y_SUSCRIPCION_ORG').length, 0);
        assert.equal(rows.find((e) => e.tipoAceptacion === 'COMUNICACIONES_OPCIONALES').otorgado, false);
        evidenciaCompleta(rows, { usuarioId: invitado._id, rol, contexto: 'ACEPTACION_INVITACION_COLABORADOR' });
        assert.equal((await Invitacion.findById(i.doc._id)).estado, 'Aceptada');
        status(await pedir('/api/invitaciones/aceptar', { auth: null, method: 'POST', body: { token: i.secreto, contrasena: password, legal: entrada() } }), 400);
        assert.equal((await filas()).length, 3);
    });
}

test('colaborador omite reglas o privacidad: 400 claro sin consumir invitacion ni crear usuario o evidencia', async () => {
    const i = await invitacion();
    for (const [campo, mensaje] of [['reglasUso', /reglas|uso/i], ['privacidad', /privacidad|consentimiento/i]]) {
        const r = await pedir('/api/invitaciones/aceptar', { auth: null, method: 'POST', body: { token: i.secreto, contrasena: password, legal: entrada({ [campo]: false }) } });
        assert.match(status(r, 400).mensaje, mensaje);
        assert.equal((await Invitacion.findById(i.doc._id)).estado, 'Pendiente');
        assert.equal(await Usuario.countDocuments({ correo: i.doc.correo }), 0);
        assert.equal((await filas()).length, 0);
    }
    status(await pedir('/api/invitaciones/aceptar', { auth: null, method: 'POST', body: { token: i.secreto, contrasena: password } }), 400);
});

test('administrador inicial: dos casillas obligatorias independientes y contrato en dos filas; publicidad nunca obligatoria', async () => {
    const i = await invitacion({ activacion: true });
    for (const [campo, mensaje] of [['terminosOrganizacion', /suscripci|representaci|t.rminos/i], ['privacidad', /privacidad|consentimiento/i]]) {
        const r = await pedir('/api/auth/aceptar-invitacion', { auth: null, method: 'POST', body: { token: i.secreto, contrasena: password,
            legal: entrada({ reglasUso: false, terminosOrganizacion: true, [campo]: false }) } });
        assert.match(status(r, 400).mensaje, mensaje);
        assert.equal((await Usuario.findById(i.invitado._id)).estado, 'Inactivo');
        assert.equal((await Invitacion.findById(i.doc._id)).estado, 'Pendiente');
        assert.equal((await filas()).length, 0);
    }
    status(await pedir('/api/auth/aceptar-invitacion', { auth: null, method: 'POST', body: { token: i.secreto, contrasena: password,
        legal: entrada({ reglasUso: false, terminosOrganizacion: true }) } }), 200);
    const rows = await filas(); assert.equal(rows.length, 4);
    assert.deepEqual(rows.filter((e) => e.tipoAceptacion === 'TERMINOS_Y_SUSCRIPCION_ORG').map((e) => e.documentoSlug).sort(), ['suscripciones', 'terminos']);
    assert.equal(rows.filter((e) => e.tipoAceptacion === 'CONSENTIMIENTO_PRIVACIDAD_LEY8968').length, 1);
    assert.equal(rows.find((e) => e.tipoAceptacion === 'COMUNICACIONES_OPCIONALES').otorgado, false);
    evidenciaCompleta(rows, { usuarioId: i.invitado._id, rol: 'Administrador', contexto: 'ACTIVACION_ORGANIZACION' });
});

test('version, hash o documento adulterado en invitacion se rechaza antes de activar', async () => {
    const i = await invitacion();
    for (const cambio of [{ version: '1.0' }, { hashSha256: 'f'.repeat(64) }, { slug: 'manual-interno' }]) {
        const refs = referencias(); refs[0] = { ...refs[0], ...cambio };
        status(await pedir('/api/invitaciones/aceptar', { auth: null, method: 'POST', body: { token: i.secreto, contrasena: password, legal: entrada({}, { documentos: refs }) } }), 409);
        assert.equal((await Invitacion.findById(i.doc._id)).estado, 'Pendiente');
        assert.equal(await Usuario.countDocuments({ correo: i.doc.correo }), 0);
        assert.equal((await filas()).length, 0);
    }
});

test('panel consulta historial propio, registra versiones actuales e idempotencia sin duplicar ni ocultar conflictos', async () => {
    const inicial = status(await pedir('/api/legal/estado'), 200);
    for (const campo of ['representante', 'aceptacionComercial', 'reglasUso', 'privacidad', 'comunicacionesOpcionales']) assert.equal(inicial[campo], false);
    assert.deepEqual(inicial.aceptaciones, []); assert.equal(inicial.borrador, true);
    const body = entrada();
    const r = status(await pedir('/api/legal/aceptaciones', { method: 'POST', body }), 200);
    assert.equal(r.reglasUso, true); assert.equal(r.privacidad, true); assert.equal(r.aceptacionComercial, false);
    assert.equal(r.comunicacionesOpcionales, false); assert.equal(r.aceptaciones.length, 3);
    for (const e of r.aceptaciones) {
        assert.equal(e.ip, undefined); assert.equal(e.userAgent, undefined);
        assert.equal(e.claveSolicitud, undefined); assert.equal(e.solicitudHash, undefined);
    }
    const antes = await filas(); evidenciaCompleta(antes, { usuarioId: usuario._id });
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: { ...body,
        aceptaciones: Object.fromEntries(Object.entries(body.aceptaciones).reverse()), documentos: [...body.documentos].reverse() } }), 200);
    assert.deepEqual(await filas(), antes);
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: { ...body, aceptaciones: { ...body.aceptaciones, comunicacionesOpcionales: true } } }), 409);
    assert.deepEqual(await filas(), antes);
});

test('colaborador no puede falsificar activacion para aceptar cargos comerciales ni se presume publicidad si omite casilla', async () => {
    const i = await invitacion({ rol: 'Administrador' });
    status(await pedir('/api/invitaciones/aceptar', { auth: null, method: 'POST', body: {
        token: i.secreto, contrasena: password, esActivacionOrganizacion: true, escenario: 'ORGANIZACION',
        legal: entrada({ terminosOrganizacion: true })
    } }), 403);
    assert.equal((await Invitacion.findById(i.doc._id)).estado, 'Pendiente');
    assert.equal((await filas()).length, 0);
    const legal = entrada(); delete legal.aceptaciones.comunicacionesOpcionales;
    status(await pedir('/api/invitaciones/aceptar', { auth: null, method: 'POST', body: { token: i.secreto, contrasena: password, legal } }), 201);
    const rows = await filas(); assert.equal(rows.length, 2);
    assert.ok(rows.every((e) => !['COMUNICACIONES_OPCIONALES', 'TERMINOS_Y_SUSCRIPCION_ORG'].includes(e.tipoAceptacion)));
});

test('endpoint legado de consentimiento devuelve 410 sin convertir version arbitraria en evidencia ni cambiar campo historico', async () => {
    const consentimiento = { version: 'historica-anterior', aceptadoEn: new Date('2025-01-01T12:00:00Z') };
    await Usuario.updateOne({ _id: usuario._id }, { $set: { consentimiento } });
    const r = await pedir('/api/usuarios/perfil/consentimiento', { method: 'POST', body: { version: 'version-inventada', aceptado: true } });
    assert.equal(status(r, 410).code, 'LEGAL_FLOW_REQUIRED');
    assert.equal(r.data.ruta, '/api/legal/aceptaciones');
    assert.deepEqual((await Usuario.findById(usuario._id).lean()).consentimiento, consentimiento);
    assert.equal((await filas()).length, 0);
});

test('preparar indices legales es aditivo e idempotente y no crea aceptaciones ni modifica legados', async () => {
    await Aceptacion.collection.createIndex({ declaracion: 1 }, { name: 'indice-ajeno-legal-test' });
    const antesUsuario = await Usuario.findById(usuario._id).lean(), antesOrg = await Organizacion.findById(org._id).lean();
    const { prepararIndices } = require('../scripts/prepararIndicesLegales');
    for (let n = 0; n < 2; n++) assert.deepEqual(await prepararIndices(), { modelos: ['AceptacionLegal'], datosModificados: 0 });
    assert.deepEqual(await Usuario.findById(usuario._id).lean(), antesUsuario);
    assert.deepEqual(await Organizacion.findById(org._id).lean(), antesOrg);
    assert.equal((await filas()).length, 0);
    const indices = await Aceptacion.collection.indexes();
    assert.ok(indices.some((i) => i.name === 'indice-ajeno-legal-test'));
    assert.ok(indices.some((i) => i.unique && i.key.organizacionId && i.key.usuarioId && i.key.claveSolicitud && i.key.tipoAceptacion && i.key.documentoSlug));
});

test('panel rechaza casillas no booleanas, campos inyectados, falta de referencias y versiones obsoletas', async () => {
    for (const body of [
        entrada({ privacidad: 'true' }), entrada({}, { claveIdempotencia: '' }), entrada({}, { documentos: [] }),
        entrada({}, { usuarioId: id().toString() }), entrada({}, { organizacionId: id().toString() }),
        entrada({}, { documentos: [{ ...referencias()[0], contenido: 'Texto inyectado' }] }),
        entrada({ '$set': { otorgado: true } })
    ]) status(await pedir('/api/legal/aceptaciones', { method: 'POST', body }), 400);
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: entrada({}, { documentos: referencias().map((r) => ({ ...r, version: 'anterior' })) }) }), 409);
    assert.equal((await filas()).length, 0);
});

test('solo titular puede aceptar contrato; legado exige admin principal y el titular explicito prevalece', async () => {
    const comercial = () => entrada({ reglasUso: false, terminosOrganizacion: true });
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: comercial() }), 403);
    await Membresia.updateOne({ usuario: usuario._id }, { $set: { rol: 'Administrador', esPrincipal: false } });
    assert.equal(status(await pedir('/api/legal/estado'), 200).representante, false);
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: comercial() }), 403);
    await Membresia.updateOne({ usuario: usuario._id }, { $set: { esPrincipal: true } });
    assert.equal(status(await pedir('/api/legal/estado'), 200).representante, true);
    await Organizacion.updateOne({ _id: org._id }, { $set: { representanteLegalUsuarioId: id() } });
    assert.equal(status(await pedir('/api/legal/estado'), 200).representante, false);
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: comercial() }), 403);
    await Organizacion.updateOne({ _id: org._id }, { $set: { representanteLegalUsuarioId: usuario._id } });
    assert.equal(status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: comercial() }), 200).aceptacionComercial, true);
    const rows = await filas(); assert.equal(rows.length, 4);
    evidenciaCompleta(rows, { usuarioId: usuario._id, rol: 'Administrador' });
});

test('tenant y usuario: historial privado y aceptacion comercial solo de la organizacion activa', async () => {
    await Membresia.updateOne({ usuario: usuario._id }, { $set: { rol: 'Administrador', esPrincipal: true } });
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: entrada({ reglasUso: false, terminosOrganizacion: true }) }), 200);
    const otra = await otraOrganizacion();
    await Membresia.create({ organizacionId: otra._id, usuario: usuario._id, estado: 'Activo', rol: 'Administrador', fincas: [otra.fincaPrincipal] });
    const tokenOtra = generarToken({ id: String(usuario._id), organizacionId: String(otra._id), tokenVersion: 0 });
    const estadoOtra = status(await pedir('/api/legal/estado', { auth: tokenOtra }), 200);
    assert.equal(estadoOtra.aceptacionComercial, false); assert.equal(estadoOtra.privacidad, false); assert.deepEqual(estadoOtra.aceptaciones, []);
    assert.equal(await ejecutarConOrganizacion(otra._id, () => Aceptacion.countDocuments({ organizacionId: org._id })), 0);
    const otro = await Usuario.create({ nombre: 'Otro', correo: 'otro@example.test', contrasena: hashPassword });
    await Membresia.create({ organizacionId: org._id, usuario: otro._id, rol: 'Veterinario', fincas: [finca] });
    const tokenOtro = generarToken({ id: String(otro._id), organizacionId: String(org._id), tokenVersion: 0 });
    const estadoOtro = status(await pedir('/api/legal/estado', { auth: tokenOtro }), 200);
    assert.equal(estadoOtro.aceptacionComercial, true); assert.deepEqual(estadoOtro.aceptaciones, []); assert.equal(estadoOtro.privacidad, false);
    status(await pedir('/api/legal/aceptaciones', { auth: tokenOtro, method: 'POST', body: entrada({ terminosOrganizacion: true }) }), 403);
    assert.equal((await filas()).length, 4);
});

test('publicidad se otorga, revoca y reotorga mediante append; reintento idempotente no borra trazabilidad', async () => {
    const inicial = entrada({ comunicacionesOpcionales: true });
    assert.equal(status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: inicial }), 200).comunicacionesOpcionales, true);
    const antes = await filas();
    for (const otorgado of [false, true]) {
        const body = { otorgado, documentos: referencias(), claveIdempotencia: id().toString() };
        const r = status(await pedir('/api/legal/comunicaciones', { method: 'PATCH', body }), 200);
        assert.equal(r.comunicacionesOpcionales, otorgado);
        const count = (await filas()).length;
        status(await pedir('/api/legal/comunicaciones', { method: 'PATCH', body }), 200);
        assert.equal((await filas()).length, count);
        status(await pedir('/api/legal/comunicaciones', { method: 'PATCH', body: { ...body, otorgado: !otorgado } }), 409);
    }
    const rows = await filas(); assert.equal(rows.length, 5); assert.deepEqual(rows.slice(0, 3), antes);
    assert.deepEqual(rows.filter((e) => e.tipoAceptacion === 'COMUNICACIONES_OPCIONALES').map((e) => e.otorgado), [true, false, true]);
    evidenciaCompleta(rows.slice(3), { usuarioId: usuario._id, contexto: 'ACTUALIZACION_CONSENTIMIENTO' });
    for (const otorgado of ['true', null, 1]) status(await pedir('/api/legal/comunicaciones', { method: 'PATCH', body: { otorgado, documentos: referencias(), claveIdempotencia: id().toString() } }), 400);
});

test('inmutabilidad real: save, actualizaciones, reemplazos, deletes y bulk no alteran la evidencia', async () => {
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: entrada() }), 200);
    const antes = await filas(), filtro = { _id: antes[0]._id }, cambio = { $set: { otorgado: false } };
    await ejecutarConOrganizacion(org._id, async () => {
        const doc = await Aceptacion.findById(antes[0]._id);
        doc.otorgado = false;
        const operaciones = [
            () => doc.save(), () => doc.deleteOne(), () => doc.updateOne(cambio),
            () => Aceptacion.updateOne(filtro, cambio), () => Aceptacion.updateMany({}, cambio),
            () => Aceptacion.findOneAndUpdate(filtro, cambio), () => Aceptacion.findByIdAndUpdate(doc._id, cambio),
            () => Aceptacion.replaceOne(filtro, antes[0]), () => Aceptacion.findOneAndReplace(filtro, antes[0]),
            () => Aceptacion.deleteOne(filtro), () => Aceptacion.deleteMany({}),
            () => Aceptacion.findOneAndDelete(filtro), () => Aceptacion.findByIdAndDelete(doc._id),
            () => Aceptacion.bulkWrite([{ updateOne: { filter: filtro, update: cambio } }]),
            () => Aceptacion.bulkWrite([{ deleteOne: { filter: filtro } }])
        ];
        for (const operacion of operaciones) {
            await assert.rejects(operacion, /inmutable|edici.n ni eliminaci.n/i);
            assert.deepEqual(await filas(), antes);
        }
    });
});

for (const activacion of [false, true]) {
    test(`fallo parcial al guardar evidencia revierte ${activacion ? 'activacion, password y membresia' : 'usuario nuevo y membresia'} e invitacion`, async (t) => {
        const i = await invitacion({ activacion });
        const antesUsuario = activacion ? await Usuario.collection.findOne({ _id: i.invitado._id }) : null;
        const antesMembresia = activacion ? await Membresia.collection.findOne({ usuario: i.invitado._id }) : null;
        const crear = Aceptacion.create;
        t.mock.method(Aceptacion, 'create', async function (docs, options) {
            assert.ok(options?.session?.inTransaction(), 'Evidencia fuera de la transaccion de activacion');
            await crear.call(this, [docs[0]], options);
            throw Error('Fallo AceptacionLegal deliberado despues de primera fila');
        });
        const r = await pedir('/api/invitaciones/aceptar', { auth: null, method: 'POST', body: { token: i.secreto, contrasena: password,
            legal: entrada({ reglasUso: !activacion, terminosOrganizacion: activacion }) } });
        assert.ok(r.status >= 400, JSON.stringify(r.data)); assert.match(r.data.mensaje, /Fallo AceptacionLegal/);
        assert.equal((await filas()).length, 0);
        assert.equal((await Invitacion.findById(i.doc._id)).estado, 'Pendiente');
        assert.equal((await Invitacion.findById(i.doc._id)).aceptadaEn, undefined);
        if (activacion) {
            assert.deepEqual(await Usuario.collection.findOne({ _id: i.invitado._id }), antesUsuario);
            assert.deepEqual(await Membresia.collection.findOne({ usuario: i.invitado._id }), antesMembresia);
        } else {
            assert.equal(await Usuario.countDocuments({ correo: i.doc.correo }), 0);
            assert.equal(await Membresia.countDocuments({ organizacionId: org._id }), 1);
        }
    });
}

test('usuario existente acepta en organizacion destino en la misma transaccion, sin cargos aunque tenga rol administrador', async () => {
    const otra = await otraOrganizacion(), i = await invitacion({ existente: true, destino: otra, rol: 'Administrador' });
    status(await pedir('/api/usuarios/invitaciones/aceptar', { method: 'POST', body: { token: i.secreto, legal: entrada() } }), 201);
    assert.ok(await Membresia.exists({ usuario: usuario._id, organizacionId: otra._id, rol: 'Administrador' }));
    const rows = await filas(); assert.equal(rows.length, 3);
    evidenciaCompleta(rows, { usuarioId: usuario._id, organizacionId: otra._id, rol: 'Administrador', contexto: 'ACEPTACION_INVITACION_COLABORADOR' });
    assert.ok(rows.every((e) => e.tipoAceptacion !== 'TERMINOS_Y_SUSCRIPCION_ORG'));
});

test('usuario existente: faltan casillas o falla evidencia, conserva invitacion y no deja membresia parcial', async (t) => {
    const otra = await otraOrganizacion(), i = await invitacion({ existente: true, destino: otra });
    for (const legal of [undefined, entrada({ privacidad: false }), entrada({ reglasUso: false })]) {
        status(await pedir('/api/usuarios/invitaciones/aceptar', { method: 'POST', body: { token: i.secreto, legal } }), 400);
        assert.equal((await Invitacion.findById(i.doc._id)).estado, 'Pendiente');
        assert.equal(await Membresia.countDocuments({ organizacionId: otra._id }), 0);
    }
    const crear = Aceptacion.create;
    t.mock.method(Aceptacion, 'create', async function (docs, options) {
        assert.ok(options?.session?.inTransaction()); await crear.call(this, [docs[0]], options);
        throw Error('Fallo AceptacionLegal existente');
    });
    const r = await pedir('/api/usuarios/invitaciones/aceptar', { method: 'POST', body: { token: i.secreto, legal: entrada() } });
    assert.ok(r.status >= 400); assert.match(r.data.mensaje, /Fallo AceptacionLegal/);
    assert.equal((await Invitacion.findById(i.doc._id)).estado, 'Pendiente');
    assert.equal(await Membresia.countDocuments({ organizacionId: otra._id }), 0);
    assert.equal((await filas()).length, 0);
});

test('legado inicia sesion sin evidencia ni bloqueo retroactivo; plan vencido permite legal pero organizacion inactiva no', async () => {
    assert.equal((await filas()).length, 0);
    const login = status(await pedir('/api/usuarios/login', { auth: null, method: 'POST', body: { correo: usuario.correo, contrasena: password } }), 200);
    assert.ok(login.token); assert.equal((await filas()).length, 0);
    const estado = status(await pedir('/api/legal/estado', { auth: login.token }), 200);
    assert.equal(estado.reglasUso, false); assert.equal(estado.privacidad, false); assert.equal(estado.aceptacionComercial, false);
    assert.equal((await filas()).length, 0);
    await Organizacion.updateOne({ _id: org._id }, { $set: { 'plan.estado': 'Suspendido', estadoSuscripcion: 'VENCIDA', fechaProximoVencimiento: new Date(Date.now() - 20 * 86400000) } });
    status(await pedir('/api/legal/estado'), 200);
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: entrada() }), 200);
    status(await pedir('/api/legal/comunicaciones', { method: 'PATCH', body: { otorgado: true, documentos: referencias(), claveIdempotencia: id().toString() } }), 200);
    status(await pedir('/api/animales', { method: 'POST', body: {} }), 403);
    const antes = await filas();
    await Organizacion.updateOne({ _id: org._id }, { $set: { estado: 'Suspendida' } });
    status(await pedir('/api/legal/estado'), 403);
    status(await pedir('/api/legal/aceptaciones', { method: 'POST', body: entrada() }), 403);
    assert.deepEqual(await filas(), antes);
});
