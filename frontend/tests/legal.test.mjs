import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { aceptacionesVacias, catalogoCoincide, claveParaOperacion, copiaDescargable, documentosParaAceptaciones, esRutaLegal, formatearFechaLegal, validarAceptaciones } from '../src/legal/legal.mjs';
import { parsearTextoLegal } from '../src/legal/markdown.mjs';

const catalogo = JSON.parse(readFileSync(new URL('../src/legal/documentos.json', import.meta.url), 'utf8'));
const referencias = catalogo.map(({ slug, version, hashSha256 }) => ({ slug, version, hashSha256 }));
const bundle = buildSync({ stdin: {
  contents: `export { default as App } from './src/App.js';
    export { default as Casillas } from './src/legal/CasillasLegales.js';
    export { default as Login } from './src/Components/IniciarSesion.js';
    export { HistorialLegal } from './src/legal/LegalPrivacidadCuenta.js';`,
  resolveDir: fileURLToPath(new URL('../', import.meta.url))
}, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], jsx: 'automatic',
loader: { '.js': 'jsx', '.css': 'empty' }, define: { 'import.meta.env': '{}' } });
const modulo = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, {
  module: modulo, exports: modulo.exports, require: createRequire(import.meta.url), URL,
  localStorage: new Proxy({}, { get() { throw Error('Una página pública no debe leer almacenamiento de sesión'); } }),
  fetch() { throw Error('Una página pública no debe consultar la API'); }
});
const render = (nombre, props) => renderToStaticMarkup(React.createElement(modulo.exports[nombre], props));

test('legal: catálogo limitado a cuatro públicos y SHA-256 del texto exacto', () => {
  assert.deepEqual(catalogo.map((doc) => doc.slug), ['terminos', 'privacidad', 'suscripciones', 'soporte']);
  for (const doc of catalogo) {
    assert.equal(doc.version, '0.9-borrador');
    assert.equal(doc.estado, 'BORRADOR_PRUEBA');
    assert.equal(doc.hashSha256, createHash('sha256').update(doc.contenido, 'utf8').digest('hex'));
  }
});

