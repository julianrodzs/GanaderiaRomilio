// HTTP + MongoDB REAL local desechable; no lee .env, Atlas ni servicios externos.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose'), { MongoClient } = require('mongodb'), bcrypt = require('bcrypt');
const Organizacion = require('../models/Organizacion'), Usuario = require('../models/Usuario'), Finca = require('../models/Finca');
const { Membresia } = require('../models/Membresia');
const Animal = require('../models/Animal'), Pesaje = require('../models/Pesaje'), Evento = require('../models/EventoAnimal');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { generarToken } = require('../middleware/auth');
const { obtenerReportePesoDestete } = require('../services/reportePesoDestete-service');
const id = () => new mongoose.Types.ObjectId(), esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const nativeFetch = global.fetch;
let mongo, cliente, dir, server, base, org, finca, usuario, token, animal, hash;
const contexto = (fn) => ejecutarConOrganizacion(org._id, fn, finca);
const puertoLibre = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const pedir = async (method, ruta, body) => {
    const r = await nativeFetch(base + ruta, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, data: await r.json() };
};
const comprobar = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fecha = (v) => v ? new Date(v).toISOString().slice(0, 10) : null;

test.before(async () => {
    process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'Pesajes-Local-0123456789-abcdefghijklmnop'; process.env.CRON_MODE = 'external'; process.env.EMAIL_ALERTS_ENABLED = 'false';
    global.fetch = async () => { throw Error('Red externa prohibida en prueba de pesajes'); };
    const puerto = await puertoLibre(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-pesajes-tipos-'));
    mongo = spawn(process.env.CIERRE_MONGOD || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' : 'mongod'), ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(puerto), '--replSet', 'pesajesTipos', '--logpath', path.join(dir, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: 'ignore' });
    let fallo; mongo.on('error', (e) => { fallo = e; });
    cliente = new MongoClient(`mongodb://127.0.0.1:${puerto}/?directConnection=true`, { serverSelectionTimeoutMS: 300 });
    for (let n = 0; n < 70; n++) { if (fallo) throw fallo; try { await cliente.connect(); break; } catch (e) { if (n === 69) throw e; await esperar(100); } }
    await cliente.db('admin').command({ replSetInitiate: { _id: 'pesajesTipos', members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } });
    for (let n = 0; n < 100; n++) { if ((await cliente.db('admin').command({ hello: 1 })).isWritablePrimary) break; if (n === 99) throw Error('Sin primario local'); await esperar(100); }
    await mongoose.connect(`mongodb://127.0.0.1:${puerto}/pesajes_tipos?replicaSet=pesajesTipos`);
    const app = require('../app'); for (const m of Object.values(mongoose.models)) await m.init();
    hash = await bcrypt.hash('LocalPesajes!2026', 4);
    server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    await esperar(200); await mongoose.disconnect(); await cliente?.close();
    if (mongo && mongo.exitCode === null && mongo.pid) { const fin = new Promise((r) => mongo.once('exit', r)); mongo.kill(); await fin; }
    global.fetch = nativeFetch;
    if (dir && (mongo?.exitCode !== null || mongo?.signalCode)) { const destino = path.resolve(dir); assert.equal(path.dirname(destino), path.resolve(os.tmpdir())); assert.match(path.basename(destino), /^cir-pesajes-tipos-/); fs.rmSync(destino, { recursive: true, force: true }); }
});
const fixture = async (especie = 'Bovino', extras = {}) => {
    for (const m of Object.values(mongoose.models)) await m.collection.deleteMany({});
    org = await Organizacion.create({ nombre: 'Pesajes Esencial', slug: 'pesajes-esencial', estado: 'Activa', plan: { codigo: 'ESENCIAL', estado: 'Activo', especiePlan: especie } });
    finca = id(); await Finca.collection.insertOne({ _id: finca, organizacionId: org._id, codigo: 'P', nombre: 'Principal', estado: 'Activa', lineasProductivas: [{ especie, objetivos: ['ENGORDE'], activa: true }] });
    org.fincaPrincipal = finca; await org.save();
    usuario = await Usuario.create({ nombre: 'Admin pesajes', correo: 'pesajes@example.test', contrasena: hash, estado: 'Activo' });
    await Membresia.create({ organizacionId: org._id, usuario: usuario._id, rol: 'Administrador', estado: 'Activo', accesoTodasFincas: true, fincas: [finca] });
    token = generarToken({ id: String(usuario._id), organizacionId: String(org._id), tokenVersion: 0 });
    animal = await contexto(() => Animal.create({ identificadorFinca: '1001', diio: '1001', sexo: 'Hembra', especie, fechaNacimiento: '2026-01-01', pesoNacimiento: 30, ...extras }));
};
test.beforeEach(() => fixture());

for (const especie of ['Bovino', 'Porcino']) test(`Esencial ${especie}: DESTETE sincroniza ficha, edad, peso actual, bitacora y reporte sin duplicar`, async () => {
    if (especie === 'Porcino') await fixture(especie);
    const p = comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' }), 201);
    assert.equal(p.tipoPesaje, 'DESTETE');
    await contexto(async () => {
        const a = await Animal.findById(animal._id); assert.equal(a.pesoDestete, 230); assert.equal(fecha(a.fechaDestete), '2026-07-20'); assert.equal(a.edadDesteteDias, 200); assert.equal(a.pesoActual, 230);
        const e = await Evento.findOne({ referenciaId: p._id }); assert.equal(e.tipoEvento, 'Destete'); assert.equal(e.metadata.edadDesteteDias, 200); assert.equal(e.metadata.gdpPredestete, 1);
    });
    const r = comprobar(await pedir('GET', `/api/reportes/destete/peso?especie=${especie}&fechaInicio=2026-01-01&fechaFin=2026-12-31`));
    const resumen = especie === 'Bovino' ? r.basico.bovinos : r.basico.porcinos.individuales;
    assert.equal(resumen.totalDestetados, 1); assert.equal(resumen.detalle[0].pesoDestete, 230);
    comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-21', peso: 240, tipoPesaje: 'DESTETE' }), 409);
});

test('editar, reclasificar y eliminar restaura valores previos y no deja eventos huerfanos', async () => {
    await contexto(() => Animal.updateOne({ _id: animal._id }, { $set: { pesoDestete: 190, fechaDestete: '2026-07-01', edadDesteteDias: 181 } }));
    const p = comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' }), 201);
    comprobar(await pedir('PUT', `/api/pesajes/${p._id}`, { peso: 240, fecha: '2026-07-21' }));
    await contexto(async () => { assert.equal((await Animal.findById(animal._id)).pesoDestete, 240); assert.equal(await Evento.countDocuments({ referenciaId: p._id }), 1); });
    comprobar(await pedir('PUT', `/api/pesajes/${p._id}`, { tipoPesaje: 'REGULAR' }));
    await contexto(async () => { const a = await Animal.findById(animal._id); assert.equal(a.pesoDestete, 190); assert.equal(fecha(a.fechaDestete), '2026-07-01'); assert.equal(a.edadDesteteDias, 181); const e = await Evento.findOne({ referenciaId: p._id }); assert.equal(e.tipoEvento, 'Pesaje'); assert.equal(await Evento.countDocuments({ referenciaId: p._id }), 1); });
    comprobar(await pedir('DELETE', `/api/pesajes/${p._id}`));
    await contexto(async () => assert.equal(await Evento.countDocuments({ referenciaId: p._id }), 0));
});

test('eliminar destete no borra una fecha real corregida manualmente despues del pesaje', async () => {
    const p = comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' }), 201);
    await contexto(() => Animal.updateOne({ _id: animal._id }, { $set: { fechaDestete: '2026-07-22', pesoDestete: 250 } }));
    comprobar(await pedir('DELETE', `/api/pesajes/${p._id}`));
    await contexto(async () => { const a = await Animal.findById(animal._id); assert.equal(a.pesoDestete, 250); assert.equal(fecha(a.fechaDestete), '2026-07-22'); assert.equal(a.edadDesteteDias, 202); });
});

test('nacimiento sincroniza peso y GDP; borrar restaura nacimiento y conserva el pesaje reciente', async () => {
    const d = comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' }), 201);
    const n = comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-01-01', peso: 40, tipoPesaje: 'NACIMIENTO' }), 201);
    await contexto(async () => { const a = await Animal.findById(animal._id); assert.equal(a.pesoNacimiento, 40); assert.equal(a.pesoActual, 230); assert.equal((await Evento.findOne({ referenciaId: d._id })).metadata.gdpPredestete, 0.95); });
    comprobar(await pedir('DELETE', `/api/pesajes/${n._id}`));
    await contexto(async () => { const a = await Animal.findById(animal._id); assert.equal(a.pesoNacimiento, 30); assert.equal(a.pesoActual, 230); });
});

test('regular legado, filtros validos y catalogo cerrado; GDP no inventada sin nacimiento', async () => {
    await contexto(() => Pesaje.collection.insertOne({ animal: animal._id, organizacionId: org._id, fincaId: finca, fecha: new Date('2026-06-01'), peso: 170, tipoPesaje: 'Lote' }));
    const regulares = comprobar(await pedir('GET', '/api/pesajes?tipoPesaje=REGULAR')); assert.equal(regulares.length, 1); assert.equal(regulares[0].tipoPesaje, 'REGULAR'); assert.equal(regulares[0].origenPesaje, 'Lote');
    comprobar(await pedir('PUT', `/api/pesajes/${regulares[0]._id}`, { peso: 175 }));
    comprobar(await pedir('GET', '/api/pesajes?tipoPesaje=INVALIDO'), 422);
    comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, peso: 100, tipoPesaje: 'Individual' }), 422);
    await contexto(() => Animal.updateOne({ _id: animal._id }, { $unset: { fechaNacimiento: '' } }));
    const p = comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' }), 201);
    await contexto(async () => { assert.equal((await Animal.findById(animal._id)).edadDesteteDias, null); assert.equal((await Evento.findOne({ referenciaId: p._id })).metadata.gdpPredestete, null); });
    assert.equal(comprobar(await pedir('GET', '/api/pesajes?tipoPesaje=DESTETE')).length, 1);
});

