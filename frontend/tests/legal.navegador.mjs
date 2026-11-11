// App real, API exclusivamente ficticia y perfil Edge aislado. Artefactos en TEMP.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const documentos = JSON.parse(readFileSync(path.join(root, 'src/legal/documentos.json'), 'utf8'));
const referencias = documentos.map(({ slug, version, hashSha256 }) => ({ slug, version, hashSha256 }));
const rutasPublicas = ['/legal', ...documentos.map(({ slug }) => `/legal/${slug}`)];
const artefactos = mkdtempSync(path.join(os.tmpdir(), 'cir-legal-qa-'));
const capturas = [], peticiones = [], inesperadas = [], externas = [], excepciones = [], pendientes = new Map();
const resultados = { rutasPublicas: 0, invitaciones: 0, descargas: 0, cuentas: 0 };
let servidor, navegador, socket, origen, secuencia = 0;
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jwtFicticio = (expirado = false) => `e30.${Buffer.from(JSON.stringify({
  exp: Math.floor(Date.now() / 1000) + (expirado ? -3600 : 3600), authTime: Math.floor(Date.now() / 1000)
})).toString('base64url')}.firma-ficticia`;
const sesion = (vencida = false, expirado = false) => ({
  token: jwtFicticio(expirado), usuario: { _id: 'usuario-legal-fixture', nombre: 'Ana', apellido: 'Prueba', rol: 'Veterinario', correo: 'ana@example.test' },
  organizacion: { _id: 'org-legal-fixture', nombre: 'Organizacion ficticia', suscripcion: { estadoSuscripcion: vencida ? 'VENCIDA' : 'ACTIVA' } },
  finca: { _id: 'finca-legal-fixture', nombre: 'Finca ficticia', codigo: 'QA', estado: 'Activa' },
  fincaId: 'finca-legal-fixture'
});
const sesiones = { activa: sesion(), vencida: sesion(true), expirada: sesion(true, true) };
const evidencia = (indice, otorgado = true) => ({
  _id: `evidencia-${indice}`, usuarioId: sesiones.activa.usuario._id, organizacionId: sesiones.activa.organizacion._id,
  documentoSlug: 'privacidad', tipoAceptacion: 'COMUNICACIONES_OPCIONALES', otorgado,
  versionDocumento: `0.${indice}-borrador`, fechaAceptacion: `2026-11-10T${String(10 + Math.floor(indice / 60)).padStart(2, '0')}:${String(indice % 60).padStart(2, '0')}:00Z`
});
const nuevoEstado = () => ({
  documentos: referencias, representante: false, aceptacionComercial: false, reglasUso: true, privacidad: true,
  comunicacionesOpcionales: false, aceptaciones: Array.from({ length: 15 }, (_, i) => evidencia(15 - i)), borrador: true
});
let estadoLegal = nuevoEstado();

const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++secuencia;
  const timer = setTimeout(() => { pendientes.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
  pendientes.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluar = async (expression) => {
  let respuesta;
  try { respuesta = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); }
  catch (error) { throw Error(`Evaluacion fallida: ${expression}`, { cause: error }); }
  if (respuesta.exceptionDetails) throw Error(JSON.stringify(respuesta.exceptionDetails));
  return respuesta.result.value;
};
const esperar = async (expresion) => {
  for (let i = 0; i < 160; i += 1) {
    if (await evaluar(`Boolean(${expresion})`)) return;
    await pausa(50);
  }
  throw Error(`No se cumplio ${expresion}: ${await evaluar('document.body.innerText.slice(0, 3000)')}`);
};
const ir = async (ruta, modoSesion = 'ninguna') => {
  const destino = new URL(ruta, origen);
  destino.searchParams.set('sesion', modoSesion);
  await cdp('Page.navigate', { url: destino.href });
  await esperar('window.__legalFixtureLista === true');
};
const click = (selector) => evaluar(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw Error('Control ausente: ' + ${JSON.stringify(selector)}); e.click(); })()`);
const campo = (selector, valor) => evaluar(`(() => {
  const e = document.querySelector(${JSON.stringify(selector)});
  if (!e) throw Error('Campo ausente: ' + ${JSON.stringify(selector)});
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(valor)});
  e.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
