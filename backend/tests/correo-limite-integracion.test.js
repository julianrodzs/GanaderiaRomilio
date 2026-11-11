// MongoDB desechable en loopback; no lee .env ni contacta Atlas o Resend.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
const Limite = require('../models/LimiteProveedorCorreo');
const { crearLimitadorCorreo, INTERVALO_MS } = require('../services/limiteCorreo-service');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let mongod, uri;

test.before(async () => {
    const socket = net.createServer(); await new Promise((r) => socket.listen(0, '127.0.0.1', r));
    const port = socket.address().port; await new Promise((r) => socket.close(r));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cir-correo-limite-'));
    mongod = spawn(process.env.CIERRE_MONGOD || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe' : 'mongod'),
        ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--logpath', path.join(dir, 'mongo.log'), '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: 'ignore' });
    let fallo; mongod.on('error', (e) => { fallo = e; });
    uri = `mongodb://127.0.0.1:${port}/limite_correo_test`;
    for (let n = 0; n < 50; n++) {
        if (fallo) throw fallo;
        try { await mongoose.connect(uri, { serverSelectionTimeoutMS: 300, autoIndex: false }); break; }
        catch (error) { if (n === 49) throw error; await esperar(100); }
    }
});
test.beforeEach(async () => { if (mongoose.connection.readyState === 1) await Limite.deleteMany({}); });
test.after(async () => {
    await mongoose.disconnect();
    if (mongod && mongod.exitCode === null) { const fin = new Promise((r) => mongod.once('exit', r)); mongod.kill(); await fin; }
});

test('Mongo real: API y cron en procesos separados comparten turnos atomicos sin indices nuevos', async () => {
    const codigo = `const mongoose=require('mongoose');const{crearLimitadorCorreo}=require('./services/limiteCorreo-service');
        (async()=>{await mongoose.connect(process.argv[1],{autoIndex:false});const l=crearLimitadorCorreo(),fin=performance.now()+10000;
        const turnos=await Promise.all(Array.from({length:3},()=>l.esperarTurno({limiteTiempo:fin})));console.log(JSON.stringify(turnos.map(Number)));await mongoose.disconnect();})().catch(e=>{console.error(e);process.exitCode=1});`;
    const ejecutar = () => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', codigo, uri], { cwd: path.resolve(__dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let salida = '', error = ''; child.stdout.on('data', (b) => { salida += b; }); child.stderr.on('data', (b) => { error += b; });
        child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(JSON.parse(salida)) : reject(Error(error)));
    });
    const turnos = (await Promise.all([ejecutar(), ejecutar()])).flat().sort((a, b) => a - b);
    assert.equal(turnos.length, 6);
    for (let i = 1; i < turnos.length; i++) assert.ok(turnos[i] - turnos[i - 1] >= INTERVALO_MS);
    assert.equal(await Limite.countDocuments(), 1);
    assert.deepEqual((await Limite.collection.indexes()).map((i) => i.name), ['_id_']);
});

test('Mongo real: Retry-After pausa tambien otro limitador y no acorta un enfriamiento previo', async () => {
    const api = crearLimitadorCorreo(), cron = crearLimitadorCorreo();
    await api.esperarTurno({ limiteTiempo: performance.now() + 5000 });
    await api.pausar(700);
    const fecha = (await Limite.findById('resend-equipo')).disponibleDesde;
    await cron.pausar(10);
    assert.equal(+(await Limite.findById('resend-equipo')).disponibleDesde, +fecha);
    const siguiente = await cron.esperarTurno({ limiteTiempo: performance.now() + 5000 });
    assert.ok(+siguiente >= +fecha + INTERVALO_MS);
});

test('Mongo real: respeta el plazo y deja de esperar si el cron pierde su bloqueo', async () => {
    const l = crearLimitadorCorreo(); await l.pausar(5000);
    await assert.rejects(l.esperarTurno({ limiteTiempo: performance.now() + 80 }), { code: 'EMAIL_SEND_DEADLINE' });
    let llamadas = 0;
    await assert.rejects(l.esperarTurno({ limiteTiempo: performance.now() + 5000, comprobarBloqueo: async () => {
        if (++llamadas === 2) throw Object.assign(Error('Lease perdido'), { code: 'JOB_LOCK_LOST' });
    } }), { code: 'JOB_LOCK_LOST' });
    assert.ok(+(await Limite.findById('resend-equipo')).disponibleDesde > Date.now());
});

test('Mongo real: al pasar el enfriamiento un reinicio puede enviar sin bloqueo permanente', async () => {
    const primero = crearLimitadorCorreo(); await primero.pausar(50);
    const reiniciado = crearLimitadorCorreo();
    const turno = await reiniciado.esperarTurno({ limiteTiempo: performance.now() + 3000 });
    assert.ok(turno instanceof Date); assert.equal(await Limite.countDocuments(), 1);
});

test('limitador: si Mongo falla no autoriza solicitudes al proveedor', async () => {
    const l = crearLimitadorCorreo({ modelo: { updateOne: async () => { throw Error('DB no disponible'); } } });
    await assert.rejects(l.esperarTurno({ limiteTiempo: performance.now() + 3000 }), /DB no disponible/);
});
