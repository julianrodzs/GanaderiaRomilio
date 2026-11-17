// MongoDB real, efimero y exclusivamente loopback. Sin .env, Atlas, R2 ni correos reales.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const mongoose = require('mongoose'), { MongoClient } = require('mongodb');
const Org = require('../models/Organizacion'), Usuario = require('../models/Usuario'), Finca = require('../models/Finca');
const { Membresia } = require('../models/Membresia'), { Tarea } = require('../models/Tarea');
const Animal = require('../models/Animal'), Pesaje = require('../models/Pesaje'), Movimiento = require('../models/MovimientoFinanciero');
const Notificacion = require('../models/Notificacion'), Archivo = require('../models/ArchivoMultimedia');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { generarToken } = require('../middleware/auth');
const { sumarMovimientosPorMoneda, esMovimientoInversionOperativa } = require('../services/finanzas-calculos-service');
const { obtenerTareasParaRecordatorio, filtroHorizonteAlertas, procesarAlertasTareas } = require('../services/alertasCorreo-service');
const { diasHastaTarea } = require('../services/tarea-integridad-service');
const R2 = require('../services/almacenamientoR2-service');
const id = () => new mongoose.Types.ObjectId(), esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const originalFetch = global.fetch;
let mongo, cliente, carpeta, server, base, org, finca, otraFinca, usuario, animal, token, descargas = 0;
const contexto = (accion, f = finca) => ejecutarConOrganizacion(org._id, accion, f);
const json = (dato) => JSON.parse(JSON.stringify(dato));
const pedir = async (ruta, headers = {}) => {
    const r = await originalFetch(base + ruta, { headers: { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), ...headers } });
    const datos = await r.json(); assert.equal(r.status, 200, JSON.stringify(datos)); return datos;
};
test.before(async () => {
    process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'Rendimiento-Local-0123456789-abcdefghijklmnop'; process.env.EMAIL_ALERTS_ENABLED = 'false';
    global.fetch = async () => { throw Error('Red externa bloqueada'); };
    const s = net.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const puerto = s.address().port; await new Promise((r) => s.close(r));
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-rendimiento-fase1-'));
    mongo = spawn(process.env.CIERRE_MONGOD || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' : 'mongod'), ['--dbpath', carpeta, '--bind_ip', '127.0.0.1', '--port', String(puerto), '--replSet', 'perfFase1', '--logpath', path.join(carpeta, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: 'ignore' });
    let error; mongo.on('error', (e) => { error = e; });
    cliente = new MongoClient(`mongodb://127.0.0.1:${puerto}/?directConnection=true`, { serverSelectionTimeoutMS: 300 });
    for (let n = 0; n < 70; n++) { if (error) throw error; try { await cliente.connect(); break; } catch (e) { if (n === 69) throw e; await esperar(100); } }
    await cliente.db('admin').command({ replSetInitiate: { _id: 'perfFase1', members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } });
    for (let n = 0; n < 100; n++) { if ((await cliente.db('admin').command({ hello: 1 })).isWritablePrimary) break; if (n === 99) throw Error('Sin primario local'); await esperar(100); }
    await mongoose.connect(`mongodb://127.0.0.1:${puerto}/perf_fase1?replicaSet=perfFase1`);
    const original = R2.obtenerImagenR2;
    R2.obtenerImagenR2 = async () => { descargas++; return { Body: Readable.from(Buffer.from('foto')), ContentType: 'image/webp' }; };
    let app; try { app = require('../app'); } finally { R2.obtenerImagenR2 = original; }
    for (const modelo of Object.values(mongoose.models)) await modelo.init();
    server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    await esperar(100); await mongoose.disconnect(); await cliente?.close();
    if (mongo && mongo.exitCode === null && mongo.signalCode === null && mongo.pid) { const fin = new Promise((r) => mongo.once('exit', r)); mongo.kill(); await fin; }
    global.fetch = originalFetch;
    if (carpeta && (mongo?.exitCode !== null || mongo?.signalCode)) {
        assert.equal(path.dirname(path.resolve(carpeta)), path.resolve(os.tmpdir())); assert.match(path.basename(carpeta), /^cir-rendimiento-fase1-/);
        fs.rmSync(carpeta, { recursive: true, force: true });
    }
});
test.beforeEach(async () => {
    for (const modelo of Object.values(mongoose.models)) await modelo.collection.deleteMany({});
    org = await Org.create({ nombre: 'Finca rendimiento', slug: 'rendimiento', estado: 'Activa', plan: { codigo: 'PREMIUM', estado: 'Activo' } });
    finca = id(); otraFinca = id(); usuario = id(); animal = id();
    await Finca.collection.insertMany([finca, otraFinca].map((_id, n) => ({ _id, organizacionId: org._id, codigo: `F${n}`, nombre: `Finca ${n}`, estado: 'Activa', lineasProductivas: [{ especie: 'Bovino', objetivos: ['REPRODUCCION'], activa: true }] })));
    org.fincaPrincipal = finca; await org.save();
    await Usuario.collection.insertOne({ _id: usuario, nombre: 'Admin', correo: 'admin@example.test', estado: 'Activo', tokenVersion: 0 });
    await Membresia.create({ organizacionId: org._id, usuario, rol: 'Administrador', estado: 'Activo', accesoTodasFincas: true, fincas: [finca, otraFinca] });
    token = generarToken({ id: String(usuario), organizacionId: String(org._id), tokenVersion: 0 });
    await Animal.collection.insertOne({ _id: animal, organizacionId: org._id, fincaId: finca, identificadorFinca: '1001', diio: '1001', especie: 'Bovino', sexo: 'Hembra', categoria: 'Vaca', estado: 'Activo', fechaNacimiento: new Date('2020-01-01') });
});

test('listado de pesajes lean e historial conservan JSON, defaults y origen legado', async () => {
    await Pesaje.collection.insertOne({ _id: id(), organizacionId: org._id, fincaId: finca, animal, fecha: new Date('2026-09-01'), peso: 350, tipoPesaje: 'Lote' });
    const antiguo = await contexto(() => Pesaje.find().populate('animal').populate('lote', 'codigo nombre').populate('fincaId', 'nombre codigo').populate('registradoPor', 'nombre apellido correo rol').populate('editadoPor', 'nombre apellido correo rol').sort({ fecha: -1, createdAt: -1, _id: -1 }));
    const actual = await pedir('/api/pesajes'); assert.deepEqual(actual, json(antiguo));
    assert.deepEqual(await pedir(`/api/pesajes/animal/${animal}`), actual);
    assert.equal(actual[0].tipoPesaje, 'REGULAR'); assert.equal(actual[0].origenPesaje, 'Lote');
});

test('finanzas lean conserva ficha anidada y campos de proteccion de movimientos', async () => {
    await Movimiento.collection.insertOne({ _id: id(), organizacionId: org._id, fincaId: finca, animal, fecha: new Date('2026-01-01'), tipoMovimiento: 'Compra', categoria: 'Sal', descripcion: 'Sal', monto: 20, referenciaModelo: 'CompraAnimal' });
    const { presentarMovimientoFinanciero } = require('../services/movimientoFinanciero-proteccion-service');
    const antiguo = await contexto(() => Movimiento.find().populate('potrero').populate('animal').sort({ fecha: -1 }));
    assert.deepEqual(await pedir('/api/finanzas'), json(antiguo.map(presentarMovimientoFinanciero)));
});

test('tareas y notificaciones lean conservan contratos y no exponen idempotencia privada', async () => {
    await Tarea.collection.insertOne({ _id: id(), organizacionId: org._id, fincaId: finca, animal, asignadoA: usuario, creadoPor: usuario, titulo: 'Revisar', tipo: 'Otro', fechaProgramada: new Date('2026-11-14'), operacionesIdempotentes: [{ clave: 'secreto' }] });
    const pops = [{ path: 'asignadoA', select: 'nombre apellido correo rol estado' }, { path: 'creadoPor', select: 'nombre apellido correo rol' }, { path: 'potrero', select: 'codigo nombre area estado pastoPrincipal', populate: { path: 'pastoPrincipal', select: 'nombre cultivar especieBase' } }, { path: 'animal', select: 'diio identificadorFinca nombre sexo estado especie categoria' }, { path: 'lote', select: 'codigo nombre especie proposito etapaOperativa estado' }, { path: 'comentarios.usuario', select: 'nombre apellido correo rol' }];
    const anteriores = await contexto(() => Tarea.find().populate(pops).sort({ fechaProgramada: 1, prioridad: 1 }));
    const actuales = await pedir('/api/tareas'); assert.deepEqual(actuales, json(anteriores)); assert.equal(actuales[0].operacionesIdempotentes, undefined);
    assert.deepEqual(await pedir('/api/tareas/mis-tareas'), actuales);
    await Notificacion.collection.insertOne({ _id: id(), organizacionId: org._id, fincaId: finca, destinatario: usuario, actor: usuario, titulo: 'Aviso', naturaleza: 'Operativa', tipo: 'TAREA', mensaje: 'Prueba' });
    const previo = await contexto(() => Notificacion.find({ destinatario: usuario }).populate('actor', 'nombre apellido correo rol'));
    assert.deepEqual((await pedir('/api/notificaciones')).items, json(previo));
});

test('finanzas de cria preserva acumulado historico por moneda y solo calcula periodo solicitado', async () => {
    const docs = [
        { fecha: '2025-01-01', naturaleza: 'Egreso', tipoMovimiento: 'Inversion', categoria: 'Infraestructura', monto: 100, moneda: 'CRC' },
        { fecha: '2026-01-01', naturaleza: 'Egreso', tipoMovimiento: 'Compra', categoria: 'Maquinaria', monto: 20.25, moneda: 'USD' },
        { fecha: '2026-01-02', naturaleza: 'Egreso', tipoMovimiento: 'Compra de animales', referenciaModelo: 'CompraAnimal', categoria: 'Ganado', monto: 9999, moneda: 'CRC' },
        { fecha: '2026-01-03', naturaleza: 'Egreso', tipoMovimiento: 'Compra', categoria: 'Alimentacion', monto: 25, moneda: 'CRC' },
        { fecha: '2026-01-04', naturaleza: 'Ingreso', tipoMovimiento: 'Venta de animales', categoria: 'Ventas', monto: 70, moneda: 'CRC' },
        { fecha: '2027-01-01', naturaleza: 'Egreso', tipoMovimiento: 'Inversion', categoria: 'Maquinaria', monto: 0.15, moneda: 'CRC' }
    ].map((d) => ({ ...d, _id: id(), fecha: new Date(d.fecha), organizacionId: org._id, fincaId: finca }));
    await Movimiento.collection.insertMany([...docs, { ...docs[0], _id: id(), fincaId: otraFinca, monto: 999999 }]);
    const r = await pedir('/api/reportes/finanzas-cria?fechaInicio=2026-01-01&fechaFin=2026-12-31');
    const esperado = sumarMovimientosPorMoneda(docs, esMovimientoInversionOperativa);
    assert.equal(r.monedas.CRC.inversionOperativaHistorica, Number(esperado.CRC.toFixed(2)));
    assert.equal(r.monedas.USD.inversionOperativaHistorica, esperado.USD);
    assert.equal(r.monedas.CRC.gastosOperativosPeriodo, 25); assert.equal(r.monedas.CRC.ingresosPeriodo, 70); assert.equal(r.monedas.CRC.balanceOperativo, 45);
    assert.equal(r.monedas.USD.gastosOperativosPeriodo, 0); assert.equal(r.monedas.USD.ingresosPeriodo, 0);
});

test('crecimiento agrupa ultimo global igual al algoritmo anterior y conserva detalle del periodo', async (t) => {
    await Pesaje.collection.insertMany([
        ['2026-01-01', 100, finca], ['2026-01-11', 110, finca], ['2026-10-01', 200, otraFinca]
    ].map(([fecha, peso, fincaId]) => ({ _id: id(), organizacionId: org._id, fincaId, animal, fecha: new Date(fecha), peso, tipoPesaje: 'REGULAR' })));
    const ruta = '/api/reportes/crecimiento-pesajes?fechaInicio=2026-01-01&fechaFin=2026-01-31&especie=Bovino';
    const actual = await pedir(ruta);
    t.mock.method(Pesaje, 'aggregate', (pipeline) => ({ option: async (opciones) => {
        const todos = await Pesaje.find(pipeline[0].$match).setOptions(opciones).sort({ fecha: -1, createdAt: -1, _id: -1 }).lean();
        const primeros = new Map(); for (const p of todos) if (!primeros.has(String(p.animal))) primeros.set(String(p.animal), { _id: p.animal, fecha: p.fecha });
        return [...primeros.values()];
    } }));
    assert.deepEqual(actual, await pedir(ruta)); assert.equal(actual.resumen.totalPesajes, 2); assert.equal(actual.evolucion[0].pesoActual, 110);
});

test('horizonte de alertas preserva fechas civiles, instantes, vencidas, precedencia y futuras', async () => {
    const ahora = new Date('2026-11-14T12:00:00Z');
    const fechas = ['2026-10-01T00:00:00Z', '2026-11-21T00:00:00Z', '2026-11-22T05:59:59Z', '2026-11-22T06:00:00Z', '2026-12-01T00:00:00Z'];
    await Tarea.collection.insertMany(fechas.map((fecha, n) => ({ _id: id(), organizacionId: org._id, fincaId: finca, asignadoA: usuario, creadoPor: usuario, titulo: `Tarea ${n}`, tipo: 'Otro', estado: 'Pendiente', fechaProgramada: new Date('2026-10-01'), fechaLimite: new Date(fecha) })));
    for (const zona of ['America/Costa_Rica', 'Pacific/Kiritimati', 'America/New_York']) await contexto(async () => {
        const todas = await Tarea.find({ estado: { $nin: ['Completada', 'Cancelada'] } }).lean();
        const previas = todas.filter((tarea) => diasHastaTarea(tarea.fechaLimite || tarea.fechaProgramada, zona, ahora) <= 7);
        const actuales = await obtenerTareasParaRecordatorio(zona, ahora);
        assert.deepEqual(actuales.map((t) => String(t._id)).sort(), previas.map((t) => String(t._id)).sort());
        const futuras = await Tarea.find({ estado: { $nin: ['Completada', 'Cancelada'] }, ...filtroHorizonteAlertas(zona, true, ahora) }).lean();
        assert.equal(actuales.length + futuras.length, todas.length);
    });
    await contexto(async () => {
        await procesarAlertasTareas({ zonaHoraria: 'America/Costa_Rica' });
        assert.equal(await Notificacion.countDocuments({ tipo: 'TAREA_ASIGNADA' }), fechas.length);
    });
});

test('archivo privado valida tenant y permisos antes del 304 y no accede a R2 en revalidacion', async () => {
    const archivo = id(); await Archivo.collection.insertOne({ _id: archivo, organizacionId: org._id, fincaId: finca, activo: true, visibilidad: 'PRIVADO', clave: 'privada.webp', tamanoBytes: 4, updatedAt: new Date('2026-11-14') });
    const headers = { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), 'Cache-Control': 'max-age=0' };
    const url = base + `/api/archivos/r2/${archivo}`, iniciales = descargas;
    const uno = await originalFetch(url, { headers }); assert.equal(uno.status, 200); await uno.arrayBuffer();
    const dos = await originalFetch(url, { headers: { ...headers, 'If-None-Match': uno.headers.get('etag') } }); assert.equal(dos.status, 304); assert.equal(descargas, iniciales + 1);
    const ajeno = id();
    await Archivo.collection.insertOne({ _id: ajeno, organizacionId: id(), fincaId: finca, activo: true, visibilidad: 'PRIVADO', clave: 'otra-org.webp', tamanoBytes: 4 });
    assert.equal((await originalFetch(base + `/api/archivos/r2/${ajeno}`, { headers: { ...headers, 'If-None-Match': uno.headers.get('etag') } })).status, 404);
    assert.equal(descargas, iniciales + 1);
    await Usuario.updateOne({ _id: usuario }, { $set: { estado: 'Inactivo' } });
    const tres = await originalFetch(url, { headers: { ...headers, 'If-None-Match': uno.headers.get('etag') } }); assert.ok([401, 403].includes(tres.status)); assert.equal(descargas, iniciales + 1);
});