test('reporte incluye legado sin Pesaje y no suma un mismo animal dos veces', async () => {
    await contexto(() => Animal.updateOne({ _id: animal._id }, { $set: { pesoDestete: 180, fechaDestete: '2026-07-01' } }));
    await contexto(async () => assert.equal((await obtenerReportePesoDestete({ especie: 'Bovino' })).basico.bovinos.totalDestetados, 1));
    comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' }), 201);
    await contexto(async () => { const r = await obtenerReportePesoDestete({ especie: 'Bovino' }); assert.equal(r.basico.bovinos.totalDestetados, 1); assert.equal(r.basico.bovinos.pesos.promedio, 230); });
});

test('fallo de bitacora revierte pesaje y proyecciones; el indice impide concurrencia de destetes', async (t) => {
    const original = Evento.findOneAndUpdate;
    t.mock.method(Evento, 'findOneAndUpdate', () => { throw Error('Fallo simulado de bitacora'); });
    comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' }), 400);
    await contexto(async () => { assert.equal(await Pesaje.countDocuments({}), 0); assert.equal((await Animal.findById(animal._id)).pesoDestete, undefined); });
    Evento.findOneAndUpdate = original;
    const respuestas = await Promise.all([1, 2].map(() => pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' })));
    assert.deepEqual(respuestas.map((r) => r.status).sort(), [201, 409]);
});

test('reportes filtran el tipo y exportan etiquetas legibles en Excel/PDF sin romper los legados', async () => {
    const nacimiento = comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-01-01', peso: 30, tipoPesaje: 'NACIMIENTO' }), 201);
    comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' }), 201);
    comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-08-01', peso: 250, tipoPesaje: 'ENTRADA_ENGORDE' }), 201);
    await Organizacion.updateOne({ _id: org._id }, { $set: { 'plan.codigo': 'GESTION' } });
    const r = comprobar(await pedir('GET', '/api/reportes/crecimiento-pesajes?tipoPesaje=NACIMIENTO&especie=Bovino'));
    assert.equal(r.resumen.totalPesajes, 1); assert.equal(r.detalle[0]._id, nacimiento._id); assert.equal(r.detalle[0].tipoPesaje, 'NACIMIENTO');
    comprobar(await pedir('GET', '/api/reportes/crecimiento-pesajes?tipoPesaje=OTRO'), 422);
    for (const formato of ['xlsx', 'pdf']) {
        const respuesta = await nativeFetch(`${base}/api/pesajes/exportar?tipoPesaje=ENTRADA_ENGORDE&formato=${formato}`, { headers: { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca) } });
        assert.equal(respuesta.status, 200); const buffer = Buffer.from(await respuesta.arrayBuffer());
        if (formato === 'xlsx') {
            const XLSX = require('xlsx'), libro = XLSX.read(buffer, { type: 'buffer' });
            const filas = XLSX.utils.sheet_to_json(libro.Sheets.Pesajes); assert.equal(filas.length, 1); assert.equal(filas[0]['Tipo de pesaje'], 'Entrada a engorde');
        } else assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
    }
});

test('reasignar un hito limpia la proyeccion anterior y nunca mezcla fincas u organizaciones', async () => {
    const otro = await contexto(() => Animal.create({ identificadorFinca: '2002', sexo: 'Macho', especie: 'Bovino', fechaNacimiento: '2026-01-01' }));
    const p = comprobar(await pedir('POST', '/api/pesajes', { animal: animal._id, fecha: '2026-07-20', peso: 230, tipoPesaje: 'DESTETE' }), 201);
    comprobar(await pedir('PUT', `/api/pesajes/${p._id}`, { animal: otro._id }));
    await contexto(async () => { assert.equal((await Animal.findById(animal._id)).pesoDestete, null); assert.equal((await Animal.findById(otro._id)).pesoDestete, 230); assert.equal(await Evento.countDocuments({ referenciaId: p._id, animal: animal._id }), 0); });
    let ajeno;
    await ejecutarConOrganizacion(id(), async () => { ajeno = await Animal.create({ identificadorFinca: 'AJENO', sexo: 'Hembra', especie: 'Bovino' }); }, id());
    comprobar(await pedir('PUT', `/api/pesajes/${p._id}`, { animal: ajeno._id }), 404);
    await contexto(async () => assert.equal((await Animal.findById(otro._id)).pesoDestete, 230));
});

test('pesaje de lote tipificado sincroniza cada cria y reclasificar no borra el evento grupal', async () => {
    let lote, otro;
    await contexto(async () => {
        lote = await require('../models/Lote').create({ codigo: 'L1', nombre: 'Grupo de prueba', especie: 'Bovino', proposito: 'ENGORDE', fechaInicio: '2026-01-01' });
        otro = await Animal.create({ identificadorFinca: '2002', sexo: 'Macho', especie: 'Bovino', fechaNacimiento: '2026-01-01' });
        for (const a of [animal, otro]) {
            await require('../models/PertenenciaLote').create({ animal: a._id, lote: lote._id, fechaEntrada: '2026-01-01', activo: true });
            await Animal.updateOne({ _id: a._id }, { $set: { loteActual: lote._id } });
        }
    });
    comprobar(await pedir('POST', `/api/lotes/${lote._id}/pesajes`, { fecha: '2026-07-20', tipoPesaje: 'DESTETE', pesajes: [{ animal: animal._id, peso: 230 }, { animal: otro._id, peso: 240 }] }), 201);
    let p;
    await contexto(async () => {
        assert.equal((await Animal.findById(otro._id)).pesoDestete, 240);
        p = await Pesaje.findOne({ animal: animal._id }); assert.equal(p.origenPesaje, 'Lote');
        assert.equal(await require('../models/EventoLote').countDocuments({ 'metadata.pesajes': p._id }), 1);
    });
    comprobar(await pedir('PUT', `/api/pesajes/${p._id}`, { tipoPesaje: 'REGULAR' }));
    await contexto(async () => assert.equal(await require('../models/EventoLote').countDocuments({ 'metadata.pesajes': p._id }), 1));
});
