// MongoDB temporal exclusivamente local. Resend se sustituye; no se carga .env.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const Organizacion = require('../models/Organizacion');
const Finca = require('../models/Finca');
const Usuario = require('../models/Usuario');
const { Membresia } = require('../models/Membresia');
const Configuracion = require('../models/ConfiguracionEmail');
const Movimiento = require('../models/MovimientoFinanciero');
const { Tarea } = require('../models/Tarea');
const { RegistroReproductivo: Registro } = require('../models/RegistroReproductivo');
const Historial = require('../models/HistorialFincaAnimal');
const Traslado = require('../models/TrasladoFinca');
const Lote = require('../models/Lote');
const Pertenencia = require('../models/PertenenciaLote');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const { recopilarResumen, debeEnviarResumen, procesarResumenesTodasOrganizaciones } = require('../services/resumenEmail-service');
const { crearContenido, enlacePanel } = require('../services/resumenEmail-plantilla-service');
const { crearDefinicionesTareasBovinas } = require('../services/reproduccionBovina-service');

const id = () => new mongoose.Types.ObjectId();
const org = id(), finca = id(), segunda = id(), oculta = id(), ajenaOrg = id(), admin = id(), encargado = id();
const ahora = new Date('2026-11-05T12:00:00Z'), ayer = new Date('2026-11-04T18:00:00Z');
const base = (datos = {}) => ({ _id: id(), organizacionId: org, fincaId: finca, ...datos });
const animal = (datos = {}) => base({ identificadorFinca: id().toString(), diio: id().toString(), especie: 'Bovino', sexo: 'Hembra', estado: 'Activo', fechaNacimiento: new Date('2020-01-01'), ...datos });
const mods = { resumenGanadero: true, finanzas: true, tareasPendientes: true, radarOperativo: true };
const recopilar = (datos = {}) => ejecutarConOrganizacion(org, () => recopilarResumen({ usuarioId: admin, rol: 'Administrador', frecuencia: 'Diario', modulos: mods,
    fincaIds: [finca], fincas: [{ _id: finca, nombre: 'Principal' }, { _id: segunda, nombre: 'Secundaria' }], ahora, ...datos }));
const contenido = (resumen) => crearContenido({ usuario: { nombre: 'Ana <script>' }, organizacion: { nombre: 'Finca de prueba' }, frecuencia: 'Diario', resumen });
let mongod;

