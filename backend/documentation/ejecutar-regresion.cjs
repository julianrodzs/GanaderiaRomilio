const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Comparte los adaptadores mantenidos con las pruebas del modulo.
// cierre-smoke-integrado.cjs valida persistencia, indices y rollback reales.
module.exports = ({ modulo, cobertura, suites }) => {
    const root = path.resolve(__dirname, '..');
    assert.ok(cobertura.length && suites.length, 'La regresion debe declarar cobertura y suites.');
    suites.forEach((suite) => assert.ok(fs.existsSync(path.join(root, suite)), 'Suite ausente: ' + suite));
    console.log(JSON.stringify({ modulo, cobertura, suites, persistencia: 'adaptadores locales; no lee .env' }));
    const resultado = spawnSync(process.execPath, ['--test', ...suites], {
        cwd: root, env: { ...process.env, NODE_ENV: 'test' },
        stdio: 'inherit', windowsHide: true, timeout: 120000
    });
    if (resultado.error) console.error(resultado.error.message);
    process.exitCode = resultado.status === 0 ? 0 : 1;
};
