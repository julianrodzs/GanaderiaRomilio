import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const { outputFiles } = buildSync({
  stdin: {
    contents: `export { default as Tabla } from './src/Components/TablaDinamica.js';
      export { default as Foto } from './src/Components/FotoAnimal.js';`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url))
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['react'],
  loader: { '.js': 'jsx' },
  define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: 'http://localhost/api', DEV: false }) }
});
const modulo = { exports: {} };
vm.runInNewContext(outputFiles[0].text, { module: modulo, exports: modulo.exports, require });
const { Tabla, Foto } = modulo.exports;
const columnas = [
  { id: 'foto', label: 'Foto', accessor: animal => animal.foto || '' },
  { id: 'diio', label: 'DIIO', accessor: animal => animal.diio }
];
const datos = [
  { _id: 'a', diio: '100', foto: '/imagen-a' },
  { _id: 'b', diio: '2' },
  { _id: 'c', diio: '10', foto: '/imagen-c' }
];
const renderizarTabla = (opciones = {}) => renderToStaticMarkup(React.createElement(Tabla, {
  titulo: 'Inventario', columnas, datos, mostrarAcciones: false, ...opciones
}));
const diios = html => Array.from(html.matchAll(/<tr><td>.*?<\/td><td>(.*?)<\/td><\/tr>/g), fila => fila[1]);

test('inventario ordena DIIO numericamente aunque Foto sea la primera columna', () => {
  const html = renderizarTabla({ ordenInicial: { campo: 'diio', direccion: 'asc' } });
  assert.deepEqual(diios(html), ['2', '10', '100']);
  assert.match(html, /DIIO ↑/);
});

test('agregar o quitar fotos no cambia el orden inicial por DIIO', () => {
  const ordenInicial = { campo: 'diio', direccion: 'asc' };
  const sinFotos = datos.map(animal => ({ ...animal, foto: '' }));
  const conFotos = datos.map(animal => ({ ...animal, foto: '/foto' }));
  assert.deepEqual(diios(renderizarTabla({ ordenInicial, datos: sinFotos })), ['2', '10', '100']);
  assert.deepEqual(diios(renderizarTabla({ ordenInicial, datos: conFotos })), ['2', '10', '100']);
});

test('el orden inicial admite descendente y no cambia el comportamiento de otras tablas', () => {
  assert.deepEqual(diios(renderizarTabla({ ordenInicial: { campo: 'diio', direccion: 'desc' } })), ['100', '10', '2']);
  assert.match(renderizarTabla(), /Foto ↑/);
});

test('el inventario configura DIIO ascendente para ambas especies', () => {
  const fuente = readFileSync(new URL('../src/Components/Animales.js', import.meta.url), 'utf8');
  assert.match(fuente, /titulo=\{especie === 'Porcino' \? 'Porcinos' : 'Bovinos'\}[\s\S]*?ordenInicial=\{\{ campo: 'diio', direccion: 'asc' \}\}/);
});

test('solo la foto del detalle abre un visor accesible; la miniatura no', () => {
  const animal = { diio: '100', nombre: 'Luna', fotoPrincipal: { url: '/imagen.jpg' } };
  const detalle = renderToStaticMarkup(React.createElement(Foto, { animal, detalle: true }));
  assert.match(detalle, /aria-label="Ver foto completa de Luna"/);
  assert.match(detalle, /<dialog[^>]*aria-labelledby=/);
  assert.match(detalle, /Fotografía completa de Luna/);
  assert.match(detalle, /100 - Luna/);
  const miniatura = renderToStaticMarkup(React.createElement(Foto, { animal }));
  assert.doesNotMatch(miniatura, /<dialog|<button/);
});

test('un animal sin foto mantiene su inicial y no ofrece un visor vacio', () => {
  const html = renderToStaticMarkup(React.createElement(Foto, { animal: { nombre: 'Luna' }, detalle: true }));
  assert.match(html, /aria-label="Sin fotografía">L/);
  assert.doesNotMatch(html, /<dialog|<button/);
});
