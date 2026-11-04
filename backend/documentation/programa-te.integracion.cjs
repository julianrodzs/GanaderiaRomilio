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

    const { LoteEmbrion: Lote, MovimientoEmbrion: Movimiento, VentaEmbrion: Venta } = require('../models/ProgramaTE');
    const Colecta = require('../models/ProgramaTransferencia'), Financiero = require('../models/MovimientoFinanciero');
    const banco = require('../services/bancoEmbriones-service');
    const toro = await animal('TE-TORO', 'Macho'), donante = await animal('TE-DONANTE'), r1 = await animal('TE-R1'), r2 = await animal('TE-R2');
    let colecta, lote, campana, ciclo, venta;
    const protocolo = [{ nombre: 'Sincronizacion', tipoAccion: 'CONTROL', offsetHoras: 0 }, { nombre: 'Cuerpo luteo', tipoAccion: 'EVALUACION_CL', offsetHoras: 408 }, { nombre: 'Transferir', tipoAccion: 'TRANSFERENCIA_EMBRIONES', offsetHoras: 408 }];
    const produccion = { nombre: 'FIV local', tipoProduccion: 'FIV', donanteId: String(donante._id), padreId: String(toro._id), fechaColecta: '2026-01-01', costos: [{ concepto: 'Laboratorio', monto: 600, moneda: 'USD' }, { concepto: 'Lavado', monto: 60000, moneda: 'CRC' }], estructurasRecuperadas: 8, embrionesViables: 6, embrionesDegenerados: 2, lotes: [{ codigoLote: 'TE-001', cantidad: 6, cantidadReproductiva: 4, cantidadComercial: 2, estadoConservacion: 'CONGELADO', moneda: 'USD' }], claveIdempotencia: 'colecta-test' };
    await check('matriz HTTP de cuatro planes y codigos de upgrade', async () => {
        for (const codigo of ['ESENCIAL', 'GESTION', 'PRO', 'PREMIUM']) {
            await Org.updateOne({ _id: org }, { $set: { 'plan.codigo': codigo } });
            const pro = ['PRO', 'PREMIUM'].includes(codigo);
            for (const ruta of ['/te/colectas', '/te/banco', '/te/campanas', '/te/indicadores', '/ventas/embriones']) {
                const d = await req('GET', ruta, undefined, pro ? 200 : 403); if (!pro) assert.equal(d.code, 'PLAN_UPGRADE_REQUIRED');
            }
            const d = await req('GET', '/reportes/reproduccion/metodos', undefined, codigo === 'ESENCIAL' ? 403 : 200);
            if (codigo === 'ESENCIAL') assert.equal(d.code, 'PLAN_UPGRADE_REQUIRED');
        }
        await Org.updateOne({ _id: org }, { $set: { 'plan.codigo': 'PRO' } });
    });
    await check('colecta FIV 6 viables crea un lote 4/2 e idempotencia', async () => {
        colecta = await req('POST', '/te/colectas', produccion, 201);
        const repetida = await req('POST', '/te/colectas', produccion, 201); assert.equal(repetida._id, colecta._id);
        [lote] = await req('GET', '/te/banco'); assert.equal(lote.stockReproductivo, 4); assert.equal(lote.stockComercial, 2);
        assert.equal(lote.costosUnitarios.CRC, 10000); assert.equal(lote.costosUnitarios.USD, 100); banco.comprobarInvariante(lote);
    });
    await check('colecta planificada solo consume hormonas al ejecutar; pasos idempotentes', async () => {
        const insumo = await scope(() => require('../models/InsumoReproductivo').InsumoReproductivo.create({ nombre: 'Hormona prueba', categoria: 'HORMONA_REPRODUCTIVA', unidad: 'ML', cantidadDisponible: 10, costoUnitario: 20, moneda: 'CRC' }));
        const c = await req('POST', '/te/colectas', { nombre: 'Planificada', tipoProduccion: 'IN_VIVO', donanteId: String(donante._id), padreId: String(toro._id), fechaColecta: '2026-02-01', responsable: String(usuario), protocolo: [{ nombre: 'Superovulacion', tipoAccion: 'APLICAR_PRODUCTO', offsetHoras: 0 }], claveIdempotencia: 'planificada' }, 201);
        assert.equal((await scope(() => require('../models/InsumoReproductivo').InsumoReproductivo.findById(insumo._id))).cantidadDisponible, 10);
        await req('POST', '/te/colectas/' + c._id + '/finalizar', { estructurasRecuperadas: 0, embrionesViables: 0, lotes: [] }, 409);
        const url = '/te/colectas/' + c._id + '/pasos/' + c.protocoloDonante.pasos[0]._id + '/ejecutar';
        for (let i = 0; i < 2; i++) await req('POST', url, { fecha: '2026-02-01', productos: [{ producto: String(insumo._id), cantidad: 2 }] });
        assert.equal((await scope(() => require('../models/InsumoReproductivo').InsumoReproductivo.findById(insumo._id))).cantidadDisponible, 8);
        const final = await req('POST', '/te/colectas/' + c._id + '/finalizar', { estructurasRecuperadas: 2, embrionesViables: 0, embrionesDegenerados: 2, lotes: [] });
        assert.equal(final.estadoProduccion, 'FINALIZADA'); assert.equal(final.costos[0].monto, 40);
    });
    await check('planificar semen no consume; finalizar consume exactamente una vez', async () => {
        const f = (await req('POST', '/semen/entradas', { esExterno: true, nombreSemental: 'Padre banco', diio: 'SEMENTAL-TE', especie: 'Bovino', origen: 'COMPRA', cantidad: 4, destino: 'TODO_REPRODUCTIVO', costoUnitario: 50, moneda: 'USD', claveIdempotencia: 'semen-te' }, 201)).ficha;
        const c = await req('POST', '/te/colectas', { nombre: 'Colecta con semen', tipoProduccion: 'FIV', donanteId: String(donante._id), fichaSemenId: f._id, cantidadPajuelas: 2, monedaSemen: 'USD', fechaColecta: '2026-01-01', claveIdempotencia: 'colecta-semen' }, 201);
        assert.equal((await req('GET', '/semen/' + f._id)).ficha.stockReproductivo, 4);
        for (let i = 0; i < 2; i++) await req('POST', '/te/colectas/' + c._id + '/finalizar', { estructurasRecuperadas: 1, embrionesViables: 1, embrionesDegenerados: 0, lotes: [{ codigoLote: 'SEMEN-TE', cantidad: 1, cantidadReproductiva: 1, estadoConservacion: 'FRESCO', moneda: 'USD' }] });
        assert.equal((await req('GET', '/semen/' + f._id)).ficha.stockReproductivo, 2);
        const l = await scope(() => Lote.findOne({ codigoLote: 'SEMEN-TE' })); assert.equal(l.padreExterno.diio, 'SEMENTAL-TE'); assert.equal(l.costosUnitarios.USD, 100);
    });
    await check('campana TETF crea tareas; CL y sincronizacion obligatorios', async () => {
        campana = await req('POST', '/te/campanas', { nombre: 'Receptoras prueba', fechaInicio: '2026-01-01', responsable: String(usuario), animales: [String(r1._id), String(r2._id)], protocolo, costos: [{ concepto: 'Sincronizacion', monto: 12000, moneda: 'CRC' }], claveIdempotencia: 'tetf-test' }, 201);
        assert.equal(campana.pasos.length, 3);
        await req('POST', '/te/campanas/' + campana._id + '/receptoras/' + r1._id + '/transferir', { loteId: lote._id, fecha: '2026-01-18' }, 409);
        for (const [r, evaluacionCL] of [[r1, 'APTA'], [r2, 'NO_APTA']]) await req('POST', '/te/campanas/' + campana._id + '/receptoras/' + r._id + '/evaluacion', { evaluacionCL, ladoOvario: 'DERECHO', fecha: '2026-01-18' });
        await req('POST', '/te/campanas/' + campana._id + '/receptoras/' + r1._id + '/transferir', { loteId: lote._id, fecha: '2026-01-18' }, 409);
        await req('POST', '/te/campanas/' + campana._id + '/pasos/' + campana.pasos[0].pasoId + '/ejecutar', { fecha: '2026-01-01', productos: [] });
    });
    await check('reservas atomicas y rollback completo de multiples lotes', async () => {
        const url = '/te/campanas/' + campana._id + '/asignaciones';
        await req('POST', url, { asignaciones: [{ loteId: lote._id, cantidad: 1 }, { loteId: lote._id, cantidad: 10 }], claveIdempotencia: 'reserva-falla' }, 400);
        assert.equal((await scope(() => Lote.findById(lote._id))).stockReproductivo, 4);
        for (let i = 0; i < 2; i++) await req('POST', url, { asignaciones: [{ loteId: lote._id, cantidad: 3 }], claveIdempotencia: 'reserva-ok' });
        const l = await scope(() => Lote.findById(lote._id)); assert.equal(l.stockReproductivo, 1); assert.equal(l.asignadoCampanas, 3); assert.equal(l.stockComercial, 2);
    });
    await check('transferencia real consume reserva y crea ciclo normal sin confirmar prenez', async () => {
        const d = { loteId: lote._id, fecha: '2026-01-18', tecnico: 'Veterinario prueba', edadEmbrionDias: 7 };
        const a = await req('POST', '/te/campanas/' + campana._id + '/receptoras/' + r1._id + '/transferir', d, 201); ciclo = a.registro;
        assert.equal(ciclo.metodo, 'TRANSFERENCIA_EMBRIONES'); assert.equal(ciclo.gestacionConfirmada, false);
        assert.equal(String(ciclo.servicios[0].embrion.donanteId), String(donante._id));
        assert.equal(String(ciclo.servicios[0].toroId), String(toro._id));
        await req('POST', '/te/campanas/' + campana._id + '/receptoras/' + r1._id + '/transferir', d, 201);
        await req('POST', '/te/campanas/' + campana._id + '/receptoras/' + r2._id + '/transferir', d, 409);
        const l = await scope(() => Lote.findById(lote._id)); assert.equal(l.totalTransferidos, 1); assert.equal(l.asignadoCampanas, 2);
    });
    await check('cerrar devuelve sobrantes sin cancelar el seguimiento de la receptora', async () => {
        await req('POST', '/te/campanas/' + campana._id + '/cerrar', { motivo: 'Fin de jornada' });
        const l = await scope(() => Lote.findById(lote._id)); assert.equal(l.stockReproductivo, 3); assert.equal(l.asignadoCampanas, 0); banco.comprobarInvariante(l);
        const r = await req('POST', '/te/campanas/' + campana._id + '/receptoras/' + r1._id + '/diagnosticos', { fecha: '2026-02-10', resultado: 'PRENADA', metodo: 'ECOGRAFIA', diasGestacionEstimados: 30 });
        assert.equal(r.gestacionConfirmada, true); assert.equal(r.estadoAtribucion, 'CONFIRMADA');
        const rep = await req('GET', '/te/indicadores?fechaInicio=2026-01-01&fechaFin=2026-12-31');
        assert.equal(rep.transferidos, 1); assert.equal(rep.prenadas, 1); assert.equal(rep.costoPorEmbrionViable.USD, 100);
        assert.equal(rep.costoPorPrenez.USD, 100); assert.equal(rep.costoPorPrenez.CRC, 22000);
    });
    await check('parto TE hereda donante y padre sin sumar parto a donante', async () => {
        await req('POST', '/reproduccion/' + ciclo._id + '/resultado', { tipo: 'PARTO', fecha: '2026-10-20' });
        const n = await req('POST', '/reproduccion/' + ciclo._id + '/ternero', { diio: 'TE-CRIA', sexo: 'Hembra' }, 201); const c = n.ternero || n;
        assert.equal(String(c.madreGeneticaId?._id || c.madreGeneticaId), String(donante._id)); assert.equal(String(c.madreGestanteId?._id || c.madreGestanteId), String(r1._id));
        assert.equal(await scope(() => Registro.countDocuments({ animal: donante._id, fechaPartoReal: { $ne: null } })), 0);
    });
    await check('venta comercial y anulacion conservan ingreso original y contrapartida', async () => {
        const d = { loteId: lote._id, comprador: 'Cliente', cantidad: 1, precioUnitario: 300, moneda: 'USD', fecha: '2026-01-20', claveIdempotencia: 'venta-1' };
        const res = await req('POST', '/ventas/embriones', d, 201); venta = res.venta; assert.equal(res.lote.stockReproductivo, 3); assert.equal(res.lote.stockComercial, 1);
        await req('POST', '/ventas/embriones', { ...d, cantidad: 2, claveIdempotencia: 'sobreventa' }, 400);
        const fin = await scope(() => Financiero.findById(venta.movimientoFinancieroId)); assert.equal(fin.naturaleza, 'Ingreso'); assert.equal(fin.moneda, 'USD');
        const rev = await req('POST', '/ventas/embriones/' + venta._id + '/anular', { motivo: 'Error de comprador' }); assert.equal(rev.lote.stockComercial, 2);
        await req('POST', '/ventas/embriones/' + venta._id + '/anular', { motivo: 'Repetir' }, 400);
        const contrapartida = await scope(() => Financiero.findById(rev.venta.movimientoReversionId)); assert.equal(contrapartida.naturaleza, 'Egreso'); assert.equal(contrapartida.moneda, 'USD'); assert.equal(contrapartida.monto, 300);
    });
    await check('mermas y traslados con motivo; ledger inmutable; concurrencia sin sobregiros', async () => {
        await req('POST', '/te/banco/' + lote._id + '/mermas', { gaveta: 'REPRODUCTIVO', cantidad: 1 }, 400);
        await req('POST', '/te/banco/' + lote._id + '/traslados', { direccion: 'REPRODUCTIVO_A_COMERCIAL', cantidad: 1 }, 400);
        await req('POST', '/te/banco/' + lote._id + '/mermas', { gaveta: 'REPRODUCTIVO', cantidad: 1, motivo: 'Descarte', claveIdempotencia: 'merma' });
        await req('POST', '/te/banco/' + lote._id + '/traslados', { direccion: 'COMERCIAL_A_REPRODUCTIVO', cantidad: 1, motivo: 'Uso en finca', claveIdempotencia: 'traslado' });
        const d = { loteId: lote._id, comprador: 'Concurrente', cantidad: 1, precioUnitario: 300, moneda: 'USD', fecha: '2026-01-20' };
        const resultados = await Promise.all(['a', 'b'].map(async (k) => {
            const r = await nativeFetch(base + '/api/ventas/embriones', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'X-Finca-Id': String(finca), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d, claveIdempotencia: 'concurrente-' + k }) }); return r.status;
        }));
        assert.deepEqual(resultados.sort(), [201, 400].sort());
        const l = await scope(() => Lote.findById(lote._id)); banco.comprobarInvariante(l); assert.equal(l.stockComercial, 0);
        await assert.rejects(scope(() => Movimiento.updateMany({}, { $set: { cantidad: 100 } })));
    });
    await check('aislamiento entre fincas y payload estricto', async () => {
        const f = await Finca.create({ organizacionId: org, nombre: 'Segunda', codigo: 'SEGUNDA', estado: 'Activa' });
        await req('GET', '/te/banco/' + lote._id, undefined, 404, { 'X-Finca-Id': String(f._id) });
        await req('POST', '/te/banco/compras', { $set: { stockComercial: 100 } }, 422);
        await req('GET', '/reportes/multi-finca/te', undefined, 403);
        await Org.updateOne({ _id: org }, { $set: { 'plan.codigo': 'PREMIUM' } });
        const d = await req('GET', '/reportes/multi-finca/te?fincaIds=' + finca); assert.equal(d.transferidos, 1);
        await req('GET', '/reportes/multi-finca/te?fincaIds=000000000000000000000001', undefined, 403);
    });
    await check('migracion integral dry-run sin escrituras e idempotente con partos intactos', async () => {
        await scope(() => Colecta.create({ nombre: 'Legado', fechaColecta: '2025-01-01', donanteId: donante._id, padreId: toro._id, origenEmbrion: 'IN_VIVO', costoTotal: 100, moneda: 'USD', creadoPor: usuario, embriones: [
            { codigo: 'ANTIGUO', estadoEmbrion: 'CONGELADO' },
            { codigo: 'RESERVADO', estadoEmbrion: 'CONGELADO', estado: 'RESERVADO', receptoraId: r2._id, responsable: usuario },
            { codigo: 'TRANSFERIDO', estadoEmbrion: 'CONGELADO', estado: 'TRANSFERIDO', receptoraId: r1._id, registroReproductivoId: ciclo._id, responsable: usuario }
        ] }));
        const migrar = require('../scripts/migrar-reproduccion-y-te').ejecutarMigracion;
        const antes = await Colecta.collection.find({}).toArray(), movimientos = await Movimiento.collection.countDocuments();
        const dry = await migrar(); assert.deepEqual(await Colecta.collection.find({}).toArray(), antes); assert.equal(await Movimiento.collection.countDocuments(), movimientos);
        assert.equal(dry.colectasPendientes, 1); assert.deepEqual(dry.discrepancias, []); console.log('DRY_RUN_TE_LOCAL ' + JSON.stringify(dry));
        const a = await migrar({ aplicar: true }); assert.equal(a.colectasMigradas, 1); assert.deepEqual(a.discrepancias, []); assert.equal(a.reproduccion.partosAntes, a.reproduccion.partosDespues);
        const b = await migrar({ aplicar: true }); assert.equal(b.colectasMigradas, 0); assert.equal(b.lotesCreados, 0);
        const historica = await scope(() => require('../models/ProgramaTE').CampanaTE.findOne({ nombre: 'Historico · Legado' }));
        assert.equal(historica.estado, 'ACTIVA'); assert.equal(historica.pasos.length, 3);
        assert.equal(historica.receptoras.find((r) => String(r.animal) === String(r2._id)).evaluacionCL, 'PENDIENTE');
        const l = await scope(() => Lote.findOne({ colectaId: historica.claveIdempotencia.slice('migracion:'.length) }));
        assert.equal(l.asignadoCampanas, 1); assert.equal(l.totalTransferidos, 1); assert.equal(l.stockReproductivo, 1);
        for (const l of await scope(() => Lote.find({}))) banco.comprobarInvariante(l);
    });
    console.log(JSON.stringify({ resultado: 'PASS', pruebas: checks.length, modelos: Object.keys(mongoose.models).length }));
}
main().catch((e) => { console.error(e.stack); process.exitCode = 1; }).finally(async () => {
    if (server) await new Promise((r) => server.close(r)); await wait(200); await mongoose.disconnect(); if (client) await client.close();
    if (mongod && mongod.exitCode == null) { const terminado = new Promise((r) => mongod.once('exit', r)); mongod.kill(); await terminado; }
});


