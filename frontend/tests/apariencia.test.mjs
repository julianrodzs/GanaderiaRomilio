import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { APARIENCIA_VACIA, imagenRemota, normalizarApariencia, validarImagenApariencia } from '../src/utils/apariencia.mjs';

const require = createRequire(import.meta.url);
const componentes = (env = {}) => {
  const bundle = buildSync({
    stdin: {
      contents: `export { default as Imagen } from './src/Components/ImagenPersonalizada.js';
        export { default as Marca, estiloAcceso } from './src/Components/MarcaProducto.js';
        export { default as Login } from './src/Components/IniciarSesion.js';`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url))
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'],
    loader: { '.js': 'jsx' }, define: { 'import.meta.env': JSON.stringify(env) }
  });
  const modulo = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, { module: modulo, exports: modulo.exports, require, URL });
  return modulo.exports;
};
const { Imagen, Marca, Login, estiloAcceso } = componentes();
const render = (componente, props) => renderToStaticMarkup(React.createElement(componente, props));

test('las fincas y organizaciones no tienen imagenes predeterminadas', () => {
  assert.deepEqual(APARIENCIA_VACIA, { logo: '', dashboard: '', potreros: '' });
  const html = render(Imagen, { src: '', alt: 'Imagen de la finca' });
  assert.match(html, /Sin imagen/);
  assert.doesNotMatch(html, /<img|src=""|romilio|mapa-potreros/);
});

test('la cache antigua no recupera el logo ni el mapa locales de Romilio', () => {
  const resultado = normalizarApariencia({
    logo: '/assests/logo-romilio.png', dashboard: '/assests/mapa-potreros.png',
    potreros: '/assests/mapa-potreros.png', almacenamientoDisponible: true
  });
  assert.deepEqual(resultado, { ...APARIENCIA_VACIA, almacenamientoDisponible: true, cargando: false });
  assert.equal(normalizarApariencia(null).logo, '');
});

test('las imagenes remotas se conservan y las rutas o protocolos no admitidos se descartan', () => {
  const url = 'https://imagenes.example.test/organizaciones/org-1/logo.png';
  assert.equal(imagenRemota(` ${url} `), url);
  assert.equal(normalizarApariencia({ logo: url }).logo, url);
  for (const invalida of ['', '/assests/logo-romilio.png', 'javascript:alert(1)', 'data:image/png;base64,xxx', null, {}]) {
    assert.equal(imagenRemota(invalida), '');
  }
  assert.match(render(Imagen, { src: url, alt: 'Logo de la organizacion' }), /<img[^>]+src="https:\/\/imagenes.example.test/);
});

test('el acceso muestra CIR Ganadero sin logo de un cliente ni peticiones previas de organizacion', () => {
  const html = render(Login);
  assert.match(html, /<h1>CIR Ganadero<\/h1>/);
  assert.match(render(Marca), /CIR Ganadero/);
  assert.doesNotMatch(html, /logo-romilio|GanaderiaRomilio|admin@ganaderiaromilio/);
  assert.equal(estiloAcceso, undefined);
});

test('el login enlaza la pagina comercial sin prometer registro ni enviar datos de acceso', () => {
  const html = render(Login);
  assert.match(html, /¿Aún no tienes cuenta\?/);
  const enlace = html.match(/<a\b[^>]*class="auth-landing-link"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(enlace);
  assert.match(enlace, /href="https:\/\/cirganadero\.circonsulting\.net\/"/);
  assert.match(enlace, /Conoce CIR Ganadero/);
  assert.match(enlace, /referrerPolicy="no-referrer"/i);
  assert.doesNotMatch(enlace, /target=|role="button"|Reg[ií]strate|Crear cuenta|[?&](?:token|correo|email)=/);
  assert.ok(html.indexOf('Olvidé mi contraseña') < html.indexOf('auth-discover'));
});

test('logo y fondo del producto admiten URLs publicas R2 independientes de las fincas', () => {
  const publico = componentes({
    VITE_LOGO_PRODUCTO_URL: 'https://imagenes.example.test/producto/logo.webp',
    VITE_LOGIN_IMAGEN_URL: 'https://imagenes.example.test/producto/acceso.webp'
  });
  assert.match(render(publico.Marca), /src="https:\/\/imagenes.example.test\/producto\/logo.webp"/);
  assert.match(publico.estiloAcceso.backgroundImage, /https:\/\/imagenes.example.test\/producto\/acceso.webp/);
});

test('las vistas no reintroducen respaldos locales al fallar una imagen personalizada', () => {
  for (const archivo of ['context/AparienciaContext.js', 'Components/Navegacion.js', 'Components/ListaUsuario.js',
    'Components/Potreros.js', 'Components/ConfiguracionApariencia.js', 'Components/IniciarSesion.js',
    'Components/OlvideContrasena.js', 'Components/RestablecerContrasena.js', 'Components/AceptarInvitacion.js']) {
    const fuente = readFileSync(new URL(`../src/${archivo}`, import.meta.url), 'utf8');
    assert.doesNotMatch(fuente, /\/assests\/(logo-romilio|mapa-potreros)\.png/, archivo);
  }
});

test('la seleccion de imagen valida formato, archivo vacio y limite antes de enviarla', () => {
  assert.match(validarImagenApariencia(null), /vacía/);
  assert.match(validarImagenApariencia({ size: 0, type: 'image/jpeg' }), /vacía/);
  assert.match(validarImagenApariencia({ size: 500, type: 'application/pdf' }), /JPG, PNG o WebP/);
  assert.match(validarImagenApariencia({ size: 8 * 1024 * 1024 + 1, type: 'image/jpeg' }), /8 MB/);
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validarImagenApariencia({ size: 8 * 1024 * 1024, type }), '');
  }
});
