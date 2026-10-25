// Arranque real con MongoDB 8 standalone desechable y variables sinteticas; no lee .env.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const out = { fecha: new Date().toISOString(), modo: 'production, MongoDB standalone real, sin dotenv', escenarios: [] };
let mongod;

const puertoLibre = () => new Promise(resolve => {
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1', () => {
        const port = socket.address().port;
        socket.close(() => resolve(port));
    });
});
async function main() {
    try {
        const port = await puertoLibre();
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganaderia-cierre-standalone-'));
        out.mongo = { port, dir };
        mongod = spawn(process.env.CIERRE_MONGOD || 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe', [
            '--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port),
            '--logpath', path.join(dir, 'mongod.log'), '--wiredTigerCacheSizeGB', '0.25'
        ], { windowsHide: true, stdio: 'ignore' });
        let spawnError;
        mongod.on('error', error => { spawnError = error; });
        for (let i = 0; i < 40; i++) {
            if (spawnError) throw spawnError;
            try {
                await new Promise((resolve, reject) => {
                    const socket = net.connect(port, '127.0.0.1');
                    socket.once('connect', () => { socket.end(); resolve(); });
                    socket.once('error', reject);
                });
                break;
            } catch (error) {
                if (i === 39) throw error;
                await delay(250);
            }
        }
        const base = {
            ...Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','TEMP','TMP','USERPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]])),
            NODE_ENV: 'production', PORT: String(await puertoLibre()),
            MONGODB_URI: 'mongodb://127.0.0.1:' + port + '/cierre_standalone',
            MONGODB_DB: 'cierre_standalone', CRON_MODE: 'external',
            JWT_SECRET: 'Cierre-Local-0123456789-abcdefghijklmnop',
            CRON_SECRET: 'Cron-Local-0123456789-abcdefghijklmnop',
            FRONTEND_URL: 'https://app.example.test'
        };
        const escenarios = [
            ['SIN_MONGODB_URI', { MONGODB_URI: '' }, /MONGODB_URI/],
            ['SIN_JWT_SECRET', { JWT_SECRET: '' }, /JWT_SECRET/],
            ['JWT_REPETIDO', { JWT_SECRET: 'a'.repeat(32) }, /JWT_SECRET/],
            ['SIN_CRON_SECRET', { CRON_SECRET: '' }, /CRON_SECRET/],
            ['FRONTEND_HTTP', { FRONTEND_URL: 'http://app.example.test' }, /FRONTEND_URL/],
            ['STANDALONE', {}, /replica set|transacciones/]
        ];
        for (const [id, cambios, mensaje] of escenarios) {
            const child = spawnSync(process.execPath, [
                '--require', path.join(__dirname, 'cierre-arranque-child.cjs'), path.join(__dirname, '../index.js')
            ], { env: { ...base, ...cambios }, windowsHide: true, encoding: 'utf8', timeout: 15000 });
            const logs = (child.stdout || '') + (child.stderr || '');
            assert.equal(child.error, undefined, id + ': ' + child.error?.message);
            assert.equal(child.status, 1, id + ': salida inesperada');
            assert.doesNotMatch(logs, /HTTP_LISTEN_ATTEMPT|Servidor se esta ejecutando/, id + ': abrio HTTP');
            assert.match(logs, mensaje, id + ': mensaje ausente');
            out.escenarios.push({ id, estado: 'PASS', exit: child.status, escuchaHTTP: false, mensaje: logs.trim() });
        }
    } catch (error) {
        out.error = error.stack;
        process.exitCode = 1;
    } finally {
        if (mongod && mongod.exitCode === null) {
            const terminado = new Promise(resolve => mongod.once('exit', resolve));
            mongod.kill();
            await terminado;
        }
        fs.writeFileSync(path.join(__dirname, 'cierre-standalone-resultados.json'), JSON.stringify(out, null, 2));
        console.log(JSON.stringify(out));
    }
}
main();