test('legal: App SSR resuelve índice y cuatro documentos sin sesión, API ni proveedor de plan', () => {
  for (const slug of ['', ...catalogo.map((doc) => doc.slug)]) {
    const html = render('App', { ruta: `/legal${slug ? `/${slug}` : ''}` });
    assert.match(html, /Centro Legal/);
    assert.match(html, /no documentos jurídicos aprobados/);
    assert.match(html, /<meta name="robots" content="noindex"/);
    assert.doesNotMatch(html, /Validando sesion|Iniciar sesion|No se pudo cargar el plan/);
    if (slug) {
      assert.match(html, /Versión 0.9-borrador/);
      assert.match(html, /Referencia del borrador/);
      assert.match(html, /Imprimir \/ Guardar PDF/);
      assert.match(html, /Descargar copia \(\.md\)/);
      assert.match(html, /aria-label="Secciones del documento"/);
    }
  }
  const indice = render('App', { ruta: '/legal' });
  for (const doc of catalogo) assert.ok(indice.includes(`href="/legal/${doc.slug}"`));
  assert.doesNotMatch(indice, /href="[^\"]*(?:REGISTRO_TRATAMIENTOS|FICHA_OPERADOR|ANEXO_TRATAMIENTO|ORDEN_DE_SERVICIO)/);
  assert.match(render('App', { ruta: '/legal/interno' }), /Documento no encontrado/);
});

test('legal: frontera pública exacta y login sin casillas ni barrera retroactiva', () => {
  for (const ruta of ['/legal', '/legal/', '/legal/privacidad']) assert.ok(esRutaLegal(ruta));
  for (const ruta of ['/legalidad', '/login', '/mi-plan']) assert.equal(esRutaLegal(ruta), false);
  const html = render('Login');
  for (const slug of ['terminos', 'privacidad', 'soporte']) assert.ok(html.includes(`href="/legal/${slug}"`));
  assert.doesNotMatch(html, /type="checkbox"/);
});

test('legal: colaborador y representante tienen casillas separadas, opcional falsa y nunca premarcadas', () => {
  const valores = aceptacionesVacias();
  for (const organizacion of [true, false]) {
    const html = render('Casillas', { valores, onChange() {}, organizacion });
    assert.equal((html.match(/type="checkbox"/g) || []).length, 3);
    assert.equal((html.match(/required=""/g) || []).length, 2);
    assert.doesNotMatch(html, /checked=/);
    assert.ok(html.includes(organizacion ? 'name="terminosOrganizacion"' : 'name="reglasUso"'));
    assert.ok(!html.includes(organizacion ? 'name="reglasUso"' : 'Condiciones de Suscripción'));
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  }
  assert.equal(validarAceptaciones({ ...valores, reglasUso: true, privacidad: true }), '');
  assert.equal(validarAceptaciones({ ...valores, terminosOrganizacion: true, privacidad: true }, { organizacion: true }), '');
  assert.match(validarAceptaciones({ ...valores, privacidad: true }, { organizacion: true }), /Suscripción/);
  assert.match(validarAceptaciones({ ...valores, terminosOrganizacion: true }, { organizacion: true }), /privacidad/);
});

test('legal: referencias cerradas, coincidencia exacta y claves estables para reintentos', () => {
  assert.ok(catalogoCoincide(referencias, catalogo, ['terminos', 'privacidad']));
  assert.equal(catalogoCoincide(referencias.map((doc) => ({ ...doc, hashSha256: 'otro' })), catalogo, ['privacidad']), false);
  assert.equal(catalogoCoincide(referencias.map((doc) => ({ ...doc, version: 'otra' })), catalogo, ['privacidad']), false);
  assert.equal(catalogoCoincide([], catalogo, ['privacidad']), false);
  for (const valores of [{ reglasUso: true }, { terminosOrganizacion: true }, {}]) {
    const docs = documentosParaAceptaciones(valores, catalogo);
    assert.ok(docs.every((doc) => Object.keys(doc).join(',') === 'slug,version,hashSha256'));
    assert.ok(!docs.some((doc) => doc.slug === 'soporte'));
  }
  const ref = { current: null }; let secuencia = 0;
  const clave = () => `clave-${++secuencia}`;
  assert.equal(claveParaOperacion(ref, { otorgado: true }, clave), 'clave-1');
  assert.equal(claveParaOperacion(ref, { otorgado: true }, clave), 'clave-1');
  assert.equal(claveParaOperacion(ref, { otorgado: false }, clave), 'clave-2');
});

test('legal: parser probado agrupa líneas, listas continuadas, tablas e índice sin permitir HTML ni enlaces peligrosos', () => {
  const { html, indice } = parsearTextoLegal('## Datos **personales**\n\nUn párrafo envuelto\na otra línea.\n\n- Un elemento\n  con continuación\n\n| A | B |\n| --- | --- |\n| X | Y |\n\n<script>alert(1)</script>\n\n[malo](javascript:alert) [bien](https://example.test)');
  assert.match(html, /<p>Un párrafo envuelto\na otra línea\.<\/p>/);
  assert.match(html, /<li>Un elemento\ncon continuación<\/li>/);
  assert.match(html, /<table>[\s\S]*<td>Y<\/td>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|href="javascript:/);
  assert.match(html, /href="https:\/\/example.test" target="_blank" rel="noopener noreferrer"/);
  assert.deepEqual(indice, [{ id: 'seccion-1', texto: 'Datos personales' }]);
  for (const doc of catalogo) {
    const parsed = parsearTextoLegal(doc.contenido);
    for (const item of parsed.indice) assert.ok(parsed.html.includes(`id="${item.id}"`));
    if (doc.contenido.includes('| ---')) assert.ok(parsed.html.includes('<table>'));
  }
});

test('legal: descarga conserva texto exacto, versión, hash y fecha de referencia', () => {
  for (const doc of catalogo) {
    const copia = copiaDescargable(doc);
    assert.ok(copia.endsWith(doc.contenido));
    assert.ok(copia.includes(doc.hashSha256));
    assert.ok(copia.includes(`Versión: ${doc.version}`));
    assert.ok(copia.includes(`Fecha de referencia del borrador: ${doc.fechaVigencia}`));
  }
  assert.match(formatearFechaLegal('2026-11-10'), /10/);
});

test('legal: historial paginado muestra registros de prueba, versión histórica y revocaciones', () => {
  const aceptaciones = Array.from({ length: 15 }, (_, i) => ({
    _id: String(i), documentoSlug: 'privacidad', tipoAceptacion: 'COMUNICACIONES_OPCIONALES',
    versionDocumento: `0.${i}-borrador`, fechaAceptacion: '2026-11-10T16:00:00Z', otorgado: i !== 0
  }));
  const html = render('HistorialLegal', { aceptaciones, borrador: true });
  assert.match(html, /Aceptación registrada de prueba/);
  assert.match(html, /Revocado \/ no otorgado/);
  assert.match(html, /0.9-borrador/);
  assert.doesNotMatch(html, /0.10-borrador/);
  assert.match(html, /Página 1 de 2/);
});

const apiFuente = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/import\.meta\.env/g, '__env')
  .replace(/export \{[^}]+\};/g, '').replace(/export const /g, 'const ');
