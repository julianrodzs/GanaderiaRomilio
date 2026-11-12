// Replica set local desechable; no lee .env ni utiliza Atlas o servicios de correo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
require('../models/Usuario');
const Animal = require('../models/Animal');
const Evento = require('../models/EventoAnimal');
const { RegistroReproductivo: Registro } = require('../models/RegistroReproductivo');
const { Tarea } = require('../models/Tarea');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { reprogramarDesteteEstimado, validarFechaDestete } = require('../services/desteteEstimado-service');
const reproduccion = require('../controllers/reproduccionController');
const tareas = require('../controllers/tareaController');
const id = () => new mongoose.Types.ObjectId();
const org = id(), finca = id(), usuario = id();
const contexto = (fn, f = finca) => ejecutarConOrganizacion(org, fn, f);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const puertoLibre = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const respuesta = () => ({ codigo: 200, status(c) { this.codigo = c; return this; }, json(v) { this.body = v; return this; }, set() { return this; } });
let mongo, cliente, directorio, madre, cria, ciclo, tarea;

test.before(async () => {
    process.env.NODE_ENV = 'test'; process.env.EMAIL_ALERTS_ENABLED = 'false';
    const puerto = await puertoLibre(); directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-destete-test-'));
    mongo = spawn(process.env.CIERRE_MONGOD || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' : 'mongod'),
        ['--dbpath', directorio, '--bind_ip', '127.0.0.1', '--port', String(puerto), '--replSet', 'desteteTest', '--logpath', path.join(directorio, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'],
        { windowsHide: true, stdio: 'ignore' });
    let fallo; mongo.on('error', (e) => { fallo = e; });
    cliente = new MongoClient(`mongodb://127.0.0.1:${puerto}/?directConnection=true`, { serverSelectionTimeoutMS: 300 });
    for (let n = 0; n < 70; n++) { if (fallo) throw fallo; try { await cliente.connect(); break; } catch (e) { if (n === 69) throw e; await pausa(100); } }
    await cliente.db('admin').command({ replSetInitiate: { _id: 'desteteTest', members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } });
    for (let n = 0; n < 100; n++) { if ((await cliente.db('admin').command({ hello: 1 })).isWritablePrimary) break; if (n === 99) throw Error('Sin primario local'); await pausa(100); }
    await mongoose.connect(`mongodb://127.0.0.1:${puerto}/destete_test?replicaSet=desteteTest`);
    for (const m of [Animal, Registro, Tarea, Evento]) await m.init();
});
test.after(async () => {
    await mongoose.disconnect(); await cliente?.close();
    if (mongo && mongo.exitCode === null && mongo.pid) { const fin = new Promise((r) => mongo.once('exit', r)); mongo.kill(); await fin; }
    // Solo elimina el directorio sintetico creado arriba, despues de detener su propio mongod.
    if (directorio && mongo?.exitCode !== null) {
        const destino = path.resolve(directorio), temporal = path.resolve(os.tmpdir());
        assert.equal(path.dirname(destino), temporal); assert.match(path.basename(destino), /^cir-destete-test-/);
        fs.rmSync(destino, { recursive: true, force: true });
    }
});
test.beforeEach(async () => contexto(async () => {
    for (const m of [Animal, Registro, Tarea, Evento]) await m.collection.deleteMany({});
    madre = await Animal.create({ identificadorFinca: 'MADRE', diio: '1001', sexo: 'Hembra', especie: 'Bovino' });
    cria = await Animal.create({ identificadorFinca: 'CRIA', diio: '2001', sexo: 'Hembra', especie: 'Bovino', madre: madre._id, madreGestanteId: madre._id, fechaNacimiento: '2026-10-02', fechaDesteteEstimada: '2027-05-02' });
    ciclo = await Registro.create({ animal: madre._id, asignadoA: usuario, especie: 'Bovino', metodo: 'DESCONOCIDO', fechaPartoReal: '2026-10-02', fechaDestete: '2027-05-02', estadoCiclo: 'Cerrado' });
    tarea = await Tarea.create({ titulo: 'Destetar ternera', tipo: 'Reproducción', asignadoA: usuario, creadoPor: usuario, especie: 'Bovino', animal: cria._id, moduloOrigen: 'Reproduccion', referenciaId: ciclo._id, claveAutomatica: 'destete', categoriaAutomatica: 'Reproducción bovina', creadoAutomaticamente: true, fechaProgramada: '2027-05-02', fechaLimite: '2027-05-02' });
}));
const reprogramar = (fecha = '2027-04-02', motivo = 'Condicion corporal favorable') => contexto(() => ejecutarEnTransaccion(async (session) => reprogramarDesteteEstimado({ registro: await Registro.findById(ciclo._id).session(session), fecha, motivo, usuarioId: usuario, session })));
const dia = (v) => v?.toISOString().slice(0, 10);

test('destete: ciclo, cria, tarea existente y bitacoras se actualizan sin registrar destete real', async () => {
    await reprogramar();
    await contexto(async () => {
        assert.equal(dia((await Registro.findById(ciclo._id)).fechaDestete), '2027-04-02');
        const animal = await Animal.findById(cria._id); assert.equal(dia(animal.fechaDesteteEstimada), '2027-04-02'); assert.equal(animal.fechaDestete, undefined);
        const actual = await Tarea.findById(tarea._id); assert.equal(dia(actual.fechaProgramada), '2027-04-02'); assert.equal(actual.estado, 'Pendiente'); assert.equal(await Tarea.countDocuments({ claveAutomatica: 'destete' }), 1);
        const eventos = await Evento.find({ referenciaId: ciclo._id }); assert.equal(eventos.length, 2);
        for (const e of eventos) { assert.equal(e.tipoEvento, 'Observacion'); assert.equal(e.metadata.fechaAnterior, '2027-05-02'); assert.equal(e.metadata.fechaNueva, '2027-04-02'); assert.equal(e.metadata.motivo, 'Condicion corporal favorable'); }
    });
    assert.equal(await reprogramar('2027-04-02', ''), false);
    await contexto(async () => assert.equal(await Evento.countDocuments({ referenciaId: ciclo._id }), 2));
});

test('destete: rechaza fechas imposibles, anteriores al parto, borrar fecha y motivo faltante', async () => {
    for (const f of ['', null, '2027-02-30', '2026-10-01', { $ne: null }]) await assert.rejects(() => reprogramar(f), (e) => e.status === 422);
    await assert.rejects(() => reprogramar('2027-04-02', ''), (e) => e.status === 422);
    assert.throws(() => validarFechaDestete('2027-02-30'));
    await contexto(async () => { assert.equal(dia((await Registro.findById(ciclo._id)).fechaDestete), '2027-05-02'); assert.equal(await Evento.countDocuments({}), 0); });
});

test('destete: no sobrescribe ni reprograma destetes reales o tareas completadas', async () => {
    await contexto(() => Animal.updateOne({ _id: cria._id }, { $set: { fechaDestete: '2027-03-20' } }));
    await assert.rejects(() => reprogramar(), (e) => e.status === 409);
    await contexto(() => Animal.updateOne({ _id: cria._id }, { $unset: { fechaDestete: '' } }));
    await contexto(() => Tarea.updateOne({ _id: tarea._id }, { $set: { estado: 'Completada' } }));
    await assert.rejects(() => reprogramar(), (e) => e.status === 409);
});

test('destete: fallo al escribir evidencia revierte ciclo, cria y tarea', async (t) => {
    t.mock.method(Evento, 'create', async () => { throw Error('Fallo de evidencia simulado'); });
    await assert.rejects(() => reprogramar(), /Fallo de evidencia/);
    await contexto(async () => {
        assert.equal(dia((await Registro.findById(ciclo._id)).fechaDestete), '2027-05-02');
        assert.equal(dia((await Animal.findById(cria._id)).fechaDesteteEstimada), '2027-05-02');
        assert.equal(dia((await Tarea.findById(tarea._id)).fechaProgramada), '2027-05-02');
    });
});

test('destete: TE sincroniza la receptora, no la donante; fincas ajenas no se modifican', async () => {
    let donante;
    await contexto(async () => {
        donante = await Animal.create({ identificadorFinca: 'DONANTE', sexo: 'Hembra', especie: 'Bovino' });
        await Animal.updateOne({ _id: cria._id }, { $set: { madre: donante._id, madreGeneticaId: donante._id } });
    });
    const otraFinca = id();
    await contexto(() => Animal.create({ identificadorFinca: 'OTRA', sexo: 'Hembra', especie: 'Bovino', madreGestanteId: madre._id, fechaNacimiento: '2026-10-02', fechaDesteteEstimada: '2027-05-02' }), otraFinca);
    await reprogramar();
    await contexto(async () => { assert.equal(dia((await Animal.findById(cria._id)).fechaDesteteEstimada), '2027-04-02'); assert.equal(await Evento.countDocuments({ animal: donante._id }), 0); });
    await contexto(async () => assert.equal(dia((await Animal.findOne({ identificadorFinca: 'OTRA' })).fechaDesteteEstimada), '2027-05-02'), otraFinca);
});

test('destete: el controlador nuevo admite el campo y conserva la tarea y el responsable manual', async () => {
    await contexto(() => Tarea.updateOne({ _id: tarea._id }, { $set: { estado: 'En proceso', asignacionModificadaManualmente: true, asignadoA: usuario } }));
    await contexto(async () => {
        const res = respuesta();
        await reproduccion.updateRegistro({ params: { id: String(ciclo._id) }, body: { fechaDestete: '2027-04-02', motivoCambioDestete: 'Se adelanta por condicion' }, usuario: { id: String(usuario), rol: 'Administrador' } }, res);
        assert.equal(res.codigo, 200, JSON.stringify(res.body)); assert.equal(dia(res.body.fechaDestete), '2027-04-02');
        const actual = await Tarea.findById(tarea._id); assert.equal(actual.estado, 'En proceso'); assert.equal(String(actual.asignadoA), String(usuario));
    });
});

test('destete: completar tarea TE utiliza ejecucion real y no la fecha programada', async () => {
    await contexto(async () => {
        await Animal.updateOne({ _id: cria._id }, { $set: { madre: id() } });
        await reprogramar();
        const actual = await Tarea.findById(tarea._id);
        const antes = Date.now(); const res = respuesta();
        await tareas.completarTarea({ params: { id: String(tarea._id) }, body: { versionEsperada: actual.updatedAt.toISOString() }, usuario: { id: String(usuario), rol: 'Administrador' }, get: () => '' }, res);
        assert.equal(res.codigo, 200, JSON.stringify(res.body));
        const animal = await Animal.findById(cria._id); assert.ok(+animal.fechaDestete >= antes && +animal.fechaDestete <= Date.now());
        assert.notEqual(dia(animal.fechaDestete), '2027-04-02');
        await assert.rejects(() => reprogramar('2027-03-20'), (e) => e.status === 409);
    });
});
