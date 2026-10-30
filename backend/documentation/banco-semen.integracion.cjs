/* MongoDB 8 real, replica set temporal, sin .env ni acceso a servicios externos. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let child, client, server, base, token, org, finca, usuario;
const resultados = [];
const originalFetch = global.fetch;
const ids = () => new mongoose.Types.ObjectId();
const check = async (nombre, fn) => { await fn(); resultados.push(nombre); console.log(`PASS ${nombre}`); };
const scope = (fn) => require('../context/organizacion-context').ejecutarConOrganizacion(org, fn, finca);
const request = async (method, ruta, body, status = 200, headers = {}) => {
    const r = await originalFetch(base + '/api' + ruta, { method, headers: { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const data = await r.json(); assert.equal(r.status, status, `${method} ${ruta}: ${JSON.stringify(data)}`); return data;
};
async function main() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-banco-semen-'));
    const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    child = spawn(process.env.CIERRE_MONGOD || 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe', ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', 'bancoTest', '--logpath', path.join(dir, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: 'ignore' });
    let spawnError; child.on('error', (e) => { spawnError = e; });
    client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 600 });
    for (let n = 0; n < 40; n++) { if (spawnError) throw spawnError; try { await client.connect(); break; } catch (e) { if (n === 39) throw e; await wait(200); } }
    await client.db('admin').command({ replSetInitiate: { _id: 'bancoTest', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let n = 0; n < 80; n++) { if ((await client.db('admin').command({ hello: 1 })).isWritablePrimary) break; if (n === 79) throw Error('No hay primario'); await wait(200); }
    process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'Banco-Semen-Local-0123456789-abcdefghijkl'; process.env.CRON_MODE = 'external';
    global.fetch = async () => { throw Error('Prohibida red externa en integracion'); };
    await mongoose.connect(`mongodb://127.0.0.1:${port}/banco_test?replicaSet=bancoTest`);
    const { cargarModelos, verificarModelo } = require('../scripts/sincronizar-indices'); cargarModelos();
    for (const M of Object.values(mongoose.models)) { await M.init(); await verificarModelo(M); }
    const { BancoSemen: B, MovimientoSemen: M, VentaPajilla: V, LoteSemen: L, AsignacionSemenCampana: A } = require('../models/BancoSemen');
    const Org = require('../models/Organizacion'), Finca = require('../models/Finca'), Usuario = require('../models/Usuario'), { Membresia } = require('../models/Membresia');
    const Campana = require('../models/CampanaIATF'), { PlantillaProtocoloIATF: Plantilla } = require('../models/PlantillaProtocoloIATF');
    const Mov = require('../models/MovimientoFinanciero');
    const o = await Org.create({ nombre: 'Banco prueba', slug: 'banco-prueba', plan: { codigo: 'PRO', estado: 'Activo' } }); org = o._id;
    const f = await Finca.create({ organizacionId: org, nombre: 'Principal', codigo: 'PRINCIPAL', estado: 'Activa' }); finca = f._id;
    o.fincaPrincipal = finca; await o.save();
    const u = await Usuario.create({ nombre: 'Prueba', correo: 'banco@example.test', contrasena: 'no-es-una-clave-real', estado: 'Activo' }); usuario = u._id;
    await Membresia.create({ organizacionId: org, usuario, rol: 'Administrador', estado: 'Activo', accesoTodasFincas: true, fincas: [finca] });
    token = require('../middleware/auth').generarToken({ id: String(usuario), organizacionId: String(org), tokenVersion: 0 });
    server = await new Promise((r) => { const s = require('../app').listen(0, '127.0.0.1', () => r(s)); }); base = `http://127.0.0.1:${server.address().port}`;
    let fichaA, fichaB, campana;
    const nuevaCampana = () => scope(async () => {
        const plantilla = await Plantilla.create({ nombre: 'Protocolo prueba', pasos: [{ nombre: 'IATF', tipoAccion: 'IATF', offsetHoras: 0 }], creadoPor: usuario });
        return Campana.create({ nombre: 'Campana prueba', protocolo: plantilla._id, protocoloVersion: 1, protocoloSnapshot: plantilla.toObject(), responsable: usuario, fechaHoraInicio: new Date(), participantes: [] });
    });
    await check('entrada 50 dividida 30/20, agrupacion e idempotencia', async () => {
        const body = { esExterno: true, nombreSemental: 'Toro A', diio: 'A-100', especie: 'Bovino', origen: 'COMPRA', cantidad: 50, destino: 'DIVIDIR', cantidadReproductiva: 30, cantidadComercial: 20, costoUnitario: 100, moneda: 'CRC', claveIdempotencia: 'entrada-a' };
        fichaA = (await request('POST', '/semen/entradas', body, 201)).ficha;
        await request('POST', '/semen/entradas', body, 201);
        await request('POST', '/semen/entradas', { ...body, cantidad: 10, destino: 'TODO_REPRODUCTIVO', claveIdempotencia: 'entrada-a-2' }, 201);
        const f = (await request('GET', `/semen/${fichaA._id}`)).ficha;
        assert.equal(f.totalIngresado, 60); assert.equal(f.stockReproductivo, 40); assert.equal(f.stockComercial, 20);
        assert.equal(await scope(() => B.countDocuments({})), 1); assert.equal(await scope(() => Mov.countDocuments({})), 0);
        fichaB = (await request('POST', '/semen/entradas', { ...body, diio: 'B-200', nombreSemental: 'Toro B', cantidad: 4, destino: 'TODO_REPRODUCTIVO', claveIdempotencia: 'entrada-b' }, 201)).ficha;
    });
    await check('asignacion multitoro todo o nada y sin usar comercial', async () => {
        campana = await nuevaCampana();
        await request('POST', `/iatf/campanas/${campana._id}/semen`, { asignaciones: [{ fichaSemenId: fichaA._id, cantidad: 5, moneda: 'CRC' }, { fichaSemenId: fichaB._id, cantidad: 2, moneda: 'CRC' }] }, 201);
        await request('POST', `/iatf/campanas/${campana._id}/semen`, { asignaciones: [{ fichaSemenId: fichaA._id, cantidad: 2, moneda: 'CRC' }, { fichaSemenId: fichaB._id, cantidad: 100, moneda: 'CRC' }] }, 400);
        const a = (await request('GET', `/semen/${fichaA._id}`)).ficha; assert.equal(a.stockReproductivo, 35); assert.equal(a.stockComercial, 20); assert.equal(a.asignadoCampanas, 5);
    });
    await check('consumo reservado, costo fijo y anulacion al origen', async () => {
        const { consumirDelBanco, revertirConsumo } = require('../services/bancoSemen-service');
        const { ejecutarEnTransaccion: tx } = require('../services/mongo-transaccion-service');
        const uso = await scope(() => tx((session) => consumirDelBanco({ semenId: fichaA._id, cantidad: 2, campanaId: campana._id, especie: 'Bovino', usuarioId: usuario, session })));
        assert.equal(uso.snapshot.costoUnitario, 100); assert.equal(uso.snapshot.codigoToro, 'A-100');
        await scope(() => tx((session) => revertirConsumo({ eventoId: uso.eventoId, motivo: 'Prueba anulacion', usuarioId: usuario, session })));
        const f = (await request('GET', `/semen/${fichaA._id}`)).ficha; assert.equal(f.totalUsadasIATF, 0); assert.equal(f.asignadoCampanas, 5);
        await assert.rejects(scope(() => tx((session) => revertirConsumo({ eventoId: uso.eventoId, motivo: 'Otra vez', usuarioId: usuario, session }))), /anulada/);
    });
    await check('cierre devuelve todos los sobrantes', async () => {
        await request('POST', `/iatf/campanas/${campana._id}/finalizar`, {});
        const f = (await request('GET', `/semen/${fichaA._id}`)).ficha; assert.equal(f.stockReproductivo, 40); assert.equal(f.asignadoCampanas, 0);
        await request('POST', `/iatf/campanas/${campana._id}/semen`, [{ fichaSemenId: fichaA._id, cantidad: 1, moneda: 'CRC' }], 409);
    });
    await check('venta USD de stock CRC y anulacion financiera sin borrar', async () => {
        const v = await request('POST', '/ventas/pajillas', { fichaSemenId: fichaA._id, cantidad: 3, comprador: 'Comprador prueba', precioUnitario: 30, moneda: 'USD' }, 201);
        assert.equal(v.montoTotal, 90); assert.equal(v.monedaCosto, 'CRC');
        await request('POST', `/ventas/pajillas/${v._id}/anular`, { motivo: 'Venta de prueba' });
        await request('POST', `/ventas/pajillas/${v._id}/anular`, { motivo: 'Repetida' }, 400);
        const rows = await scope(() => Mov.find({ referenciaId: v._id }).lean());
        assert.equal(rows.length, 2); assert.equal(rows.reduce((n, m) => n + (m.naturaleza === 'Ingreso' ? 1 : -1) * m.monto, 0), 0);
        assert.equal((await request('GET', `/semen/${fichaA._id}`)).ficha.stockComercial, 20);
        assert.equal((await request('GET', '/ventas/pajillas/resumen')).USD, 0);
    });
    await check('concurrencia de ventas no permite sobregiro', async () => {
        const payload = { fichaSemenId: fichaA._id, cantidad: 15, comprador: 'Concurrente', precioUnitario: 10, moneda: 'CRC' };
        const responses = await Promise.all([0, 1].map(() => originalFetch(base + '/api/ventas/pajillas', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })));
        assert.deepEqual(responses.map((r) => r.status).sort(), [201, 400]);
        assert.equal((await request('GET', `/semen/${fichaA._id}`)).ficha.stockComercial, 5);
    });
    await check('rollback si falla el ingreso financiero', async () => {
        const original = Mov.create; const antes = await scope(() => V.countDocuments({}));
        Mov.create = async () => { throw Error('Fallo financiero provocado'); };
        try { await request('POST', '/ventas/pajillas', { fichaSemenId: fichaA._id, cantidad: 1, comprador: 'Rollback', precioUnitario: 10, moneda: 'CRC' }, 500); } finally { Mov.create = original; }
        assert.equal(await scope(() => V.countDocuments({})), antes); assert.equal((await request('GET', `/semen/${fichaA._id}`)).ficha.stockComercial, 5);
    });
    await check('motivos, ajustes y separacion de gavetas', async () => {
        await request('POST', `/semen/${fichaA._id}/traslados`, { direccion: 'REPRODUCTIVO_A_COMERCIAL', cantidad: 2, moneda: 'CRC' }, 400);
        await request('POST', `/semen/${fichaA._id}/traslados`, { direccion: 'REPRODUCTIVO_A_COMERCIAL', cantidad: 2, moneda: 'CRC', motivo: 'Para venta' });
        await request('POST', `/semen/${fichaA._id}/ajustes`, { gaveta: 'COMERCIAL', operacion: 'MERMA', cantidad: 1, moneda: 'CRC', motivo: 'Rotura' });
        const f = (await request('GET', `/semen/${fichaA._id}`)).ficha; assert.equal(f.stockComercial, 6); assert.equal(f.stockReproductivo, 38); assert.equal(f.totalMermas, 1);
        await scope(async () => { const m = await M.findOne({}); await assert.rejects(M.updateOne({ _id: m._id }, { $set: { cantidad: 999 } }), /inmutables/); });
    });
    await check('planes Esencial y Gestion deniegan; Pro y Premium permiten', async () => {
        for (const codigo of ['ESENCIAL', 'GESTION', 'PRO', 'PREMIUM']) {
            await Org.updateOne({ _id: org }, { $set: { 'plan.codigo': codigo, 'plan.especiePlan': codigo === 'ESENCIAL' ? 'Bovino' : null } });
            await request('GET', '/semen', undefined, ['PRO', 'PREMIUM'].includes(codigo) ? 200 : 403);
            await request('GET', '/ventas/pajillas', undefined, ['PRO', 'PREMIUM'].includes(codigo) ? 200 : 403);
        }
        await Org.updateOne({ _id: org }, { $set: { 'plan.estado': 'Suspendido' } }); await request('GET', '/semen', undefined, 403);
        await Org.updateOne({ _id: org }, { $set: { 'plan.estado': 'Activo' } });
    });
    await check('aislamiento de finca y rechazo de inyeccion', async () => {
        const otra = await Finca.create({ organizacionId: org, nombre: 'Otra', codigo: 'OTRA', estado: 'Activa' });
        assert.deepEqual(await request('GET', '/semen', undefined, 200, { 'X-Finca-Id': String(otra._id) }), []);
        await request('GET', `/semen/${fichaA._id}`, undefined, 404, { 'X-Finca-Id': String(otra._id) });
        await request('POST', '/semen/entradas', { '$set': { stockComercial: 1000 } }, 422);
    });
    await check('migracion dry-run sin escrituras, repetible y costos historicos estables', async () => {
        const { InsumoReproductivo } = require('../models/InsumoReproductivo');
        const legado = await scope(() => InsumoReproductivo.create({ nombre: 'Legado', categoria: 'SEMEN', unidad: 'UNIDAD', cantidadDisponible: 7, costoUnitario: 50, moneda: 'USD', codigoToro: 'LEGADO' }));
        const antigua = await nuevaCampana();
        await scope(async () => { antigua.participantes.push({ animal: ids(), fechaInseminacion: new Date(), estadoParticipacion: 'INSEMINADA', semenUtilizado: legado._id, semenSnapshot: { cantidad: 2, costoUnitario: 7, moneda: 'USD' } }); await antigua.save(); });
        assert.equal((await request('GET', `/iatf/campanas/${antigua._id}`)).metricas.costosPorMoneda.USD, 14);
        await scope(() => InsumoReproductivo.create({ nombre: 'Hormona', categoria: 'HORMONA_REPRODUCTIVA', unidad: 'ML', cantidadDisponible: 25 }));
        const { ejecutarMigracion } = require('../scripts/migrar-banco-semen');
        const antes = await M.collection.countDocuments({});
        const dry = await ejecutarMigracion(); assert.equal(dry.pendientes, 1); assert.equal(await M.collection.countDocuments({}), antes);
        const aplicada = await ejecutarMigracion({ aplicar: true }); assert.equal(aplicada.discrepancias.length, 0); assert.equal(aplicada.migradas, 1);
        assert.equal((await request('GET', `/iatf/campanas/${antigua._id}`)).metricas.costosPorMoneda.USD, 14);
        const count = await L.collection.countDocuments({}); const repetida = await ejecutarMigracion({ aplicar: true }); assert.equal(repetida.migradas, 0); assert.equal(await L.collection.countDocuments({}), count);
        assert.equal(await scope(() => InsumoReproductivo.countDocuments({ categoria: 'HORMONA_REPRODUCTIVA', cantidadDisponible: 25 })), 1);
    });
    await check('inseminacion IATF HTTP con toro interno y anulacion transaccional', async () => {
        const Animal = require('../models/Animal'), Paso = require('../models/EjecucionPasoIATF');
        const toro = ids(), hembra = ids();
        await Animal.collection.insertMany([
            { _id: toro, organizacionId: org, fincaId: finca, sexo: 'Macho', especie: 'Bovino', estado: 'Activo', diio: 'TORO-INTERNO', identificadorFinca: 'TORO-INTERNO', nombre: 'Semental interno', raza: 'Brahman', fechaNacimiento: new Date('2020-01-01') },
            { _id: hembra, organizacionId: org, fincaId: finca, sexo: 'Hembra', especie: 'Bovino', estado: 'Activo', diio: 'HEMBRA-IATF', identificadorFinca: 'HEMBRA-IATF', categoria: 'Vaca', fechaNacimiento: new Date('2020-01-01') }
        ]);
        const ficha = (await request('POST', '/semen/entradas', { toroId: String(toro), cantidad: 10, origen: 'COLECTA_PROPIA', destino: 'TODO_REPRODUCTIVO', costoUnitario: 9, moneda: 'USD' }, 201)).ficha;
        assert.equal(ficha.diio, 'TORO-INTERNO'); assert.equal(ficha.esExterno, false);
        const c = await nuevaCampana();
        await scope(async () => { c.participantes.push({ animal: hembra, estadoParticipacion: 'PROTOCOLO_COMPLETADO' }); await c.save(); await Paso.create({ campana: c._id, pasoPlantilla: c.protocoloSnapshot.pasos[0]._id, pasoSnapshot: c.protocoloSnapshot.pasos[0], fechaHoraProgramada: new Date(), animalesAplicados: [hembra], estado: 'PARCIAL' }); });
        await request('POST', `/iatf/campanas/${c._id}/semen`, [{ fichaSemenId: ficha._id, cantidad: 3, moneda: 'USD' }], 201);
        const respuesta = await request('POST', `/iatf/campanas/${c._id}/inseminaciones`, { inseminaciones: [{ participanteId: String(c.participantes[0]._id), semen: ficha._id, moneda: 'USD' }] });
        assert.equal(respuesta.participantes[0].semenSnapshot.toroId, String(toro)); assert.equal(respuesta.metricas.costosPorMoneda.USD, 9);
        await request('POST', `/iatf/campanas/${c._id}/inseminaciones/${c.participantes[0]._id}/anular`, { motivo: 'Registro de prueba incorrecto' });
        const final = (await request('GET', `/semen/${ficha._id}`)).ficha;
        assert.equal(final.asignadoCampanas, 3); assert.equal(final.totalUsadasIATF, 0);
        const repetida = await request('POST', `/iatf/campanas/${c._id}/inseminaciones`, { inseminaciones: [{ participanteId: String(c.participantes[0]._id), semen: ficha._id, moneda: 'USD' }] });
        const cicloId = repetida.participantes[0].registroReproductivo;
        await scope(async () => { const { RegistroReproductivo } = require('../models/RegistroReproductivo'); const ciclo = await RegistroReproductivo.findById(cicloId); ciclo.fechaPartoReal = new Date(); await ciclo.save(); });
        const nacimiento = await request('POST', `/reproduccion/${cicloId}/ternero`, { diio: 'CRIA-IATF', sexo: 'Macho', pesoNacimiento: 30 }, 201);
        const cria = nacimiento.ternero || nacimiento;
        assert.equal(String(cria.padre?._id || cria.padre), String(toro));
    });
    await check('asignaciones simultaneas y cierre concurrente no atrapan saldos', async () => {
        const c = await nuevaCampana();
        const body = { asignaciones: [{ fichaSemenId: fichaB._id, cantidad: 3, moneda: 'CRC' }] };
        const results = await Promise.all([0, 1].map(async () => { const r = await originalFetch(base + `/api/iatf/campanas/${c._id}/semen`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.status; }));
        assert.deepEqual(results.sort(), [201, 400]);
        await request('POST', `/iatf/campanas/${c._id}/finalizar`, {});
        assert.equal((await request('GET', `/semen/${fichaB._id}`)).ficha.asignadoCampanas, 0);
        const c2 = await nuevaCampana();
        const [asignar, cerrar] = await Promise.all([
            originalFetch(base + `/api/iatf/campanas/${c2._id}/semen`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Finca-Id': String(finca), 'Content-Type': 'application/json' }, body: JSON.stringify({ asignaciones: [{ fichaSemenId: fichaB._id, cantidad: 1, moneda: 'CRC' }] }) }),
            request('POST', `/iatf/campanas/${c2._id}/finalizar`, {})
        ]);
        assert.ok([201, 409].includes(asignar.status)); assert.ok(cerrar);
        assert.equal((await request('GET', `/semen/${fichaB._id}`)).ficha.asignadoCampanas, 0);
    });
    await check('invariantes finales e indices intactos en MongoDB 8', async () => {
        for (const f of await scope(() => B.find({}))) require('../services/bancoSemen-service').comprobarInvariante(f);
        for (const M of Object.values(mongoose.models)) await verificarModelo(M);
        assert.match((await mongoose.connection.db.admin().command({ buildInfo: 1 })).version, /^8\./);
        assert.ok(await scope(() => A.countDocuments({}))); assert.ok(await scope(() => M.countDocuments({})));
    });
    await check('roles comerciales no administran el banco y no hay sobreventa usando reproductivo', async () => {
        await Membresia.updateOne({ organizacionId: org, usuario }, { $set: { rol: 'Contador' } });
        await request('GET', '/semen', undefined, 403); await request('GET', '/ventas/pajillas');
        await request('POST', '/ventas/pajillas', { fichaSemenId: fichaA._id, cantidad: 1, precioUnitario: 1, moneda: 'CRC', comprador: 'Prueba' }, 403);
        await Membresia.updateOne({ organizacionId: org, usuario }, { $set: { rol: 'Administrador' } });
        await request('POST', '/ventas/pajillas', { fichaSemenId: fichaA._id, cantidad: 20, precioUnitario: 1, moneda: 'CRC', comprador: 'Prueba' }, 400);
        const f = (await request('GET', `/semen/${fichaA._id}`)).ficha; assert.equal(f.stockReproductivo, 38);
    });
    await check('banda porcina: rollback grupal y anulacion individual sin devolver el consumo ajeno', async () => {
        const Animal = require('../models/Animal'), Banda = require('../models/BandaReproductivaPorcina');
        const { RegistroReproductivo: Registro } = require('../models/RegistroReproductivo');
        const hembras = [ids(), ids()], pasoId = ids();
        await Animal.collection.insertMany(hembras.map((id, i) => ({ _id: id, organizacionId: org, fincaId: finca, especie: 'Porcino', sexo: 'Hembra', estado: 'Activo', diio: `CERDA-${i}`, identificadorFinca: `CERDA-${i}`, fechaNacimiento: new Date('2023-01-01') })));
        const ficha = (await request('POST', '/semen/entradas', { esExterno: true, nombreSemental: 'Verraco prueba', diio: 'VERRACO', especie: 'Porcino', origen: 'COMPRA', cantidad: 3, destino: 'TODO_REPRODUCTIVO', costoUnitario: 10, moneda: 'CRC' }, 201)).ficha;
        const paso = { _id: pasoId, nombre: 'IA prueba', tipoAccion: 'INSEMINACION', referenciaTemporal: 'DESDE_INICIO', offsetHoras: 0, generaTarea: false };
        const banda = await scope(() => Banda.create({ nombre: 'Banda prueba', protocolo: ids(), protocoloVersion: 1, protocoloSnapshot: { pasos: [paso] }, fechaInicio: new Date(), responsable: usuario, creadoPor: usuario, participantes: hembras.map((animal) => ({ animal })), ejecuciones: [{ pasoId, nombre: paso.nombre, tipoAccion: paso.tipoAccion, fechaProgramada: new Date() }] }));
        const ruta = `/protocolos-porcinos/bandas/${banda._id}/pasos/${banda.ejecuciones[0]._id}/ejecutar`;
        const body = { semenUtilizado: `${ficha._id}|CRC`, cantidadPajuelas: 2, fechaReal: new Date().toISOString() };
        await request('POST', ruta, body, 400);
        assert.equal((await request('GET', `/semen/${ficha._id}`)).ficha.stockReproductivo, 3);
        assert.equal(await scope(() => Registro.countDocuments({ animal: { $in: hembras } })), 0);
        await request('POST', '/semen/entradas', { fichaSemenId: ficha._id, origen: 'COMPRA', cantidad: 1, destino: 'TODO_REPRODUCTIVO', costoUnitario: 10, moneda: 'CRC' }, 201);
        const aplicada = await request('POST', ruta, body);
        const registros = await scope(() => Registro.find({ animal: { $in: hembras } }).lean());
        assert.equal(new Set(registros.map((r) => String(r.semenSnapshot.consumoSemenId))).size, 2);
        await request('POST', `/reproduccion/${aplicada.participantes[0].registroReproductivo}/inseminacion/anular`, { motivo: 'Corregir una participante' });
        const f = (await request('GET', `/semen/${ficha._id}`)).ficha;
        assert.equal(f.stockReproductivo, 2); assert.equal(f.totalUsadasIATF, 2);
        const final = await request('GET', `/protocolos-porcinos/bandas/${banda._id}`);
        assert.equal(final.ejecuciones[0].estado, 'PARCIAL');
    });
    console.log(`${resultados.length}/${resultados.length} PASS. Replica set local, indices intactos, sin datos de clientes.`);
}
main().catch((e) => { console.error(e.stack); process.exitCode = 1; }).finally(async () => {
    if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    await mongoose.disconnect().catch(() => {}); await client?.close().catch(() => {});
    if (child && !child.killed) { child.kill(); await new Promise((r) => child.once('exit', r)); }
    global.fetch = originalFetch;
});
