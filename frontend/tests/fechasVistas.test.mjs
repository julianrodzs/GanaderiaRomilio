import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { columnasRotaciones as rotaciones, columnas as potreros } from './src/Components/Potreros.js';
      export { columnas as finanzas } from './src/Components/Finanzas.js';
      export { default as FormularioFinanciero } from './src/Components/FormularioMovimientoFinanciero.js';
      export { default as FormularioRotacion } from './src/Components/FormularioRotacion.js';`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'jsx'
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react'], loader: { '.js': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'exponer-columnas-reales-para-prueba', setup(builder) {
    builder.onLoad({ filter: /Components[\\/](Potreros|Finanzas)\.js$/ }, ({ path }) => ({
      contents: readFileSync(path, 'utf8') + (path.endsWith('Potreros.js') ? '\nexport { columnasRotaciones, columnas };' : '\nexport { columnas };'),
      loader: 'jsx'
    }));
  } }]
});
const modulo = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, require: createRequire(import.meta.url), URL });
const vistas = modulo.exports;

test('vistas: rotaciones y mantenimiento muestran exactamente el dia del formulario', () => {
  const rotacion = { fechaEntrada: '2026-11-07T00:00:00.000Z', fechaSalida: '2026-11-12T00:00:00.000Z' };
  assert.equal(vistas.rotaciones.find((c) => c.id === 'fechaEntrada').accessor(rotacion), '07/11/2026');
  assert.equal(vistas.rotaciones.find((c) => c.id === 'fechaSalida').accessor(rotacion), '12/11/2026');
  for (const campo of ['ultimaAplicacionHerbicida', 'ultimaChapia', 'ultimaFertilizacion']) {
    assert.equal(vistas.potreros.find((c) => c.id === campo).accessor({ [campo]: rotacion.fechaEntrada }), '07/11/2026');
  }
});

test('vistas: finanzas busca por la misma fecha que presenta y conserva el orden temporal', () => {
  const columna = vistas.finanzas.find((c) => c.id === 'fecha');
  const movimiento = { fecha: '2026-11-07T00:00:00.000Z' };
  assert.equal(columna.accessor(movimiento), '07/11/2026');
  assert.equal(columna.searchAccessor(movimiento), '07/11/2026 2026-11-07');
  assert.equal(columna.sortAccessor(movimiento), Date.parse(movimiento.fecha));
});

test('vistas: inputs reales de rotacion y movimiento conservan el dia al editar', () => {
  const htmlRotacion = renderToStaticMarkup(React.createElement(vistas.FormularioRotacion, {
    rotacionInicial: { fechaEntrada: '2026-11-07T00:00:00.000Z', fechaSalida: '2026-11-12T00:00:00.000Z' }, potreros: []
  }));
  assert.match(htmlRotacion, /name="fechaEntrada"[^>]*value="2026-11-07"/);
  assert.match(htmlRotacion, /name="fechaSalida"[^>]*value="2026-11-12"/);
  const htmlFinanzas = renderToStaticMarkup(React.createElement(vistas.FormularioFinanciero, { movimientoInicial: { fecha: '2026-11-07T00:00:00.000Z' } }));
  assert.match(htmlFinanzas, /name="fecha"[^>]*value="2026-11-07"/);
});