test.before(async () => {
    process.env.FRONTEND_URL = 'https://panel.example.test///';
    const socket = net.createServer(); await new Promise((r) => socket.listen(0, '127.0.0.1', r));
    const port = socket.address().port; await new Promise((r) => socket.close(r));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-resumen-ejecutivo-'));
    mongod = spawn(process.env.CIERRE_MONGOD || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' : 'mongod'),
        ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--logpath', path.join(dir, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: 'ignore' });
    let arranque; mongod.on('error', (e) => { arranque = e; });
    for (let n = 0; n < 50; n++) {
        if (arranque) throw arranque;
        try { await mongoose.connect(`mongodb://127.0.0.1:${port}/resumen_test`, { serverSelectionTimeoutMS: 300 }); break; }
        catch (error) { if (n === 49) throw error; await new Promise((r) => setTimeout(r, 100)); }
    }
    for (const modelo of Object.values(mongoose.models)) await modelo.init();
});
test.after(async () => {
    await mongoose.disconnect();
    if (mongod && mongod.exitCode === null) { const fin = new Promise((r) => mongod.once('exit', r)); mongod.kill(); await fin; }
});
test.beforeEach(async () => {
    for (const modelo of Object.values(mongoose.models)) await modelo.collection.deleteMany({});
    await Organizacion.collection.insertOne({ _id: org, nombre: 'Prueba', slug: 'prueba', estado: 'Activa', zonaHoraria: 'America/Costa_Rica', plan: { codigo: 'PREMIUM', estado: 'Activo' } });
    await Finca.collection.insertMany([
        { _id: finca, organizacionId: org, nombre: 'Principal', codigo: 'A', estado: 'Activa' },
        { _id: segunda, organizacionId: org, nombre: 'Secundaria', codigo: 'B', estado: 'Activa' },
        { _id: oculta, organizacionId: org, nombre: 'NO AUTORIZADA', codigo: 'C', estado: 'Activa' }
    ]);
    await Usuario.collection.insertMany([{ _id: admin, nombre: 'Ana', correo: 'ana@example.test', estado: 'Activo' }, { _id: encargado, nombre: 'Luis', correo: 'luis@example.test', estado: 'Activo' }]);
    await Membresia.collection.insertMany([{ organizacionId: org, usuario: admin, rol: 'Administrador', estado: 'Activo', accesoTodasFincas: false, fincas: [finca, segunda] },
        { organizacionId: org, usuario: encargado, rol: 'Encargado', estado: 'Activo', accesoTodasFincas: true }]);
});

test('Mongo real: nacimiento, venta, especies vacias e inventario al corte sin duplicar compras', async () => {
    await Animal.collection.insertMany([animal({ fechaNacimiento: ayer }), animal({ estado: 'Vendido', fechaVenta: ayer }),
        animal({ fechaCompra: ayer, fechaNacimiento: ayer }), animal({ fincaId: oculta }), animal({ organizacionId: ajenaOrg })]);
    const r = await recopilar();
    assert.equal(r.inventario.length, 1);
    assert.deepEqual({ ...r.inventario[0] }, { especie: 'Bovino', activos: 2, nacimientos: 1, compras: 1, recibidos: 0, ventas: 1, muertes: 0, enviados: 0, variacion: 1 });
    const c = contenido(r);
    assert.doesNotMatch(c.text, /Porcino/);
    assert.match(c.text, /variación \+1/);
    assert.equal(r.fincas, undefined);
});

test('Mongo real: administrador supervisa tres tareas del encargado y separa sus cero personales', async () => {
    await Tarea.collection.insertMany([
        base({ titulo: 'Revisar herida', asignadoA: encargado, estado: 'Pendiente', fechaProgramada: new Date('2026-11-04') }),
        base({ titulo: 'Pesar lote', asignadoA: encargado, estado: 'En proceso', fechaProgramada: new Date('2026-11-05') }),
        base({ titulo: 'Revisar cerca', asignadoA: encargado, estado: 'Pendiente', fechaProgramada: new Date('2026-11-06') }),
        base({ titulo: 'Terminada', asignadoA: encargado, estado: 'Completada', fechaProgramada: ayer, fechaCompletada: ayer }),
        base({ titulo: 'NO AUTORIZADA', fincaId: oculta, asignadoA: encargado, estado: 'Pendiente', fechaProgramada: ayer })
    ]);
    const r = await recopilar();
    assert.equal(r.tareas.pendientes, 3); assert.equal(r.tareas.vencidas, 1); assert.equal(r.tareas.completadas, 1);
    assert.equal(r.tareas.personales.pendientes, 0);
    assert.equal(r.tareas.urgentes[0].titulo, 'Revisar herida');
    assert.equal(r.tareas.urgentes[0].responsable, 'Luis (Encargado)');
    assert.equal(r.tareas.urgentes[1].estado, 'Para hoy', 'La fecha civil de hoy no esta vencida a las 6 AM');
    const privado = await recopilar({ usuarioId: admin, rol: 'Veterinario' });
    assert.equal(privado.tareas.pendientes, 0);
    assert.doesNotMatch(contenido(r).text, /NO AUTORIZADA/);
});

test('Mongo real: CRC y USD separados, Top 3 y exclusiones; permisos de cada rol al recopilar', async () => {
    const movimiento = (d) => base({ fecha: ayer, moneda: 'CRC', naturaleza: 'Ingreso', categoria: 'Ventas', monto: 1450000, ...d });
    await Movimiento.collection.insertMany([movimiento({}), movimiento({ naturaleza: 'Egreso', categoria: 'Sanidad', monto: 450000 }),
        movimiento({ moneda: 'USD', monto: 2300 }), movimiento({ monto: 99, excluirConsolidacion: true }),
        movimiento({ monto: 88, grupoAnuladoEn: ayer }), movimiento({ monto: 77, alcanceFinanciero: 'TRANSFERENCIA_INTERNA' }),
        movimiento({ fincaId: oculta, monto: 999999 }), movimiento({ organizacionId: ajenaOrg, monto: 888888 })]);
    for (const rol of ['Administrador', 'Contador', 'Veterinario', 'Encargado']) {
        const r = await recopilar({ rol, fincaIds: [finca, segunda] });
        const c = contenido(r);
        if (['Administrador', 'Contador'].includes(rol)) {
            assert.equal(r.finanzas.CRC.balance, 1000000); assert.equal(r.finanzas.USD.balance, 2300);
            assert.equal(r.finanzas.CRC.topIngresos[0].porcentaje, 100);
            assert.match(c.text, /Top 3 categorías de Ingresos/); assert.match(c.text, /\$2,300\.00/);
            assert.match(c.text, /Flujo Neto CRC/); assert.match(c.text, /1[ .]450[ .]000/);
        } else {
            assert.equal(r.finanzas, undefined); assert.doesNotMatch(c.html, /Flujo Neto|1[ .]450[ .]000|Top 3 categorías/);
        }
        assert.match(c.text, /Comparativo por finca/);
    }
    await Movimiento.collection.deleteMany({ moneda: 'USD' });
    assert.equal((await recopilar()).finanzas.USD, undefined);
});

test('Mongo real: radar, gestacion activa, engorde real y top cinco sin filtrar otras fincas', async () => {
    const hembra = animal({ diio: '1001', nombre: 'Luna', fechaFinRetiroCarne: new Date('2026-11-08') });
    const cerda = animal({ especie: 'Porcino', diio: '2001' });
    await Animal.collection.insertMany([hembra, cerda, animal({ estado: 'Vendido', fechaFinRetiroCarne: new Date('2027-01-01') })]);
    await Registro.collection.insertMany([
        base({ animal: hembra._id, estadoCiclo: 'Activo', gestacionConfirmada: true, fechaPartoEstimada: new Date('2026-11-07') }),
        base({ animal: hembra._id, estadoCiclo: 'Activo', gestacionConfirmada: true, fechaPartoEstimada: new Date('2026-11-07') }),
        base({ animal: cerda._id, estadoCiclo: 'Cerrado', gestacionConfirmada: true, fechaPartoEstimada: new Date('2026-11-07') })
    ]);
    await Tarea.collection.insertMany(Array.from({ length: 8 }, (_, n) => base({ titulo: `IATF ${n}`, asignadoA: encargado, estado: 'Pendiente', categoriaAutomatica: 'IATF', fechaProgramada: new Date('2026-11-07') })));
    const lote = base({ nombre: 'Engorde', codigo: 'E', estado: 'ACTIVO', proposito: 'ENGORDE' });
    await Lote.collection.insertOne(lote);
    await Pertenencia.collection.insertMany([base({ lote: lote._id, animal: hembra._id, activo: true }), base({ lote: lote._id, animal: cerda._id, activo: false })]);
    const r = await recopilar();
    assert.equal(r.radar.partos, 1); assert.equal(r.productivo.gestaciones, 1);
    assert.equal(r.radar.hembras[0].diio, '1001'); assert.equal(r.radar.retiroCarne, 1);
    assert.equal(r.radar.campanas, 8); assert.equal(r.tareas.urgentes.length, 5); assert.equal(r.productivo.engorde, 1);
});

test('Mongo real: traslado interno se compensa y nacimiento se atribuye a su finca historica', async () => {
    const a = animal({ fincaId: segunda, fechaNacimiento: ayer });
    await Animal.collection.insertOne(a);
    await Historial.collection.insertMany([
        { organizacionId: org, animal: a._id, fincaDestino: finca, fecha: ayer, tipo: 'Ingreso inicial' },
        { organizacionId: org, animal: a._id, fincaOrigen: finca, fincaDestino: segunda, fecha: new Date('2026-11-05T01:00:00Z'), tipo: 'Traslado' }
    ]);
    await Traslado.collection.insertOne({ organizacionId: org, fincaOrigen: finca, fincaDestino: segunda, estado: 'Completado', fecha: new Date('2026-11-05T01:00:00Z'), animales: [{ animal: a._id, especie: 'Bovino' }] });
    const r = await recopilar({ fincaIds: [finca, segunda] });
    assert.equal(r.inventario[0].variacion, 1);
    assert.equal(r.fincas[0].inventario.nacimientos, 1); assert.equal(r.fincas[0].inventario.enviados, 1);
    assert.equal(r.fincas[1].inventario.recibidos, 1); assert.equal(r.fincas[1].inventario.nacimientos, 0);
    const restringido = await recopilar();
    assert.equal(restringido.inventario[0].activos, 0); assert.equal(restringido.inventario[0].variacion, 0);
});

test('Mongo real: tarea de parto legado aparece en radar sin inventar confirmacion; cerdas y vacas separadas', async () => {
    const vaca = animal({ diio: '188000568005', nombre: 'ADELA' }), cerda = animal({ especie: 'Porcino', diio: '3001', nombre: 'Cerda' });
    await Animal.collection.insertMany([vaca, cerda]);
    const legado = base({ animal: vaca._id, fechaPartoEstimada: new Date('2026-11-09'), estado: 'Gestante', gestacionConfirmada: false, asignadoA: encargado });
    delete legado.fincaId;
    const porcino = base({ animal: cerda._id, especie: 'Bovino', fechaPartoEstimada: new Date('2026-11-11'), estadoCiclo: 'Activo', resultadoDiagnosticoGestacion: 'PREÑADA', gestacionConfirmada: false });
    await Registro.collection.insertMany([legado, porcino]);
    await Tarea.collection.insertMany(crearDefinicionesTareasBovinas({ registro: legado, animal: vaca, usuarioId: admin }).map((t) => base(t)));
    const antes = await Registro.collection.find({ organizacionId: org }).toArray();
    const r = await recopilar({ ahora: new Date('2026-11-06T12:00:00Z') });
    assert.ok(r.tareas.urgentes.some((t) => t.titulo.includes('188000568005')));
    assert.equal(r.radar.partos, 2);
    assert.equal(r.productivo.gestacionesSeguimiento, 2); assert.equal(r.productivo.gestaciones, 1);
    assert.equal(r.productivo.gestacionesPorEspecie.Bovino.sinConfirmar, 1);
    assert.equal(r.productivo.gestacionesPorEspecie.Porcino.confirmadas, 1);
    assert.equal(r.radar.partosPorEspecie.Bovino.partos, 1); assert.equal(r.radar.partosPorEspecie.Porcino.partos, 1);
    assert.equal(r.radar.hembras.find((h) => h.diio === '3001').especie, 'Porcino');
    const c = contenido(r);
    for (const texto of [c.text, c.html]) {
        assert.match(texto, /Partos estimados próximos 7 días: 2/);
        assert.match(texto, /Bovinos: 0 gestaciones confirmadas y 1 en seguimiento sin confirmación/);
        assert.match(texto, /Porcinos: 1 gestación confirmada y 0 en seguimiento sin confirmación/);
        assert.match(texto, /Pendiente de confirmar gestación/);
    }
    assert.deepEqual(await Registro.collection.find({ organizacionId: org }).toArray(), antes, 'El correo no modifica historiales ni banderas clinicas');
});

test('Mongo real: diagnostico mas reciente negativo descarta ciclo; no rescata duplicado positivo anterior', async () => {
    const hembras = Array.from({ length: 9 }, () => animal());
    await Animal.collection.insertMany(hembras);
    const ciclo = (a, d = {}) => base({ animal: a._id, estadoCiclo: 'Activo', gestacionConfirmada: true, fechaPartoEstimada: new Date('2026-11-09'), ...d });
    await Registro.collection.insertMany([
        ciclo(hembras[0], { createdAt: new Date('2026-01-01') }), ciclo(hembras[0], { resultadoDiagnosticoGestacion: 'VACIA' }),
        ciclo(hembras[1], { estadoCiclo: 'Cerrado' }), ciclo(hembras[2], { estadoCiclo: 'Cancelado' }),
        ciclo(hembras[3], { estadoCiclo: 'No preñada' }), ciclo(hembras[4], { activoParaAlertas: false }),
        ciclo(hembras[5], { fechaPartoReal: new Date('2026-11-03') }),
        ciclo(hembras[6], { resultado: { tipo: 'ABORTO' } }),
        ciclo(hembras[7], { historialDiagnosticos: [{ resultado: 'PREÑADA' }, { resultado: 'VACIA' }] }),
        ciclo(hembras[8], { resultadoDiagnosticoGestacion: 'DUDOSA' })
    ]);
    const r = await recopilar();
    assert.equal(r.radar.partos, 1);
    assert.equal(r.productivo.gestaciones, 0); assert.equal(r.productivo.gestacionesSeguimiento, 1);
    assert.equal(r.productivo.gestacionesPorEspecie.Bovino.sinConfirmar, 1);
});

test('Mongo real: confirmacion por historial sin bandera ni fecha se cuenta pero no inventa parto en radar', async () => {
    const vaca = animal(), cerda = animal({ especie: 'Porcino' });
    await Animal.collection.insertMany([vaca, cerda]);
    await Registro.collection.insertMany([
        base({ animal: vaca._id, historialDiagnosticos: [{ resultado: 'PREÑADA' }], estadoCiclo: 'Activo' }),
        base({ animal: cerda._id, resultadoDiagnosticoGestacion: 'PREÑADA', estadoCiclo: 'Activo', fechaPartoEstimada: 'fecha ilegible' })
    ]);
    const r = await recopilar();
    assert.equal(r.productivo.gestaciones, 2); assert.equal(r.radar.partos, 0);
    assert.equal(r.productivo.gestacionesPorEspecie.Bovino.confirmadas, 1); assert.equal(r.productivo.gestacionesPorEspecie.Porcino.confirmadas, 1);
});

test('Mongo real: un ciclo nuevo cerrado, con parto o negativo no revive una gestacion vieja activa', async () => {
    const hembras = Array.from({ length: 3 }, () => animal());
    await Animal.collection.insertMany(hembras);
    const anteriores = hembras.map((a) => base({ animal: a._id, createdAt: new Date('2026-01-01'), estadoCiclo: 'Activo', gestacionConfirmada: true, fechaPartoEstimada: new Date('2026-11-09') }));
    await Registro.collection.insertMany([...anteriores,
        base({ animal: hembras[0]._id, estadoCiclo: 'Cerrado' }),
        base({ animal: hembras[1]._id, estadoCiclo: 'Activo', fechaPartoReal: new Date('2026-11-03') }),
        base({ animal: hembras[2]._id, estadoCiclo: 'No preñada', resultadoDiagnosticoGestacion: 'VACIA' })
    ]);
    const r = await recopilar();
    assert.equal(r.productivo.gestacionesSeguimiento, 0); assert.equal(r.radar.partos, 0);
});

test('Mongo real: radar respeta dias civiles, instantes locales y limite exclusivo de siete dias', async () => {
    const fechas = ['2026-11-06T00:00:00Z', '2026-11-12T00:00:00Z', '2026-11-13T00:00:00Z', '2026-11-06T05:00:00Z'];
    const hembras = fechas.map(() => animal());
    await Animal.collection.insertMany(hembras);
    await Registro.collection.insertMany(hembras.map((a, i) => base({ animal: a._id, fechaPartoEstimada: new Date(fechas[i]), estadoCiclo: 'Activo' })));
    const r = await recopilar({ ahora: new Date('2026-11-06T12:00:00Z') });
    assert.equal(r.productivo.gestacionesSeguimiento, 4); assert.equal(r.radar.partos, 2);
    assert.deepEqual(r.radar.hembras.map((h) => h.dia).sort(), ['2026-11-06', '2026-11-12']);
});

test('Mongo real: legacy sin finca no evade tenant, finca, sexo ni estado actual de la hembra', async () => {
    const hembras = [animal(), animal({ fincaId: oculta }), animal({ organizacionId: ajenaOrg }), animal({ sexo: 'Macho' }), animal({ estado: 'Vendido' }), animal({ estado: 'Muerto' })];
    await Animal.collection.insertMany(hembras);
    const ciclos = hembras.map((a) => base({ animal: a._id, fechaPartoEstimada: new Date('2026-11-09'), gestacionConfirmada: true }));
    for (const r of ciclos) delete r.fincaId;
    ciclos.push(base({ animal: hembras[0]._id, organizacionId: ajenaOrg, fechaPartoEstimada: new Date('2026-11-09'), gestacionConfirmada: true }));
    await Registro.collection.insertMany(ciclos);
    const r = await recopilar();
    assert.equal(r.productivo.gestaciones, 1); assert.equal(r.radar.partos, 1);
    assert.equal(r.radar.hembras[0].animalId.toString(), hembras[0]._id.toString());
    const contador = await recopilar({ rol: 'Contador' });
    assert.equal(contador.productivo.gestacionesPorEspecie, undefined); assert.equal(contador.radar, undefined);
});

test('Mongo real: radar consolida ambas especies en una finca sin sobrescribir el subtotal', async () => {
    const hembras = [animal(), animal({ especie: 'Porcino' }), animal({ fincaId: segunda })];
    await Animal.collection.insertMany(hembras);
    await Registro.collection.insertMany(hembras.map((a) => base({ animal: a._id, fincaId: a.fincaId, fechaPartoEstimada: new Date('2026-11-09'), gestacionConfirmada: true, estadoCiclo: 'Activo' })));
    const r = await recopilar({ fincaIds: [finca, segunda] });
    assert.equal(r.radar.partos, 3); assert.equal(r.radar.partosPorEspecie.Bovino.partos, 2); assert.equal(r.radar.partosPorEspecie.Porcino.partos, 1);
    assert.equal(r.fincas.find((f) => f.fincaId === String(finca)).partos, 2);
    assert.equal(r.fincas.find((f) => f.fincaId === String(segunda)).partos, 1);
    assert.equal((await recopilar()).radar.partos, 2);
});

test('Mongo real: una tarea manual sin ciclo reproductivo nunca confirma ni pronostica una gestacion', async () => {
    const vaca = animal(); await Animal.collection.insertOne(vaca);
    await Tarea.collection.insertOne(base({ animal: vaca._id, titulo: 'Revisar parto estimado', asignadoA: encargado, estado: 'Pendiente', fechaProgramada: new Date('2026-11-09') }));
    const r = await recopilar();
    assert.equal(r.tareas.pendientes, 1); assert.equal(r.radar.partos, 0); assert.equal(r.productivo.gestacionesSeguimiento, 0);
});

test('HTML escapado, CTA validada y texto humano con intervalo y zona horaria', async () => {
    const c = contenido(await recopilar());
    assert.match(c.html, /href="https:\/\/panel\.example\.test\/"/);
    assert.match(c.html, /Ir al Panel de CIR Ganadero →/);
    assert.match(c.html, /Ana &lt;script&gt;/); assert.doesNotMatch(c.html, /<script>/);
    assert.match(c.text, /últimas 24 h/); assert.match(c.text, /America\/Costa_Rica/); assert.doesNotMatch(c.text, /"periodo":|"finanzas":/);
    for (const url of ['javascript:alert(1)', 'https://user:pass@example.test', 'http://example.test']) assert.throws(() => enlacePanel(url));
});

test('cron diario ignora hora posterior; continuo la respeta; semanal no ignora dia ni periodo', () => {
    const cfg = { frecuencia: 'Diario', horaPreferida: '18:00' };
    assert.equal(debeEnviarResumen(cfg, ahora, 'America/Costa_Rica').enviar, false);
    const d = debeEnviarResumen(cfg, ahora, 'America/Costa_Rica', { modoEjecucion: 'cron_diario' });
    assert.equal(d.enviar, true);
    assert.equal(debeEnviarResumen({ ...cfg, ultimoPeriodo: d.periodo }, ahora, 'America/Costa_Rica', { modoEjecucion: 'cron_diario' }).enviar, false);
    assert.equal(debeEnviarResumen({ ...cfg, frecuencia: 'Semanal', diaSemana: 1 }, ahora, 'America/Costa_Rica', { modoEjecucion: 'cron_diario' }).enviar, false);
});

test('Mongo real: envio usa el rol actual de membresia aunque el usuario conserve rol administrativo', async (t) => {
    process.env.RESEND_API_KEY = 'test-sin-red';
    t.after(() => { delete process.env.RESEND_API_KEY; });
    const mensajes = [];
    t.mock.method(global, 'fetch', async (url, opciones) => {
        assert.equal(url, 'https://api.resend.com/emails'); mensajes.push(JSON.parse(opciones.body));
        return { ok: true, json: async () => ({ id: 'simulado' }) };
    });
    await Usuario.collection.updateOne({ _id: admin }, { $set: { rol: 'Administrador' } });
    await Membresia.collection.updateOne({ usuario: admin }, { $set: { rol: 'Veterinario' } });
    await Movimiento.collection.insertOne(base({ fecha: ayer, moneda: 'CRC', naturaleza: 'Ingreso', monto: 999999, categoria: 'Ventas' }));
    await Configuracion.collection.insertOne({ organizacionId: org, usuario: admin, frecuencia: 'Diario', horaPreferida: '23:59', modulos: mods });
    const r = await procesarResumenesTodasOrganizaciones(ahora, { modoEjecucion: 'cron_diario' });
    assert.equal(r[0].envios[0].enviado, true); assert.equal(mensajes.length, 1);
    assert.match(mensajes[0].text, /Comparativo por finca/);
    assert.doesNotMatch(mensajes[0].text, /Finanzas del período|Flujo Neto|999[ .]999/);
});

test('Mongo real: error de proveedor aisla destinatarios y no marca como enviado el fallido', async (t) => {
    process.env.RESEND_API_KEY = 'test-sin-red';
    t.after(() => { delete process.env.RESEND_API_KEY; });
    t.mock.method(global, 'fetch', async (url, opciones) => {
        assert.equal(url, 'https://api.resend.com/emails');
        const fallo = JSON.parse(opciones.body).to.includes('ana@example.test');
        return { ok: !fallo, json: async () => fallo ? { message: 'Fallo simulado de entrega' } : { id: 'simulado' } };
    });
    await Configuracion.collection.insertMany([admin, encargado].map((usuario) => ({ organizacionId: org, usuario, frecuencia: 'Diario', horaPreferida: '23:59', modulos: mods })));
    const r = await procesarResumenesTodasOrganizaciones(ahora, { modoEjecucion: 'cron_diario' });
    assert.equal(r[0].errores.length, 1); assert.equal(r[0].envios.filter((e) => e.enviado).length, 1);
    assert.ok(!(await Configuracion.collection.findOne({ usuario: admin })).ultimoPeriodo);
    assert.ok((await Configuracion.collection.findOne({ usuario: encargado })).ultimoPeriodo);
});

test('Mongo real: intervalo semiabierto, USD sin actividad y fin de radar no se incluyen dos veces', async () => {
    const desde = new Date(+ahora - 86400000);
    await Movimiento.collection.insertMany([base({ fecha: desde, moneda: 'CRC', naturaleza: 'Ingreso', categoria: 'Ganado', monto: 50 }),
        base({ fecha: ahora, moneda: 'USD', naturaleza: 'Ingreso', categoria: 'Ganado', monto: 80 })]);
    const r = await recopilar();
    assert.equal(r.finanzas.CRC.ingresos, 50); assert.equal(r.finanzas.USD, undefined);
});

test('Mongo real: orquestador diario ejecuta tres fases y no reenvia en segunda corrida', async (t) => {
    process.env.RESEND_API_KEY = 'test-sin-red'; process.env.EMAIL_ALERTS_ENABLED = 'false';
    const originales = [];
    t.mock.method(global, 'fetch', async (url, opciones) => {
        assert.equal(url, 'https://api.resend.com/emails'); originales.push(opciones);
        return { ok: true, json: async () => ({ id: 'correo-simulado' }) };
    });
    const alertas = require('../services/alertasCorreo-service');
    t.mock.method(alertas, 'procesarAlertasTodasOrganizaciones', async () => [{ organizacionId: org, correos: { enviadas: 0 } }]);
    const archivo = require.resolve('../services/trabajoProgramado-service'); delete require.cache[archivo];
    t.after(() => { delete require.cache[archivo]; delete process.env.RESEND_API_KEY; });
    const { ejecutarAlertasProgramadas } = require(archivo);
    await Configuracion.collection.insertOne({ organizacionId: org, usuario: admin, frecuencia: 'Diario', horaPreferida: '23:59', modulos: mods, ultimoPeriodo: '' });
    const primero = await ejecutarAlertasProgramadas({ origen: 'test', incluirResumenes: true });
    for (const fase of ['categorias', 'alertas', 'resumenes']) assert.equal(primero[fase].status, 'Completado');
    assert.equal(primero.resumenes.enviadas, 1); assert.equal(originales.length, 1);
    assert.match(originales[0].headers['Idempotency-Key'], /^resumen:/);
    const segundo = await ejecutarAlertasProgramadas({ origen: 'test', incluirResumenes: true });
    assert.equal(segundo.resumenes.enviadas, 0); assert.equal(originales.length, 1);
    await Organizacion.collection.updateOne({ _id: org }, { $set: { 'plan.estado': 'Suspendido' } });
    assert.equal((await procesarResumenesTodasOrganizaciones()).length, 0);
});
