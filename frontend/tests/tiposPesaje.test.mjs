import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { TIPOS_PESAJE, normalizarTipoPesaje } from '../src/constants/tiposPesaje.mjs';
const require = createRequire(import.meta.url);
const b = buildSync({ entryPoints: [fileURLToPath(new URL('../src/Components/TipoPesaje.js', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], loader: { '.js': 'jsx', '.css': 'empty' } });
const modulo = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module: modulo, exports: modulo.exports, require });
test('pesajes: catalogo compartido y badges sin enums crudos ni dependencia exclusiva del color', () => {
  assert.deepEqual(TIPOS_PESAJE.map((t) => t.valor), require('../../backend/config/tiposPesaje').TIPOS_PESAJE);
  for (const tipo of TIPOS_PESAJE) {
    const html = renderToStaticMarkup(React.createElement(modulo.exports.BadgeTipoPesaje, { tipo: tipo.valor }));
    assert.ok(html.includes(`>${tipo.corto}</span>`)); assert.ok(!html.includes(`>${tipo.valor}</span>`));
  }
  for (const anterior of ['Individual', 'Lote', 'Importacion', undefined]) assert.equal(normalizarTipoPesaje(anterior), 'REGULAR');
});
test('pesajes: selector ofrece cinco tipos y destete muestra aviso; regular no lo muestra', () => {
  const html = renderToStaticMarkup(React.createElement(modulo.exports.SelectorTipoPesaje, { valor: 'REGULAR', onChange() {} }));
  assert.equal((html.match(/<option/g) || []).length, 5);
  assert.match(renderToStaticMarkup(React.createElement(modulo.exports.NotaPesajeDestete, { tipo: 'DESTETE' })), /Actualizará automáticamente/);
  assert.equal(renderToStaticMarkup(React.createElement(modulo.exports.NotaPesajeDestete, { tipo: 'REGULAR' })), '');
});
test('pesajes: inventario, lote y reportes reutilizan el tipo sin crear otra pantalla de destete', () => {
  for (const archivo of ['Animales.js', 'Lotes.js', 'Pesajes.js', 'Reportes.js']) assert.match(readFileSync(new URL(`../src/Components/${archivo}`, import.meta.url), 'utf8'), /TipoPesaje/);
  const reporte = readFileSync(new URL('../src/Components/ReportePesoDestete.js', import.meta.url), 'utf8');
  assert.match(reporte, /Destetes individuales/); assert.match(reporte, /Porcinos · Camadas/);
});