const prepararApi = () => {
  const peticiones = [];
  const nombres = ['obtenerDocumentosLegales', 'obtenerDocumentoLegal', 'obtenerContextoInvitacion', 'obtenerEstadoLegal', 'aceptarInvitacionNueva', 'aceptarInvitacionExistente', 'registrarAceptacionesLegales', 'actualizarComunicacionesLegales'];
  const api = vm.runInNewContext(`${apiFuente}\n({${nombres.join(',')}})`, {
    __env: { VITE_API_URL: '/api' }, FormData, URLSearchParams, Event, CustomEvent,
    localStorage: { getItem: () => JSON.stringify({ token: 'fixture' }) }, window: { dispatchEvent() {} },
    obtenerContextoOffline() { throw Error('No se requiere contexto offline'); },
    fetch: async (url, opciones) => { peticiones.push({ url, opciones }); return { ok: true, json: async () => ({}) }; }
  });
  return { api, peticiones };
};

test('legal: documentos y contexto son públicos sin JWT; estado y escrituras conservan autenticación', async () => {
  const { api, peticiones } = prepararApi();
  await api.obtenerDocumentosLegales(); await api.obtenerDocumentoLegal('privacidad');
  await api.obtenerContextoInvitacion('a&b');
  assert.ok(peticiones.every(({ opciones }) => !opciones.headers.Authorization));
  assert.equal(peticiones[2].url, '/api/invitaciones/contexto?token=a%26b');
  const legal = { aceptaciones: { ...aceptacionesVacias(), reglasUso: true, privacidad: true }, documentos: referencias.slice(0, 2), claveIdempotencia: 'fixture-legal' };
  await api.aceptarInvitacionNueva('token', 'contrasena', legal);
  assert.equal(peticiones[3].opciones.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(peticiones[3].opciones.body).legal, legal);
  await api.aceptarInvitacionExistente('token', legal); await api.obtenerEstadoLegal();
  await api.registrarAceptacionesLegales(legal);
  await api.actualizarComunicacionesLegales({ otorgado: false, documentos: referencias.filter((d) => d.slug === 'privacidad'), claveIdempotencia: 'fixture-revocacion' });
  assert.ok(peticiones.slice(4).every(({ opciones }) => opciones.headers.Authorization === 'Bearer fixture'));
  assert.equal(peticiones.at(-1).opciones.method, 'PATCH');
});

test('legal: invitación NUEVA con sesión previa usa API pública y contraseña; existente usa API autenticada', async () => {
  const codigo = buildSync({
    stdin: { contents: "export { enviarAceptacionInvitacion } from './src/Components/AceptarInvitacion.js';", resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', '*/services/api'],
    loader: { '.js': 'jsx', '.css': 'empty' }, define: { 'import.meta.env': '{}' }
  });
  const llamadas = [];
  const mocks = {
    aceptarInvitacionNueva: (...args) => llamadas.push({ metodo: 'nueva', args }),
    aceptarInvitacionExistente: (...args) => llamadas.push({ metodo: 'existente', args })
  };
  const moduloInvitacion = { exports: {} };
  const require = createRequire(import.meta.url);
  vm.runInNewContext(codigo.outputFiles[0].text, { module: moduloInvitacion, exports: moduloInvitacion.exports,
    require: (id) => id.endsWith('/services/api') ? mocks : require(id) });
  const legal = { aceptaciones: { ...aceptacionesVacias(), terminosOrganizacion: true, privacidad: true }, documentos: referencias, claveIdempotencia: 'fixture' };
  await moduloInvitacion.exports.enviarAceptacionInvitacion({ contexto: { requiereCuentaExistente: false }, sesion: { token: 'otra-cuenta' }, token: 'nueva', contrasena: 'contrasena-fixture', legal });
  assert.equal(llamadas[0].metodo, 'nueva');
  assert.equal(llamadas[0].args[1], 'contrasena-fixture');
  assert.equal(llamadas[0].args[2].aceptaciones.comunicacionesOpcionales, false);
  await moduloInvitacion.exports.enviarAceptacionInvitacion({ contexto: { requiereCuentaExistente: true }, sesion: { token: 'cuenta' }, token: 'existente', legal });
  assert.equal(llamadas[1].metodo, 'existente');
  assert.equal(llamadas[1].args.length, 2);
});
