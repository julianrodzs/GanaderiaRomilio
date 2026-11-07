import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';

const bundle = buildSync({ entryPoints: [fileURLToPath(new URL('../src/Components/OperacionesFinancierasMultiFinca.js', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], loader: { '.js': 'jsx', '.css': 'empty' }, define: { 'import.meta.env': '{}' } });
const modulo = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, require: createRequire(import.meta.url), URL });

test('multifinca: ambos formularios tienen nombre accesible y conservan los campos financieros', () => {
  const html = renderToStaticMarkup(React.createElement(modulo.exports.default, { onCerrar() {} }));
  assert.match(html, /aria-label="Transferencia entre fincas"/);
  assert.match(html, /aria-label="Gasto compartido"/);
  for (const texto of ['Origen', 'Destino', 'Monto total', 'Categoría', 'Moneda', 'Fincas participantes', 'Registrar transferencia', 'Distribuir gasto']) assert.ok(html.includes(texto), texto);
  for (const modo of ['IGUAL', 'PORCENTAJE', 'MONTO']) assert.ok(html.includes(`value="${modo}"`));
  assert.match(html, /colSpan="7" class="multifinca-sin-movimientos"/);
});

test('multifinca: los estilos son locales, adaptables y distinguen las casillas de los importes', () => {
  const css = readFileSync(new URL('../src/Components/OperacionesFinancierasMultiFinca.css', import.meta.url), 'utf8');
  for (const regla of ['.operaciones-multifinca-grid form label', 'input:not([type=checkbox])', 'label.multifinca-seleccion', 'label.multifinca-valor', ':focus-visible', '@media (max-width: 1100px)', '@media (max-width: 600px)', 'min-width: 0', 'min-height: 44px']) assert.ok(css.includes(regla), regla);
});
