// Genera las evidencias de cierre. MongoDB/Edge usan perfiles y bases locales desechables.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backend = path.resolve(__dirname, '..');
const frontend = path.resolve(backend, '../frontend');
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const node = (archivo) => [process.execPath, [path.join(__dirname, archivo)], backend];
const npm = (argumentos, cwd) => [process.execPath, [npmCli, ...argumentos], cwd];
const pasos = [
    ['frontend-build', ...npm(['run', 'build'], frontend)],
    ['smoke-ejecucion', ...node('cierre-smoke-integrado.cjs')],
    ['reproductores-ejecucion', ...node('cierre-ejecutar-reproductores.cjs')],
    ['standalone', ...node('cierre-standalone.cjs')],
    ['configuracion-ejecucion', ...node('cierre-configuracion.cjs')],
    ['offline', ...node('cierre-offline.cjs')],
    ['pwa-navegador', ...node('cierre-pwa-navegador.cjs')],
    ['backend-tests', ...npm(['test'], backend)],
    ['frontend-lunar', ...npm(['run', 'test:lunar'], frontend)],
    ['frontend-tareas', ...npm(['run', 'test:tareas'], frontend)],
    ['backend-npm-audit', ...npm(['audit', '--omit=dev', '--json'], backend)],
    ['frontend-npm-audit', ...npm(['audit', '--omit=dev', '--json'], frontend)]
];
const resultados = [];
for (const [id, comando, args, cwd] of pasos) {
    const inicio = Date.now();
    const ejecucion = spawnSync(comando, args, {
        cwd, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: '1' }
    });
    const json = id.endsWith('npm-audit');
    const evidencia = 'cierre-' + id + (json ? '.json' : '.txt');
    fs.writeFileSync(path.join(__dirname, evidencia), (ejecucion.stdout || '') + (json ? '' : (ejecucion.stderr || '')));
    const resultado = { id, exit: ejecucion.status, error: ejecucion.error?.message, ms: Date.now() - inicio, evidencia };
    resultados.push(resultado);
    console.log(JSON.stringify(resultado));
    if (ejecucion.status !== 0) console.error((ejecucion.stderr || '') + (ejecucion.stdout || '').slice(-7000));
}
const salida = { fecha: new Date().toISOString(), resultado: resultados.every(r => r.exit === 0) ? 'PASS' : 'FAIL', resultados };
fs.writeFileSync(path.join(__dirname, 'cierre-remediacion-resultados.json'), JSON.stringify(salida, null, 2));
process.exitCode = salida.resultado === 'PASS' ? 0 : 1;
