// MongoDB REAL temporal, limitado a loopback. No lee .env ni acepta URI externa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const Trabajo = require('../models/TrabajoProgramado');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { sincronizarCategoriasAnimales, fechaProximoCambioCategoria, filtroCategoriasElegibles, obtenerCategoriaAnimal } = require('../services/categoriaAnimal-service');
const { adquirirBloqueo, iniciarRenovacion, finalizarTrabajo } = require('../services/bloqueoCron-service');

let mongod, uriLocal;
const org = new mongoose.Types.ObjectId(), finca = new mongoose.Types.ObjectId(), otraOrg = new mongoose.Types.ObjectId();
const referencia = new Date('2026-11-05T12:00:00Z');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const enFinca = (fn) => ejecutarConOrganizacion(org, fn, finca);
const fixture = (datos) => ({ _id: new mongoose.Types.ObjectId(), organizacionId: org, fincaId: finca,
    identificadorFinca: new mongoose.Types.ObjectId().toString(), especie: 'Bovino', sexo: 'Hembra', estado: 'Activo',
    categoria: 'Ternera', fechaNacimiento: new Date('2025-10-31'), ...datos });

test.before(async () => {
    const socket = net.createServer(); await new Promise((r) => socket.listen(0, '127.0.0.1', r));
    const port = socket.address().port; await new Promise((r) => socket.close(r));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-cron-categorias-'));
    const exe = process.env.CIERRE_MONGOD || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' : 'mongod');
    mongod = spawn(exe, ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--logpath', path.join(dir, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: 'ignore' });
    let errorArranque; mongod.on('error', (e) => { errorArranque = e; });
    for (let intento = 0; intento < 50; intento++) {
        if (errorArranque) throw errorArranque;
        try { uriLocal = `mongodb://127.0.0.1:${port}/cron_categorias_test`; await mongoose.connect(uriLocal, { serverSelectionTimeoutMS: 300, autoIndex: true }); break; }
        catch (error) { if (intento === 49) throw error; await esperar(100); }
    }
    await Animal.init(); await Trabajo.init();
});
test.beforeEach(async () => { await Animal.collection.deleteMany({}); await Trabajo.collection.deleteMany({}); });
test.after(async () => {
    await mongoose.disconnect();
    if (mongod && mongod.exitCode === null) {
        const terminado = new Promise((r) => mongod.once('exit', r)); mongod.kill(); await terminado;
    }
});

test('Mongo real: catch-up, legado, adultos sellados y exclusion estricta de vendidos/muertos y otros tenants', async () => {
    const atrasada = fixture({ fechaProximoCambioCategoria: new Date('2026-10-31') });
    const legado = fixture({ fechaNacimiento: new Date('2023-01-01') });
    const vendido = fixture({ estado: 'Vendido' }), muerto = fixture({ estado: 'Muerto' });
    const ajeno = fixture({ organizacionId: otraOrg });
    await Animal.collection.insertMany([atrasada, legado, vendido, muerto, ajeno]);
    assert.equal((await enFinca(() => Animal.find(filtroCategoriasElegibles(referencia)).lean())).length, 2, 'La consulta normal encuentra los candidatos');
    const resultado = await enFinca(() => sincronizarCategoriasAnimales(referencia));
    assert.equal(resultado.escaneados, 2); assert.equal(resultado.actualizados, 2);
    const a = await Animal.collection.findOne({ _id: atrasada._id });
    assert.equal(a.categoria, 'Novilla'); assert.equal(a.fechaProximoCambioCategoria.toISOString(), '2027-10-31T00:00:00.000Z');
    const adulta = await Animal.collection.findOne({ _id: legado._id });
    assert.equal(adulta.categoria, 'Vaca'); assert.equal(adulta.fechaProximoCambioCategoria, null);
    for (const original of [vendido, muerto, ajeno]) {
        const despues = await Animal.collection.findOne({ _id: original._id });
        assert.equal(despues.categoria, 'Ternera'); assert.equal(Object.hasOwn(despues, 'fechaProximoCambioCategoria'), false);
        if (despues.estado !== 'Activo') assert.equal(obtenerCategoriaAnimal(despues, referencia), 'Ternera');
    }
    const repetida = await enFinca(() => sincronizarCategoriasAnimales(referencia));
    assert.equal(repetida.escaneados, 0); assert.equal(repetida.actualizados, 0);
});

test('Mongo real: el cursor limita los buffers de escritura a 250 y utiliza el indice de agenda', async (t) => {
    await Animal.collection.insertMany(Array.from({ length: 601 }, () => fixture({})));
    const original = Animal.bulkWrite;
    const tamanos = [];
    t.mock.method(Animal, 'bulkWrite', async function (ops, options) {
        tamanos.push(ops.length); assert.equal(options.ordered, false); return original.call(this, ops, options);
    });
    const resultado = await enFinca(() => sincronizarCategoriasAnimales(referencia));
    assert.equal(resultado.escaneados, 601); assert.deepEqual(tamanos, [250, 250, 101]);
    const explain = await enFinca(() => Animal.find(filtroCategoriasElegibles(referencia)).explain('executionStats'));
    assert.ok(JSON.stringify(explain.queryPlanner.winningPlan).includes('agenda_categoria_activa'));
    assert.ok(!JSON.stringify(explain.queryPlanner.winningPlan).includes('COLLSCAN'));
    assert.equal(explain.executionStats.nReturned, 0);
});

test('Mongo real: campos legados nulos no se confunden con campos ausentes en el filtro optimista', async () => {
    const animal = fixture({ categoria: null, especie: null });
    await Animal.collection.insertOne(animal);
    const resultado = await enFinca(() => sincronizarCategoriasAnimales(referencia));
    assert.equal(resultado.actualizados, 1);
    assert.equal((await Animal.collection.findOne({ _id: animal._id })).categoria, 'Novilla');
    assert.equal((await enFinca(() => sincronizarCategoriasAnimales(referencia))).escaneados, 0);
});

test('Mongo real: el comando de indice es aditivo, idempotente y no altera animales', async () => {
    const animal = fixture({}); await Animal.collection.insertOne(animal);
    await Animal.collection.dropIndex('agenda_categoria_activa');
    const antes = (await Animal.collection.indexes()).map((i) => i.name);
    for (let n = 0; n < 2; n++) {
        const proceso = spawnSync(process.execPath, ['--require', path.resolve(__dirname, '../documentation/cierre-sin-dotenv.cjs'),
            path.resolve(__dirname, '../scripts/crearIndiceCategorias.js')], {
            env: { ...process.env, NODE_ENV: 'test', MONGODB_URI: uriLocal, MONGODB_DB: 'cron_categorias_test', DB_NAME: 'cron_categorias_test' },
            encoding: 'utf8', windowsHide: true, timeout: 15000
        });
        assert.equal(proceso.status, 0, proceso.stdout + proceso.stderr);
        assert.match(proceso.stdout, /agenda_categoria_activa/);
    }
    const despues = (await Animal.collection.indexes()).map((i) => i.name);
    assert.ok(antes.every((nombre) => despues.includes(nombre)));
    assert.equal((await Animal.collection.findOne({ _id: animal._id })).categoria, animal.categoria);
    assert.equal(Object.hasOwn(await Animal.collection.findOne({ _id: animal._id }), 'fechaProximoCambioCategoria'), false);
});

test('Mongo real: vender o corregir el nacimiento durante el cursor no recibe una categoria calculada con datos antiguos', async (t) => {
    const vendido = fixture({}), corregido = fixture({});
    await Animal.collection.insertMany([vendido, corregido]);
    const original = Animal.bulkWrite;
    let primera = true;
    t.mock.method(Animal, 'bulkWrite', async function (ops, options) {
        if (primera) {
            primera = false;
            await Animal.collection.updateOne({ _id: vendido._id }, { $set: { estado: 'Vendido' } });
            await Animal.collection.updateOne({ _id: corregido._id }, { $set: { fechaNacimiento: new Date('2026-10-01') } });
        }
        return original.call(this, ops, options);
    });
    const resultado = await enFinca(() => sincronizarCategoriasAnimales(referencia));
    assert.equal(resultado.actualizados, 0);
    assert.equal((await Animal.collection.findOne({ _id: vendido._id })).categoria, 'Ternera');
    assert.equal((await Animal.collection.findOne({ _id: corregido._id })).categoria, 'Ternera');
});

test('Mongo real: altas y ediciones normales recalculan agenda; bulk externo la invalida sin impedir catch-up', async () => {
    const base = fixture({ fechaNacimiento: new Date('2026-09-01'), especie: 'Porcino', categoria: 'Lechona' });
    const animal = await enFinca(() => Animal.create(base));
    assert.equal(+animal.fechaProximoCambioCategoria, +fechaProximoCambioCategoria(animal));
    await enFinca(() => Animal.findByIdAndUpdate(animal._id, { $set: { fechaNacimiento: new Date('2026-06-01') } }, { runValidators: true }));
    const editado = await Animal.collection.findOne({ _id: animal._id });
    assert.equal(+editado.fechaProximoCambioCategoria, +fechaProximoCambioCategoria(editado));
    await enFinca(() => Animal.bulkWrite([{ updateOne: { filter: { _id: animal._id }, update: { $set: { sexo: 'Macho' } } } }]));
    assert.equal(Object.hasOwn(await Animal.collection.findOne({ _id: animal._id }), 'fechaProximoCambioCategoria'), false);
    const recuperado = await enFinca(() => sincronizarCategoriasAnimales(referencia));
    assert.equal(recuperado.escaneados, 1); assert.equal((await Animal.collection.findOne({ _id: animal._id })).categoria, 'Cerdo joven');
    await enFinca(() => Animal.findByIdAndUpdate(animal._id, { $set: { estado: 'Muerto' } }));
    assert.equal((await Animal.collection.findOne({ _id: animal._id })).fechaProximoCambioCategoria, null);
});

test('Mongo real: insertMany y bulk insert no sellan categorias obsoletas como si fueran correctas', async () => {
    const primera = fixture({ fechaNacimiento: new Date('2020-01-01') }), segunda = fixture({ fechaNacimiento: new Date('2020-01-01') });
    await enFinca(() => Animal.insertMany([primera]));
    await enFinca(() => Animal.bulkWrite([{ insertOne: { document: segunda } }]));
    for (const original of [primera, segunda]) {
        const animal = await Animal.collection.findOne({ _id: original._id });
        assert.equal(animal.categoria, 'Vaca'); assert.equal(animal.fechaProximoCambioCategoria, null);
    }
});

test('Mongo real: heartbeat renueva el token propietario, rechaza otro y libera en finally', async () => {
    const bloqueo = await adquirirBloqueo('lease-test', 'integracion', 10000);
    assert.ok(bloqueo);
    assert.equal(await adquirirBloqueo('lease-test', 'otro', 10000), null);
    const lease = iniciarRenovacion(bloqueo, { intervaloMs: 100 });
    const antes = +bloqueo.bloqueadoHasta;
    try {
        await esperar(150); await lease.comprobar();
        assert.ok(+bloqueo.bloqueadoHasta > antes);
        const intruso = iniciarRenovacion({ ...bloqueo, tokenBloqueo: 'otro' }, { intervaloMs: 1000 });
        try { await intruso.renovar(); await assert.rejects(intruso.comprobar(), { code: 'JOB_LOCK_LOST' }); }
        finally { await intruso.detener(); }
    } finally {
        await lease.detener(); await finalizarTrabajo(bloqueo, { estado: 'Completado' });
    }
    const final = await Trabajo.findOne({ clave: 'lease-test' }).lean();
    assert.equal(final.tokenBloqueo, null); assert.equal(final.bloqueadoHasta, null);
    assert.ok(await adquirirBloqueo('lease-test', 'siguiente', 10000));
});

test('Mongo real: un fallo de categoria en una finca no detiene las otras fincas', async (t) => {
    const Organizacion = require('../models/Organizacion'), Finca = require('../models/Finca');
    const otraFinca = new mongoose.Types.ObjectId();
    await Organizacion.collection.insertOne({ _id: org, nombre: 'Org local', estado: 'Activa', plan: { estado: 'Activo' } });
    await Finca.collection.insertMany([{ _id: finca, organizacionId: org, codigo: 'UNO', estado: 'Activa' }, { _id: otraFinca, organizacionId: org, codigo: 'DOS', estado: 'Activa' }]);
    await Animal.collection.insertMany([fixture({}), fixture({ fincaId: otraFinca })]);
    const servicio = require('../services/categoriaAnimal-service');
    t.mock.method(servicio, 'sincronizarCategoriasAnimales', async (...args) => {
        if (require('../context/organizacion-context').obtenerFincaActual() === String(finca)) throw new Error('Fallo sintetico finca uno');
        return sincronizarCategoriasAnimales(...args);
    });
    const id = require.resolve('../services/categoriasProgramadas-service'); delete require.cache[id];
    t.after(async () => { delete require.cache[id]; await Organizacion.collection.deleteOne({ _id: org }); await Finca.collection.deleteMany({ organizacionId: org }); });
    const resultados = await require(id).procesarCategoriasTodasOrganizaciones({ fechaReferencia: referencia });
    assert.equal(resultados[0].errores.length, 1); assert.equal(resultados[0].actualizados, 1);
    assert.equal((await Animal.collection.findOne({ fincaId: finca })).categoria, 'Ternera');
    assert.equal((await Animal.collection.findOne({ fincaId: otraFinca })).categoria, 'Novilla');
});

test('Mongo real: perder el lock detiene el siguiente lote y no libera al propietario nuevo', async () => {
    const bloqueo = await adquirirBloqueo('perdida', 'integracion', 10000), lease = iniciarRenovacion(bloqueo);
    await Trabajo.updateOne({ clave: 'perdida' }, { $set: { tokenBloqueo: 'nuevo' } });
    try {
        await lease.renovar(); await assert.rejects(lease.comprobar(), { code: 'JOB_LOCK_LOST' });
        await assert.rejects(enFinca(() => sincronizarCategoriasAnimales(referencia, { comprobarBloqueo: lease.comprobar })), { code: 'JOB_LOCK_LOST' });
    } finally { await lease.detener(); await finalizarTrabajo(bloqueo, { estado: 'Error' }); }
    assert.equal((await Trabajo.findOne({ clave: 'perdida' }).lean()).tokenBloqueo, 'nuevo');
});
