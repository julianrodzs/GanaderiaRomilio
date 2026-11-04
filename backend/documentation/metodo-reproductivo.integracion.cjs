/* Replica set local desechable; no carga .env ni accede a datos reales. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose'), { MongoClient } = require('mongodb'), assert = require('node:assert/strict');
const nativeFetch = global.fetch;
let mongod, client, server, base, token, org, finca, usuario;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const scope = (fn) => require('../context/organizacion-context').ejecutarConOrganizacion(org, fn, finca);
const checks = [];
const check = async (n, fn) => { await fn(); checks.push(n); console.log(`PASS ${n}`); };
const req = async (method, ruta, body, status = 200, headers = {}) => {
    const r = await nativeFetch(base + '/api' + ruta, { method, headers: { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const data = await r.json(); assert.equal(r.status, status, `${method} ${ruta}: ${JSON.stringify(data)}`); return data;
};
async function main() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-metodo-'));
    const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    mongod = spawn(process.env.CIERRE_MONGOD || 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe', ['--dbpath', dir, '--port', String(port), '--bind_ip', '127.0.0.1', '--replSet', 'metodoTest', '--logpath', path.join(dir, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: 'ignore' });
    let fallo; mongod.on('error', (e) => { fallo = e; });
    client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 500 });
    for (let i = 0; i < 45; i++) { if (fallo) throw fallo; try { await client.connect(); break; } catch (e) { if (i === 44) throw e; await wait(200); } }
    await client.db('admin').command({ replSetInitiate: { _id: 'metodoTest', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let i = 0; i < 80; i++) { if ((await client.db('admin').command({ hello: 1 })).isWritablePrimary) break; await wait(200); }
    process.env.NODE_ENV = 'test'; process.env.CRON_MODE = 'external'; process.env.JWT_SECRET = 'Metodo-Reproductivo-Local-0123456789-abcdefgh';
    global.fetch = async () => { throw Error('Red externa prohibida.'); };
    await mongoose.connect(`mongodb://127.0.0.1:${port}/metodo_test?replicaSet=metodoTest`);
    const { cargarModelos, verificarModelo } = require('../scripts/sincronizar-indices'); cargarModelos();
    for (const M of Object.values(mongoose.models)) { await M.init(); await verificarModelo(M); }
    const Org = require('../models/Organizacion'), Finca = require('../models/Finca'), User = require('../models/Usuario'), { Membresia } = require('../models/Membresia');
    const Animal = require('../models/Animal'), { RegistroReproductivo: Registro } = require('../models/RegistroReproductivo');
    org = (await Org.create({ nombre: 'Metodo prueba', slug: 'metodo-prueba', plan: { codigo: 'ESENCIAL', estado: 'Activo', especiePlan: 'Bovino' } }))._id;
    finca = (await Finca.create({ organizacionId: org, nombre: 'Principal', codigo: 'PRINCIPAL', estado: 'Activa' }))._id;
    await Org.updateOne({ _id: org }, { $set: { fincaPrincipal: finca } });
    usuario = (await User.create({ nombre: 'Prueba', correo: 'metodo@example.test', contrasena: 'No-real-1234!xx', estado: 'Activo' }))._id;
    await Membresia.create({ organizacionId: org, usuario, rol: 'Administrador', estado: 'Activo', accesoTodasFincas: true, fincas: [finca] });
    token = require('../middleware/auth').generarToken({ id: String(usuario), organizacionId: String(org), tokenVersion: 0 });
    server = await new Promise((resolve) => { const s = require('../app').listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}`;
    const animal = (codigo, sexo = 'Hembra', especie = 'Bovino') => scope(() => Animal.create({ identificadorFinca: codigo, diio: codigo, nombre: codigo, sexo, especie, fechaNacimiento: new Date('2018-01-01'), estado: 'Activo' }));
    const toro = await animal('TORO', 'Macho'), vaca = await animal('VACA'), receptora = await animal('RECEPTORA'), donante = await animal('DONANTE'), desconocida = await animal('DESCONOCIDA');
    const crear = (a, metodo, servicio, otros = {}) => req('POST', '/reproduccion', { animal: String(a._id), especie: a.especie, asignadoA: String(usuario), metodo, ...(servicio ? { servicio: { metodo, ...servicio } } : {}), ...otros }, 201);
    const diagnostico = { fecha: '2026-02-01', resultado: 'PRENADA', metodo: 'ECOGRAFIA', diasGestacionEstimados: 31, claveIdempotencia: 'diag-1' };
    let ciclo, cicloTE;
    await check('servicio no confirma gestacion; diagnostico positivo si e idempotente', async () => {
        ciclo = await crear(vaca, 'IATF', { fechaServicio: '2026-01-01', toroId: String(toro._id), claveIdempotencia: 'servicio-1' });
        assert.equal(ciclo.gestacionConfirmada, false); assert.notEqual(ciclo.estado, 'Gestante');
        ciclo = await req('POST', `/reproduccion/${ciclo._id}/diagnosticos`, diagnostico);
        assert.equal(ciclo.gestacionConfirmada, true); assert.equal(ciclo.estadoAtribucion, 'CONFIRMADA');
        const repetido = await req('POST', `/reproduccion/${ciclo._id}/diagnosticos`, diagnostico); assert.equal(repetido.historialDiagnosticos.length, 1);
    });
    await check('IATF seguida por monta compatible deja origen incierto y padre vacio', async () => {
        ciclo = await req('POST', `/reproduccion/${ciclo._id}/servicios`, { metodo: 'MONTA_NATURAL', submodalidad: 'CONTROLADA', fechaServicio: '2026-01-10', toroId: String(toro._id), claveIdempotencia: 'repaso-1' });
        assert.equal(ciclo.estadoAtribucion, 'INCIERTA'); assert.equal(ciclo.serviciosCandidatos.length, 2);
        await req('POST', `/reproduccion/${ciclo._id}/resultado`, { tipo: 'PARTO', fecha: '2026-10-11' });
        const n = await req('POST', `/reproduccion/${ciclo._id}/ternero`, { diio: 'CRIA-INCIERTA', sexo: 'Hembra' }, 201);
        assert.ok(!(n.ternero || n).padre);
    });
    await check('IATF unica compatible hereda el padre y conserva ambas madres', async () => {
        const v = await animal('VACA-IATF');
        const r = await crear(v, 'IATF', { fechaServicio: '2026-01-01', toroId: String(toro._id) }, { diagnostico, resultado: { tipo: 'PARTO', fecha: '2026-10-11' } });
        const n = await req('POST', `/reproduccion/${r._id}/ternero`, { diio: 'CRIA-CIERTA', sexo: 'Macho' }, 201); const c = n.ternero || n;
        assert.equal(String(c.padre), String(toro._id)); assert.equal(String(c.madreGeneticaId), String(v._id)); assert.equal(String(c.madreGestanteId), String(v._id));
    });
    await check('gestacion desconocida no crea monta y registra parto', async () => {
        const r = await crear(desconocida, 'DESCONOCIDO', null, { diagnostico, resultado: { tipo: 'PARTO', fecha: '2026-10-11' } });
        assert.equal(r.servicios.length, 0); assert.equal(r.estadoAtribucion, 'SIN_SERVICIO'); assert.ok(!r.fechaMonta);
    });
    await check('TE en Esencial cuenta parto de receptora y genetica de donante', async () => {
        cicloTE = await crear(receptora, 'TRANSFERENCIA_EMBRIONES', { fechaServicio: '2026-01-08', toroId: String(toro._id), embrion: { donanteId: String(donante._id), origenEmbrion: 'FIV', estadoEmbrion: 'FRESCO', costo: 200, moneda: 'USD' } }, { diagnostico, resultado: { tipo: 'PARTO', fecha: '2026-10-11' } });
        const n = await req('POST', `/reproduccion/${cicloTE._id}/ternero`, { diio: 'CRIA-TE', sexo: 'Hembra' }, 201); const c = n.ternero || n;
        assert.equal(String(c.madre?._id || c.madre), String(donante._id)); assert.equal(String(c.madreGeneticaId?._id || c.madreGeneticaId), String(donante._id)); assert.equal(String(c.madreGestanteId?._id || c.madreGestanteId), String(receptora._id));
        const p = await req('GET', '/reportes/reproduccion/partos-metodo?metodo=TRANSFERENCIA_EMBRIONES'); assert.equal(p.partos.length, 1); assert.equal(p.partos[0].animal._id, String(receptora._id));
        assert.equal(await scope(() => Registro.countDocuments({ animal: donante._id, fechaPartoReal: { $ne: null } })), 0);
        const resumen = await scope(() => require('../services/genealogiaService').obtenerResumenDescendencia(donante._id)); assert.equal(resumen.totalProgenieGenetica, 1); assert.equal(resumen.totalCriasGestadas, 0);
        const gestante = await scope(() => require('../services/genealogiaService').obtenerResumenDescendencia(receptora._id)); assert.equal(gestante.totalProgenieGenetica, 0); assert.equal(gestante.totalCriasGestadas, 1);
        const arbol = await scope(() => require('../services/genealogiaService').obtenerArbolGenealogico(c._id)); assert.equal(String(arbol.madre.animal._id), String(donante._id));
        const repetido = await req('POST', `/reproduccion/${cicloTE._id}/resultado`, { tipo: 'PARTO', fecha: '2026-10-11' }); assert.equal(repetido.resultado.crias.length, 1);
        await req('DELETE', `/reproduccion/${cicloTE._id}`, undefined, 409);
    });
    await check('reintento concurrente crea un ciclo y eventos una sola vez', async () => {
        const v = await animal('IDEMPOTENTE');
        const cuerpo = { animal: String(v._id), especie: 'Bovino', asignadoA: String(usuario), metodo: 'MONTA_NATURAL', claveIdempotencia: 'registro-concurrente', servicio: { metodo: 'MONTA_NATURAL', fechaServicio: '2026-01-01', claveIdempotencia: 'servicio-concurrente' } };
        const respuestas = await Promise.all([req('POST', '/reproduccion', cuerpo, 201), req('POST', '/reproduccion', cuerpo, 201)]);
        assert.equal(respuestas[0]._id, respuestas[1]._id);
        assert.equal(await scope(() => Registro.countDocuments({ animal: v._id })), 1);
        assert.equal(await scope(() => require('../models/EventoAnimal').countDocuments({ referenciaId: respuestas[0]._id, tipoEvento: 'Monta' })), 1);
    });
    await check('actualizar diagnostico y resultado es atomico y respeta la sesion', async () => {
        const v = await animal('ATOMICA'); const r = await crear(v, 'MONTA_NATURAL', { fechaServicio: '2026-01-01' });
        await req('PUT', `/reproduccion/${r._id}`, { diagnostico, resultado: { tipo: 'INVALIDO', fecha: '2026-10-11' } }, 400);
        assert.equal((await req('GET', `/reproduccion/${r._id}`)).historialDiagnosticos.length, 0);
        const actualizado = await req('PUT', `/reproduccion/${r._id}`, { diagnostico, observaciones: 'Revisado' });
        assert.equal(actualizado.gestacionConfirmada, true); assert.equal(actualizado.historialDiagnosticos.length, 1);
        const perdida = await req('POST', `/reproduccion/${r._id}/resultado`, { tipo: 'PERDIDA_GESTACIONAL', fecha: '2026-02-10' });
        assert.equal(perdida.estadoCiclo, 'Cancelado'); assert.ok(!perdida.fechaPartoEstimada);
        assert.equal(await scope(() => require('../models/Tarea').Tarea.countDocuments({ referenciaId: r._id, estado: { $in: ['Pendiente', 'En proceso'] } })), 0);
    });
    await check('matriz de planes y descenso no oculta historial', async () => {
        for (const codigo of ['ESENCIAL', 'GESTION', 'PRO', 'PREMIUM']) {
            await Org.updateOne({ _id: org }, { $set: { 'plan.codigo': codigo } });
            await req('GET', '/reportes/reproduccion/metodos', undefined, codigo === 'ESENCIAL' ? 403 : 200);
            await req('GET', '/reproduccion/programa-te/colectas', undefined, ['PRO', 'PREMIUM'].includes(codigo) ? 200 : 403);
        }
        await Org.updateOne({ _id: org }, { $set: { 'plan.codigo': 'ESENCIAL' } });
        assert.equal((await req('GET', `/reproduccion/${cicloTE._id}`)).metodo, 'TRANSFERENCIA_EMBRIONES');
    });
    await check('porcinos rechazan IATF y TE por HTTP', async () => {
        const p = await animal('CERDA', 'Hembra', 'Porcino');
        for (const metodo of ['IATF', 'TRANSFERENCIA_EMBRIONES']) await req('POST', '/reproduccion', { animal: String(p._id), especie: 'Porcino', asignadoA: String(usuario), metodo, servicio: { metodo, fechaServicio: '2026-01-01' } }, 400);
    });
    await check('tenant y operadores protegidos', async () => {
        await Org.updateOne({ _id: org }, { $set: { 'plan.codigo': 'GESTION' } });
        await req('POST', `/reproduccion/${cicloTE._id}/atribucion`, { $set: { metodo: 'IATF' } }, 422);
        const f = await Finca.create({ organizacionId: org, nombre: 'Otra', codigo: 'OTRA', estado: 'Activa' });
        await req('POST', `/reproduccion/${cicloTE._id}/atribucion`, { servicioId: cicloTE.servicioAtribuidoId }, 404, { 'X-Finca-Id': String(f._id) });
    });
    await check('migracion dry-run no escribe, aplica dos veces y mantiene partos', async () => {
        await Registro.collection.insertOne({ organizacionId: org, fincaId: finca, animal: vaca._id, especie: 'Bovino', tipoRegistro: 'Monta', fechaMonta: new Date('2024-01-01'), fechaPartoReal: new Date('2024-10-10') });
        await Animal.collection.insertOne({ organizacionId: org, fincaId: finca, identificadorFinca: 'LEGADO', especie: 'Bovino', sexo: 'Hembra', madre: donante._id });
        const migracion = require('../scripts/migrar-metodo-reproductivo'); const antes = await Registro.collection.find({}).toArray();
        const dry = await migracion.ejecutarMigracion(); assert.equal(dry.sinEscrituras, true); assert.deepEqual(await Registro.collection.find({}).toArray(), antes);
        console.log('DRY_RUN_LOCAL ' + JSON.stringify(dry));
        const a = await migracion.ejecutarMigracion({ aplicar: true }); assert.equal(a.ciclosMigrados, 1); assert.equal(a.partosAntes, a.partosDespues);
        const b = await migracion.ejecutarMigracion({ aplicar: true }); assert.equal(b.ciclosMigrados, 0); assert.equal(b.animalesMigrados, 0);
    });
    await check('programa anterior conserva lectura pero no crea inventario paralelo', async () => {
        await Org.updateOne({ _id: org }, { $set: { 'plan.codigo': 'PRO' } });
        const r = await req('POST', '/reproduccion/programa-te/colectas', { nombre: 'Colecta anterior' }, 409);
        assert.equal(r.code, 'TE_ACTUALIZAR_CLIENTE');
        await req('GET', '/reproduccion/programa-te/colectas');
    });
    await check('consolidado Premium respeta fincas autorizadas y no existe en Gestion', async () => {
        await req('GET', '/reportes/multi-finca/metodos-reproductivos', undefined, 403);
        await Org.updateOne({ _id: org }, { $set: { 'plan.codigo': 'PREMIUM' } });
        const reporte = await req('GET', `/reportes/multi-finca/metodos-reproductivos?fincaIds=${finca}`);
        assert.ok(reporte.porMetodo.some((m) => m.partos > 0));
        await req('GET', '/reportes/multi-finca/metodos-reproductivos?fincaIds=000000000000000000000001', undefined, 403);
    });
    console.log(JSON.stringify({ resultado: 'PASS', pruebas: checks.length, modelos: Object.keys(mongoose.models).length }));
}
main().catch((e) => { console.error(e.stack); process.exitCode = 1; }).finally(async () => {
    if (server) await new Promise((r) => server.close(r)); await wait(200); await mongoose.disconnect(); if (client) await client.close();
    if (mongod && mongod.exitCode == null) { const terminado = new Promise((r) => mongod.once('exit', r)); mongod.kill(); await terminado; }
});