const capturar = async (nombre) => {
  const archivo = path.join(artefactos, `${nombre}.png`);
  const imagen = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(archivo, Buffer.from(imagen.data, 'base64'));
  capturas.push(archivo);
};
const sinDesbordamiento = async (contexto) => {
  const medidas = await evaluar(`({ ancho: innerWidth, pagina: document.documentElement.scrollWidth,
    cuerpo: document.body.scrollWidth, titulo: document.querySelector('h1')?.getBoundingClientRect().toJSON() })`);
  assert.ok(medidas.pagina <= medidas.ancho + 1 && medidas.cuerpo <= medidas.ancho + 1, `${contexto}: ${JSON.stringify(medidas)}`);
  const fuera = await evaluar(`Array.from(document.querySelectorAll('.legal-casilla, .legal-acciones button, .legal-cabecera, .legal-documentos article, .legal-texto table')).filter(e => {
    const r=e.getBoundingClientRect(); return r.width > innerWidth + 1 || r.left < -1 || r.right > innerWidth + 1;
  }).map(e=>e.className||e.tagName)`);
  assert.deepEqual(fuera, [], `${contexto}: controles fuera de pantalla`);
  const marca = await evaluar(`(() => {
    const e = document.querySelector('.legal-cabecera .login-logo.imagen-sin-configurar');
    if (!e) return null;
    const rango = document.createRange(); rango.selectNodeContents(e);
    const texto = rango.getBoundingClientRect(), caja = e.getBoundingClientRect();
    return { contenido: e.textContent, cabe: texto.left >= caja.left && texto.right <= caja.right
      && texto.top >= caja.top && texto.bottom <= caja.bottom, ajuste: getComputedStyle(e).whiteSpace };
  })()`);
  if (marca) {
    assert.equal(marca.contenido, 'CIR'); assert.equal(marca.ajuste, 'nowrap');
    assert.ok(marca.cabe, `${contexto}: CIR desborda su caja`);
  }
};
const verificarReferencias = (refs, slugs) => {
  assert.deepEqual(refs.map((doc) => doc.slug).sort(), [...slugs].sort());
  for (const ref of refs) {
    assert.deepEqual(Object.keys(ref).sort(), ['hashSha256', 'slug', 'version']);
    assert.deepEqual(ref, referencias.find((doc) => doc.slug === ref.slug));
  }
};
const responderApi = (req, ruta, cuerpo) => {
  if (req.method === 'GET' && ruta.pathname === '/api/invitaciones/contexto') {
    const token = ruta.searchParams.get('token');
    return { escenario: token.startsWith('organizacion') ? 'ORGANIZACION' : 'COLABORADOR',
      organizacionNombre: 'Organizacion ficticia para pruebas legales', requiereCuentaExistente: token === 'colaborador-existente',
      documentos: token === 'colaborador-desactualizado' ? referencias.map((doc) => ({ ...doc, hashSha256: 'hash-distinto' })) : referencias, borrador: true };
  }
  if (req.method === 'POST' && ['/api/invitaciones/aceptar', '/api/usuarios/invitaciones/aceptar'].includes(ruta.pathname)) {
    const representante = cuerpo.token.startsWith('organizacion');
    const existente = cuerpo.token === 'colaborador-existente';
    assert.equal(ruta.pathname, existente ? '/api/usuarios/invitaciones/aceptar' : '/api/invitaciones/aceptar');
    assert.equal(Boolean(req.headers.authorization), existente);
    if (!existente) assert.equal(cuerpo.contrasena, 'Contrasena-ficticia-2026');
    const legal = cuerpo.legal;
    assert.deepEqual(legal.aceptaciones, { reglasUso: !representante, terminosOrganizacion: representante, privacidad: true, comunicacionesOpcionales: false });
    assert.equal(typeof legal.claveIdempotencia, 'string'); assert.ok(legal.claveIdempotencia.length);
    verificarReferencias(legal.documentos, representante ? ['terminos', 'privacidad', 'suscripciones'] : ['terminos', 'privacidad']);
    return { mensaje: 'Invitacion ficticia aceptada.' };
  }
  assert.ok(req.headers.authorization, `API privada sin autenticacion: ${ruta.pathname}`);
  if (req.method === 'GET' && ruta.pathname === '/api/usuarios/perfil') return sesiones.vencida;
  if (req.method === 'GET' && ruta.pathname === '/api/plan/actual') return {
    plan: { codigo: 'ESENCIAL', nombre: 'Esencial', vigente: false, estado: 'Vencido', especiePlan: 'Bovino' },
    suscripcion: { estadoSuscripcion: 'VENCIDA', permiteOperar: false }, funcionalidades: { configuracionEmailAvanzada: false }, limites: {}, uso: {}, sobreLimite: {}
  };
  if (req.method === 'GET' && ruta.pathname === '/api/apariencia') return { organizacion: {}, finca: {}, almacenamiento: { disponible: false } };
  if (req.method === 'GET' && ruta.pathname === '/api/notificaciones') return { items: [] };
  if (req.method === 'GET' && ruta.pathname === '/api/notificaciones/no-leidas/count') return { cantidad: 0 };
  if (req.method === 'GET' && ruta.pathname === '/api/legal/estado') return estadoLegal;
  if (req.method === 'PATCH' && ruta.pathname === '/api/legal/comunicaciones') {
    assert.equal(typeof cuerpo.otorgado, 'boolean');
    assert.equal(typeof cuerpo.claveIdempotencia, 'string');
    verificarReferencias(cuerpo.documentos, ['privacidad']);
    estadoLegal.comunicacionesOpcionales = cuerpo.otorgado;
    estadoLegal.aceptaciones.unshift({ ...evidencia(estadoLegal.aceptaciones.length + 1, cuerpo.otorgado), versionDocumento: '0.9-borrador' });
    return estadoLegal;
  }
  throw Error(`API no prevista: ${req.method} ${ruta.pathname}`);
};

