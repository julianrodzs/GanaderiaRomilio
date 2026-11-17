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
  entryPoints: [fileURLToPath(new URL('../src/Components/FormularioAnimal.js', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react'], loader: { '.js': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'exponer-normalizacion-solo-en-memoria', setup(builder) {
    builder.onLoad({ filter: /Components[\\/]FormularioAnimal\.js$/ }, ({ path }) => ({
      contents: readFileSync(path, 'utf8') + '\nexport { camposEditablesAnimal, normalizarAnimal };',
      loader: 'jsx'
    }));
  } }]
});
const modulo = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, require: createRequire(import.meta.url) });
const { default: FormularioAnimal, camposEditablesAnimal, normalizarAnimal } = modulo.exports;
const renderizar = (props = {}) => renderToStaticMarkup(React.createElement(FormularioAnimal, props));

test('Nuevo animal renderiza con null, como lo envia el boton de Inventario', () => {
  const html = renderizar({ animalInicial: null, modo: 'crear' });
  assert.match(html, /<h2>Nuevo animal<\/h2>/);
  assert.match(html, /name="diio"[^>]*value=""/);
  assert.match(html, /<option value="Bovino" selected="">Bovino<\/option>/);
  assert.match(html, /Guardar animal/);
});

test('null y ausencia de animal inicial conservan los mismos valores predeterminados', () => {
  assert.equal(renderizar({ animalInicial: null }), renderizar());
  assert.deepEqual(Object.keys(camposEditablesAnimal(null)), []);
  assert.deepEqual(Object.keys(camposEditablesAnimal(undefined)), []);
  assert.deepEqual(normalizarAnimal(null), normalizarAnimal(undefined));
});

for (const especie of ['Bovino', 'Porcino']) test(`${especie}: crear y editar conservan especie, datos y fechas`, () => {
  const nuevo = renderizar({ animalInicial: { especie }, modo: 'crear' });
  assert.match(nuevo, new RegExp(`<option value="${especie}" selected="">${especie}</option>`));
  const html = renderizar({ modo: 'editar', animalInicial: {
    _id: 'fixture', especie, diio: '1001', nombre: 'Luna', sexo: 'Hembra',
    fechaNacimiento: '2026-01-15T00:00:00.000Z', pesoNacimiento: 0
  } });
  assert.match(html, /<h2>Editar animal<\/h2>/);
  assert.match(html, /name="diio"[^>]*value="1001"/);
  assert.match(html, /name="nombre"[^>]*value="Luna"/);
  assert.match(html, /name="fechaNacimiento"[^>]*value="2026-01-15"/);
  assert.match(html, /name="pesoNacimiento"[^>]*value="0"/);
  assert.match(html, /Actualizar animal/);
});

test('se mantiene la lista de campos editables sin copiar identidad, tenant ni operadores', () => {
  const campos = camposEditablesAnimal({
    nombre: 'Luna', pesoNacimiento: 0, _id: 'animal', organizacionId: 'org', fincaId: 'finca',
    fotoPrincipal: { url: 'https://example.test/foto.webp' }, $set: { estado: 'Vendido' }, 'estado.valor': 'Vendido'
  });
  assert.deepEqual(Object.keys(campos).sort(), ['nombre', 'pesoNacimiento']);
  assert.equal(campos.nombre, 'Luna'); assert.equal(campos.pesoNacimiento, 0);
  assert.deepEqual(Object.keys(camposEditablesAnimal(Object.create({ nombre: 'Heredado' }))), []);
});
