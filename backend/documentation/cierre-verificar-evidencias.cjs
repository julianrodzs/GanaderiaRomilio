// Verifica evidencias finales y escribe hashes del arbol revisado. Nunca lee .env.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const parse = file => {
    const buffer = read(file);
    return JSON.parse((buffer[0] === 255 && buffer[1] === 254 ? buffer.toString('utf16le') : buffer.toString('utf8')).replace(/^\uFEFF/, ''));
};
const sha = file => crypto.createHash('sha256').update(read(file)).digest('hex');
const doc = 'backend/documentation/';
const report = 'AUDIT_CIERRE_PRE_LANZAMIENTO.md', text = read(report).toString('utf8');
assert.match(text, /GO tecnico local/);
const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]).filter(link => !link.startsWith('http'));
assert.ok(links.every(file => file === doc + 'cierre-manifiesto.json' || fs.existsSync(path.join(root, file))), 'Referencia local ausente');

const global = parse(doc + 'cierre-remediacion-resultados.json');
assert.equal(global.resultado, 'PASS');
assert.equal(global.resultados.length, 12);
assert.ok(global.resultados.every(row => row.exit === 0));
const smoke = parse(doc + 'cierre-smoke-resultados.json');
assert.equal(Object.keys(smoke.indices).length, 65);
assert.equal(smoke.steps.length, 16);
assert.ok(smoke.steps.every(row => row.status === 'PASS'));
assert.equal(smoke.diagnosticoSinIndiceEventos, false);
assert.equal(smoke.checks.length, 9);
assert.ok(smoke.checks.every(row => row.status === 'PASS'));
assert.ok(!smoke.requests.some(row => /restablecer|reset-password/.test(row.url)));
const indiceEvento = smoke.indices.EventoAnimal.find(index => index.key.claveIdempotencia);
assert.equal(indiceEvento.unique, true);
assert.notEqual(indiceEvento.sparse, true);
assert.deepEqual(indiceEvento.partialFilterExpression, { claveIdempotencia: { $type: 'string' } });
const reproductores = parse(doc + 'cierre-reproductores.json');
assert.equal(reproductores.length, 5);
assert.ok(reproductores.every(row => row.exit === 0));
const standalone = parse(doc + 'cierre-standalone-resultados.json');
assert.equal(standalone.escenarios.length, 6);
assert.ok(standalone.escenarios.every(row => row.estado === 'PASS' && row.exit === 1 && row.escuchaHTTP === false));
const offline = parse(doc + 'cierre-offline-resultados.json');
assert.equal(offline.results.length, 3);
assert.ok(offline.results.every(row => row.ejecutado));
assert.equal(offline.results.find(row => row.status === 401).resumen.sesionExpirada, true);
const pwa = parse(doc + 'cierre-pwa-navegador-resultados.json');
assert.equal(pwa.resultado, 'PASS');
assert.equal(pwa.navegacionApiSinShell, true);
assert.equal(pwa.apiEnCache.length, 0);
assert.equal(pwa.version2Automatica, 'v2');
for (const app of ['backend', 'frontend']) assert.equal(parse(doc + 'cierre-' + app + '-npm-audit.json').metadata.vulnerabilities.total, 0);
const configuracion = parse(doc + 'cierre-configuracion-resultados.json');
assert.equal(configuracion.results.length, 7);
assert.ok(configuracion.results.every(row => row.ejecutado));
const planes = configuracion.planes;
assert.deepEqual(Object.values(planes).map(plan => plan.precioMensualUSD), [10, 20, 35, 60]);
const contarPruebas = (archivo, esperado) => {
    const log = read(doc + archivo).toString('utf8');
    assert.match(log, new RegExp('tests ' + esperado + '\\b'));
    assert.match(log, /fail 0/);
    return esperado;
};
const pruebas = {
    backend: contarPruebas('cierre-backend-tests.txt', 346),
    lunar: contarPruebas('cierre-frontend-lunar.txt', 6),
    tareas: contarPruebas('cierre-frontend-tareas.txt', 5)
};

const files = new Set([report, 'AUDIT_CIERRE_PRE_LANZAMIENTO_INICIAL.md', 'Agents.md',
    'backend/app.js', 'backend/index.js', 'backend/database.js', 'backend/.env.example',
    'backend/package.json', 'backend/package-lock.json', 'frontend/package.json',
    'frontend/package-lock.json', 'frontend/vite.config.js']);
function walk(dir) {
    for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const file = dir + '/' + item.name;
        if (item.isDirectory()) walk(file);
        else if (/\.(js|mjs|cjs|jsx)$/.test(file)) files.add(file);
    }
}
for (const dir of ['backend/config', 'backend/context', 'backend/controllers', 'backend/middleware',
    'backend/models', 'backend/routes', 'backend/services', 'backend/scripts', 'backend/tests',
    'frontend/src', 'frontend/tests']) walk(dir);
for (const file of fs.readdirSync(__dirname).filter(file => file.startsWith('cierre-') && file !== 'cierre-manifiesto.json')) files.add(doc + file);
for (const file of fs.readdirSync(__dirname).filter(file => file.endsWith('.repro.cjs') || file === 'ejecutar-regresion.cjs')) files.add(doc + file);
files.add(doc + 'cierre-remediacion.md');
const hashes = Object.fromEntries([...files].sort().filter(file => fs.existsSync(path.join(root, file))).map(file => [file, sha(file)]));
const out = {
    fecha: new Date().toISOString(), node: process.version,
    nota: 'Arbol y evidencias locales. No certifica configuracion de infraestructura externa.',
    verificacion: 'PASS', dictamen: 'GO tecnico local', referenciasLocales: links.length,
    modelos: 65, smoke: { pass: 16, total: 16, adicionales: 9 },
    pruebas, comandos: global.resultados.length, hashes
};
fs.writeFileSync(path.join(__dirname, 'cierre-manifiesto.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ verificacion: out.verificacion, dictamen: out.dictamen, archivos: Object.keys(hashes).length, referenciasLocales: links.length, pruebas }));