try {
  const bundle = await build({ stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import App from './src/App.js';
      import './src/index.css'; createRoot(document.getElementById('root')).render(<App />); window.__legalFixtureLista = true;`,
    resolveDir: root, loader: 'jsx'
  }, bundle: true, write: false, outfile: path.join(root, 'legal-fixture.js'), jsx: 'automatic', loader: { '.js': 'jsx' },
  define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_API_URL: '/api' }) } });
  servidor = http.createServer(async (req, res) => {
    const ruta = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    if (ruta.pathname.startsWith('/api/')) {
      let texto = ''; for await (const chunk of req) texto += chunk;
      const cuerpo = texto ? JSON.parse(texto) : null;
      peticiones.push({ ruta: ruta.pathname, query: ruta.search, metodo: req.method, cuerpo, autorizacion: Boolean(req.headers.authorization) });
      res.setHeader('Content-Type', 'application/json');
      try { res.end(JSON.stringify(responderApi(req, ruta, cuerpo))); }
      catch (error) { inesperadas.push(error.message); res.statusCode = 500; res.end(JSON.stringify({ mensaje: error.message })); }
      return;
    }
    if (ruta.pathname === '/legal-fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles.find((file) => file.path.endsWith('.js')).contents); }
    if (ruta.pathname === '/legal-fixture.css') { res.setHeader('Content-Type', 'text/css'); return res.end(bundle.outputFiles.find((file) => file.path.endsWith('.css')).contents); }
    if (ruta.pathname === '/favicon.ico') { res.statusCode = 204; return res.end(); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/legal-fixture.css"></head><body><div id="root"></div><script type="module" src="/legal-fixture.js"></script></body></html>');
  });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  origen = `http://127.0.0.1:${servidor.address().port}`;
  for (const ruta of rutasPublicas) {
    const respuesta = await fetch(`${origen}${ruta}`);
    assert.equal(respuesta.status, 200, ruta); assert.match(await respuesta.text(), /id="root"/);
  }
  const puertoTemporal = net.createServer();
  await new Promise((resolve) => puertoTemporal.listen(0, '127.0.0.1', resolve));
  const puerto = puertoTemporal.address().port;
  await new Promise((resolve) => puertoTemporal.close(resolve));
  navegador = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost',
    `--remote-debugging-port=${puerto}`, `--user-data-dir=${path.join(artefactos, 'perfil-edge')}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  navegador.on('error', (error) => excepciones.push(error.message));
  let pagina;
  for (let i = 0; i < 100; i += 1) {
    try { pagina = (await fetch(`http://127.0.0.1:${puerto}/json/list`).then((res) => res.json())).find((item) => item.type === 'page'); if (pagina) break; } catch {}
    await pausa(100);
  }
  assert.ok(pagina, 'Edge no inicio su pagina CDP');
  socket = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const mensaje = JSON.parse(data), pendiente = pendientes.get(mensaje.id);
    if (pendiente) {
      clearTimeout(pendiente.timer); pendientes.delete(mensaje.id);
      mensaje.error ? pendiente.reject(Error(JSON.stringify(mensaje.error))) : pendiente.resolve(mensaje.result);
    }
    if (mensaje.method === 'Runtime.exceptionThrown') excepciones.push(mensaje.params.exceptionDetails.text + ': ' + mensaje.params.exceptionDetails.exception?.description);
    if (mensaje.method === 'Fetch.requestPaused') {
      const { requestId, request } = mensaje.params;
      const permitida = new URL(request.url).origin === origen;
      if (!permitida) externas.push({ url: request.url, tipo: mensaje.params.resourceType });
      cdp(permitida ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(!permitida ? { errorReason: 'BlockedByClient' } : {}) })
        .catch((error) => excepciones.push(error.message));
    }
  });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Network.setBypassServiceWorker', { bypass: true });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    if (location.origin !== ${JSON.stringify(origen)}) return;
    const sesiones = ${JSON.stringify(sesiones)};
    const modo = new URL(location.href).searchParams.get('sesion');
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('ganaderiaDatosCentinela', 'no modificar');
    localStorage.setItem('ganaderiaOfflineDatabases', '[{"nombre":"centinela","usuarioId":"fixture"}]');
    if (modo === 'corrupta') localStorage.setItem('ganaderiaSesion', '{JSON-corrupto');
    else if (sesiones[modo]) localStorage.setItem('ganaderiaSesion', JSON.stringify(sesiones[modo]));
    window.__almacenInicial = Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]));
    window.__mutacionesLocales = []; window.__expiraciones = 0;
    addEventListener('ganaderiaSesionExpirada', () => window.__expiraciones++);
    for (const nombre of ['setItem','removeItem','clear']) {
      const original = Storage.prototype[nombre];
      Storage.prototype[nombre] = function(...args) {
        if (this === localStorage) window.__mutacionesLocales.push({nombre,args});
        return original.apply(this,args);
      };
    }
  })();` });

  for (const ancho of [1440, 390, 320, 820]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: 960, deviceScaleFactor: 1, mobile: ancho <= 390 });
    const nombre = ancho === 1440 ? 'desktop' : 'movil';
    for (const modo of ancho === 1440 ? ['ninguna', 'corrupta', 'expirada', 'vencida'] : ['vencida']) {
      for (const ruta of rutasPublicas) {
        const inicio = peticiones.length;
        await ir(ruta, modo); await esperar('document.querySelector(".legal-principal h1")');
        await evaluar('window.dispatchEvent(new Event("focus"))'); await pausa(60);
        assert.equal(await evaluar('document.head.querySelector("meta[name=robots]")?.content'), 'noindex');
        assert.deepEqual(await evaluar('window.__mutacionesLocales'), [], `${ruta}: modifico localStorage (${modo})`);
        assert.equal(await evaluar('window.__expiraciones'), 0);
        assert.ok(await evaluar('JSON.stringify(window.__almacenInicial) === JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])))'));
        assert.equal(peticiones.length, inicio, `${ruta}: una vista publica consulto API (${modo})`);
        await sinDesbordamiento(`${ruta}, ${ancho}, ${modo}`);
        if (ruta !== '/legal') {
          assert.ok(await evaluar('Array.from(document.querySelectorAll(".legal-indice a")).every(a=>document.getElementById(a.hash.slice(1)))'));
          assert.ok(await evaluar('document.querySelector(".legal-texto").innerText.length > 500'));
          const doc = documentos.find((item) => ruta === `/legal/${item.slug}`);
          if (doc.contenido.includes('| ---')) assert.ok(await evaluar('Boolean(document.querySelector(".legal-texto table tbody tr"))'));
        }
        if ((ancho === 1440 || ancho === 390) && modo === 'vencida') await capturar(`legal-${ruta.split('/').filter(Boolean).slice(1).join('-') || 'indice'}-${nombre}`);
        resultados.rutasPublicas += 1;
      }
    }
    await ir('/legal/privacidad', 'corrupta'); await esperar('document.querySelector(".legal-acciones button")');
    await evaluar('window.__impresiones=0; window.print=()=>{window.__impresiones++}');
    await click('.legal-acciones button:first-child');
    assert.equal(await evaluar('window.__impresiones'), 1);
    await cdp('Emulation.setEmulatedMedia', { media: 'print' });
    assert.ok(await evaluar(`['.legal-cabecera','.legal-migas','.legal-acciones','.legal-indice','.legal-pie'].every(s=>getComputedStyle(document.querySelector(s)).display==='none')`));
    assert.ok(await evaluar('document.querySelector(".legal-texto").getBoundingClientRect().height > 100'));
    await cdp('Emulation.setEmulatedMedia', { media: '' });
    await evaluar(`window.__blobLegal = null; window.__nombreDescarga = '';
      const crear = URL.createObjectURL.bind(URL); URL.createObjectURL = blob => {window.__blobLegal=blob;return crear(blob)};
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function() {if(this.download.endsWith('.md')){window.__nombreDescarga=this.download;return}return originalClick.call(this)};`);
    await click('.legal-acciones button:last-child');
    const copia = await evaluar('window.__blobLegal.text()');
    const privacidad = documentos.find((doc) => doc.slug === 'privacidad');
    assert.ok(copia.endsWith(privacidad.contenido)); assert.ok(copia.includes(privacidad.hashSha256));
    assert.ok(copia.includes(privacidad.version)); assert.ok(copia.includes(privacidad.fechaVigencia));
    assert.equal(await evaluar('window.__nombreDescarga'), `privacidad-${privacidad.version}-${privacidad.fechaVigencia}.md`);
    resultados.descargas += 1;

    for (const [token, modo] of [['organizacion-nueva', 'ninguna'], ['colaborador-nuevo', 'ninguna'], ['organizacion-nueva-con-sesion', 'activa'], ['colaborador-existente', 'activa']]) {
      const inicio = peticiones.length;
      await ir(`/aceptar-invitacion/${token}`, modo); await esperar('document.querySelector(".legal-casillas input")');
      const controles = await evaluar('Array.from(document.querySelectorAll(".legal-casillas input")).map(e=>({nombre:e.name,checked:e.checked,required:e.required}))');
      assert.equal(controles.length, 3); assert.ok(controles.every((item) => !item.checked));
      assert.equal(controles.filter((item) => item.required).length, 2);
      assert.equal(controles.find((item) => item.nombre === 'comunicacionesOpcionales').required, false);
      assert.ok(await evaluar(`Array.from(document.querySelectorAll('.legal-casillas .legal-casilla')).every(e => {
        const estilo = getComputedStyle(e); return estilo.textTransform === 'none' && estilo.fontWeight === '400';
      })`));
      const representante = token.startsWith('organizacion');
      assert.equal(controles[0].nombre, representante ? 'terminosOrganizacion' : 'reglasUso');
      const existente = token === 'colaborador-existente';
      assert.equal(await evaluar('document.querySelectorAll("input[type=password]").length'), existente ? 0 : 2);
      if (!existente) {
        await campo('input[type=password]:first-of-type', 'Contrasena-ficticia-2026');
        await campo('.auth-card label:nth-of-type(2) input[type=password]', 'Contrasena-ficticia-2026');
      }
      await evaluar('document.querySelector(".auth-card").requestSubmit()'); await pausa(50);
      assert.equal(peticiones.slice(inicio).filter((req) => req.metodo === 'POST').length, 0);
      await click(`input[name=${controles[0].nombre}]`);
      await evaluar('document.querySelector(".auth-card").requestSubmit()'); await pausa(50);
      assert.equal(peticiones.slice(inicio).filter((req) => req.metodo === 'POST').length, 0);
      await click('input[name=privacidad]');
      assert.equal(await evaluar('document.querySelector("input[name=comunicacionesOpcionales]").checked'), false);
      assert.ok(await evaluar('Array.from(document.querySelectorAll(".legal-casillas a")).every(a=>a.target==="_blank" && a.rel.includes("noopener"))'));
      if (!existente) assert.ok(await evaluar('Array.from(document.querySelectorAll("input[type=password]")).every(e=>e.value==="Contrasena-ficticia-2026")'));
      await sinDesbordamiento(`invitacion ${token}, ${ancho}`);
      if (ancho === 1440 || ancho === 390) await capturar(`legal-invitacion-${token}-${nombre}`);
      await evaluar('document.querySelector(".auth-card").requestSubmit()');
      await esperar('document.querySelector(".auth-card").textContent.includes("Aceptación registrada de prueba")');
      const solicitudes = peticiones.slice(inicio);
      assert.ok(solicitudes.filter((req) => req.ruta === '/api/invitaciones/contexto').every((req) => !req.autorizacion));
      const aceptacion = solicitudes.filter((req) => req.metodo === 'POST');
      assert.equal(aceptacion.length, 1);
      assert.equal(aceptacion[0].autorizacion, existente);
      assert.equal(aceptacion[0].cuerpo.legal.aceptaciones.comunicacionesOpcionales, false);
      assert.equal(aceptacion[0].ruta, existente ? '/api/usuarios/invitaciones/aceptar' : '/api/invitaciones/aceptar');
      assert.ok(!solicitudes.some((req) => req.ruta === '/api/usuarios/perfil'));
      resultados.invitaciones += 1;
    }
    await ir('/aceptar-invitacion/colaborador-desactualizado'); await esperar('document.querySelector(".legal-casillas")');
    assert.ok(await evaluar('document.querySelector(".auth-card [type=submit]").disabled'));
    assert.ok(await evaluar('document.querySelector(".auth-card").textContent.includes("Los documentos cambiaron")'));

    estadoLegal = nuevoEstado();
    await ir('/configuracion#legal-privacidad', 'vencida');
    await esperar('document.querySelector(".legal-evidencias tbody tr")');
    await esperar('document.querySelector(".suscripcion-banner")?.textContent.includes("venció")');
    assert.ok(await evaluar('Boolean(document.querySelector(".configuracion-cuenta") && document.querySelector("#legal-privacidad"))'));
    assert.equal(await evaluar('document.querySelector(".legal-preferencia input").disabled'), false);
    assert.equal(await evaluar('document.querySelector(".legal-preferencia input").checked'), false);
    assert.ok(await evaluar(`(() => { const estilo = getComputedStyle(document.querySelector('.legal-preferencia .legal-casilla'));
      return estilo.textTransform === 'none' && estilo.fontWeight === '400'; })()`));
    assert.equal(await evaluar('document.querySelectorAll(".legal-evidencias tbody tr").length'), 10);
    assert.ok(await evaluar('document.querySelector(".legal-evidencias tbody").textContent.includes("0.15-borrador")'));
    await click('.legal-cuenta button[aria-label="Página siguiente"]');
    await esperar('document.querySelectorAll(".legal-evidencias tbody tr").length === 5');
    assert.ok(await evaluar('document.querySelector(".legal-evidencias tbody").textContent.includes("0.1-borrador")'));
    await click('.legal-cuenta button[aria-label="Página anterior"]');
    await esperar('document.querySelectorAll(".legal-evidencias tbody tr").length === 10');
    const cambiosInicio = peticiones.length;
    for (const otorgado of [true, false]) {
      await click('.legal-preferencia input');
      await esperar(`document.querySelector('.legal-preferencia input') && !document.querySelector('.legal-preferencia input').disabled && document.querySelector('.legal-preferencia input').checked === ${otorgado}`);
      await esperar(`document.querySelector('.legal-preferencia p')?.textContent.includes('${otorgado ? 'otorgado.' : 'no otorgado.'}')`);
    }
    const cambios = peticiones.slice(cambiosInicio).filter((req) => req.ruta === '/api/legal/comunicaciones');
    assert.deepEqual(cambios.map((req) => req.cuerpo.otorgado), [true, false]);
    assert.ok(cambios.every((req) => req.metodo === 'PATCH' && req.autorizacion));
    assert.notEqual(cambios[0].cuerpo.claveIdempotencia, cambios[1].cuerpo.claveIdempotencia);
    assert.equal(estadoLegal.aceptaciones.length, 17);
    assert.ok(estadoLegal.aceptaciones.every((item) => item.usuarioId === sesiones.vencida.usuario._id));
    assert.ok(await evaluar('document.querySelector(".legal-evidencias tbody tr:first-child").textContent.includes("Revocado / no otorgado")'));
    assert.ok(await evaluar('document.querySelector(".legal-cuenta").textContent.includes("Preferencia registrada de prueba")'));
    await sinDesbordamiento(`Cuenta vencida, ${ancho}`);
    if (ancho === 1440 || ancho === 390) {
      await evaluar('document.getElementById("legal-privacidad").scrollIntoView()');
      await capturar(`legal-cuenta-vencida-${nombre}`);
    }
    resultados.cuentas += 1;
  }
  assert.deepEqual(inesperadas, []); assert.deepEqual(excepciones, []);
  // El CSS existente del acceso solicita una foto externa; CDP la bloquea antes de salir a la red.
  assert.ok(externas.every(({ url, tipo }) => tipo === 'Image' && new URL(url).hostname === 'images.unsplash.com'), JSON.stringify(externas));
  const reporte = { resultado: 'PASS', viewports: [1440, 390, 320, 820], http200: rutasPublicas,
    ...resultados, apiReal: false, mutacionesPublicas: 0, print: true, historialPaginado: true,
    comunicaciones: [false, true, false], imagenesExternasBloqueadas: externas.length, capturas, artefactos };
  writeFileSync(path.join(artefactos, 'resultado.json'), JSON.stringify(reporte, null, 2));
  console.log(JSON.stringify(reporte, null, 2));
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await capturar('fallo'); } catch {}
  }
  writeFileSync(path.join(artefactos, 'fallo.json'), JSON.stringify({ error: error.stack, peticiones, inesperadas, externas, excepciones, capturas }, null, 2));
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await cdp('Browser.close'); } catch {}
    socket.close();
  }
  for (const pendiente of pendientes.values()) { clearTimeout(pendiente.timer); pendiente.reject(Error('Fixture cerrado')); }
  pendientes.clear();
  if (navegador && navegador.exitCode === null) navegador.kill();
  if (servidor) { servidor.closeAllConnections(); await new Promise((resolve) => servidor.close(resolve)); }
}
