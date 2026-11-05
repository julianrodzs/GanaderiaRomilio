import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { SECCIONES_REPORTES, leerPreferenciasReportes, contarReportes } from '../src/utils/seccionesReportes.mjs';
import { etiquetaReporte, ATRIBUCIONES } from '../src/utils/etiquetasReportes.mjs';

const bundle = buildSync({ stdin: { contents: "export * from './src/Components/ReporteMetodosReproductivos.js';export { default as Secciones } from './src/Components/ReportesPorSecciones.js'", resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], loader: { '.js': 'jsx', '.css': 'empty' }, define: { 'import.meta.env': '{}' } });
const modulo = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, require: createRequire(import.meta.url), URL });
const render = (componente, props) => renderToStaticMarkup(React.createElement(modulo.exports[componente], props));

test('reportes: seis secciones tematicas con identidad estable', () => {
  assert.deepEqual(SECCIONES_REPORTES.map((s) => s.id), ['inventario', 'reproduccion', 'produccion', 'sanidad', 'comercializacion', 'finanzas']);
});
test('reportes: almacenamiento ausente, corrupto o bloqueado no impide abrir inventario', () => {
  for (const storage of [null, { getItem: () => '{' }, { getItem: () => { throw Error('Bloqueado'); } }]) assert.deepEqual(leerPreferenciasReportes(storage, 'clave'), { seleccion: 'todas', abiertas: ['inventario'] });
});
test('reportes: conserva contraer todas y descarta IDs desconocidos en preferencias', () => {
  assert.deepEqual(leerPreferenciasReportes({ getItem: () => JSON.stringify({ version: 1, seleccion: 'finanzas', abiertas: [] }) }, 'clave'), { seleccion: 'finanzas', abiertas: [] });
  assert.deepEqual(leerPreferenciasReportes({ getItem: () => JSON.stringify({ version: 1, seleccion: 'inyeccion', abiertas: ['sanidad', 'sanidad', 'desconocido'] }) }, 'clave'), { seleccion: 'todas', abiertas: ['sanidad'] });
});
test('reportes: contador distingue disponibilidad de plan de resúmenes y mensajes bloqueados', () => {
  assert.deepEqual(contarReportes([{ cantidad: 2, disponibles: 1 }, { cantidad: 0, disponibles: 0 }, { cantidad: 1, disponibles: 0 }]), { total: 3, disponibles: 1 });
});
test('reportes: cabeceras accesibles y solo inventario abierto por defecto', () => {
  const html = render('Secciones', { bloques: [{ id: 'a', seccion: 'inventario', contenido: 'Inventario visible' }, { id: 'b', seccion: 'finanzas', disponibles: 0, contenido: 'Finanzas reservadas' }], clavePersistencia: 'prueba' });
  assert.equal((html.match(/aria-expanded="true"/g) || []).length, 1);
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 5);
  assert.match(html, /Inventario visible/); assert.doesNotMatch(html, /Finanzas reservadas/);
  assert.match(html, /aria-controls=/); assert.match(html, /Expandir todas/); assert.match(html, /Contraer todas/);
});
test('reportes: atribuciones presentan etiquetas humanas sin enums crudos', () => {
  for (const [estado, etiqueta] of Object.entries(ATRIBUCIONES)) {
    const html = render('AtribucionReporte', { estado }); assert.ok(html.includes(etiqueta.texto)); assert.ok(!html.includes(estado));
  }
  assert.equal(etiquetaReporte('REPRODUCCION'), 'Reproducción'); assert.equal(etiquetaReporte('SIN_DATOS_HISTORICOS'), 'Sin datos historicos');
});
test('reportes: partos usan badges de método y atribución y conservan la fecha civil', () => {
  const html = render('TablaPartosMetodo', { partos: [{ _id: 'p', fecha: '2026-11-04T00:00:00Z', metodo: 'IA_CONVENCIONAL', estadoAtribucion: 'SIN_SERVICIO', animal: { diio: '1001' } }] });
  assert.match(html, /Inseminación artificial convencional/); assert.match(html, /Sin servicio registrado/); assert.doesNotMatch(html, />SIN_SERVICIO</); assert.match(html, /4\/11\/2026/);
});
test('reportes: indicadores alineados, método legible, IA destacada y nota con tildes', () => {
  const html = render('IndicadoresMetodo', { especie: 'Bovino', indicadores: { iaTotal: 3, porMetodo: [{ metodo: 'IATF', nombre: 'Inseminacion sin tildes', servicios: 3, prenecesAtribuidas: 2, tasaPrenez: null }] } });
  assert.match(html, /Inseminación a tiempo fijo \(IATF\)/); assert.doesNotMatch(html, /Inseminacion sin tildes/);
  assert.match(html, /reporte-numero/); assert.match(html, /reporte-ia-chip/); assert.match(html, /Cohorte de servicios del período/); assert.match(html, /Sin datos/);
});
test('reportes: estilos comunes cubren tablas no dinámicas, scroll y movimiento reducido', () => {
  const css = readFileSync(new URL('../src/Components/Reportes.css', import.meta.url), 'utf8');
  for (const regla of ['.reportes-page .tabla-scroll th', 'padding: 12px 16px', 'min-width: 720px', 'overflow-x: auto', 'prefers-reduced-motion']) assert.ok(css.includes(regla), regla);
});

test('reportes: partos declarados se muestran sin convertirlos en servicios o tasas ficticias', () => {
  const html = render('IndicadoresMetodo', { especie: 'Porcino', indicadores: { iaTotal: 0, porMetodo: [
    { metodo: 'MONTA_NATURAL', partos: 3, partosSinServicio: 3, servicios: 0, prenecesAtribuidas: 0, tasaPrenez: null },
    { metodo: 'IATF', partos: 99, servicios: 99 }
  ] } });
  assert.match(html, /Partos registrados/);
  assert.match(html, /3 parto\(s\) del período/);
  assert.match(html, /no como servicios ni preñeces atribuidas/);
  assert.match(html, /Sin datos/);
  assert.doesNotMatch(html, /Inseminación a tiempo fijo/);
});
