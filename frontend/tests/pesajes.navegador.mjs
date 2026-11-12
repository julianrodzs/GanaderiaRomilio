// Pesajes reales contra API ficticia en loopback. Sin MongoDB ni servicios externos.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http'; import net from 'node:net'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { build } from 'esbuild';
const root = fileURLToPath(new URL('../', import.meta.url)), pendientes = new Map(), peticiones = [], errores = [];
let server, browser, socket, secuencia = 0, filas = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++secuencia, timer = setTimeout(() => { pendientes.delete(id); reject(Error(method)); }, 15000); pendientes.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
const evaluar = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const hasta = async (expresion) => { for (let i = 0; i < 100; i++) { if (await evaluar(`Boolean(${expresion})`)) return; await esperar(50); } throw Error(expresion); };
const cambiar = (selector, valor) => evaluar(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
const animal = (especie) => ({ _id: especie, identificadorFinca: '1001', diio: '1001', nombre: 'Cria de prueba', sexo: 'Hembra', especie, estado: 'Activo', fechaNacimiento: '2026-01-01' });
try {
  const bundle = await build({ stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import Pesajes from'./src/Components/Pesajes.js';const especie=new URLSearchParams(location.search).get('especie')||'Bovino';localStorage.setItem('ganaderiaEspecie',especie);localStorage.setItem('ganaderiaSesion',JSON.stringify({token:'fixture',usuario:{_id:'u',organizacionId:'o'},organizacion:{_id:'o'},fincaId:'f'}));window.confirm=()=>true;window.alert=()=>{};createRoot(document.getElementById('root')).render(<Pesajes rolUsuario="Administrador"/>);`, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: path.join(root, 'fixture.js'), loader: { '.js': 'jsx' }, define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_API_URL: '/api' }) }, plugins: [{ name: 'plan-esencial-ficticio', setup(b) { b.onLoad({ filter: /context[\\/]PlanContext\.js$/ }, () => ({ contents: "export const usePlan=()=>({plan:{plan:{vigente:true,modoEspecies:'UNA_ESPECIE',especiePlan:new URLSearchParams(location.search).get('especie')||'Bovino'}},puedeUsarEspecie:e=>e===(new URLSearchParams(location.search).get('especie')||'Bovino'),tieneFeature:()=>false});", loader: 'js' })); } }] });
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      let cuerpo = ''; for await (const p of req) cuerpo += p; const body = cuerpo ? JSON.parse(cuerpo) : null;
      peticiones.push({ ruta: url.pathname, metodo: req.method, body }); let datos = [];
      if (url.pathname === '/api/animales') datos = [animal(url.searchParams.get('especie') || 'Bovino')];
      if (url.pathname === '/api/pesajes' && req.method === 'GET') datos = filas;
      if (url.pathname === '/api/pesajes' && req.method === 'POST') { const p = { ...body, _id: 'nuevo', animal: animal(body.animal) }; filas.push(p); datos = p; }
      if (url.pathname === '/api/pesajes/nuevo' && req.method === 'PUT') { filas = filas.map((p) => p._id === 'nuevo' ? { ...p, ...body, animal: animal(body.animal) } : p); datos = filas.find((p) => p._id === 'nuevo'); }
      if (url.pathname === '/api/pesajes/nuevo' && req.method === 'DELETE') { filas = filas.filter((p) => p._id !== 'nuevo'); datos = {}; }
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(datos));
    }
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.js')).contents); }
    if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.css')).text + '\n' + readFileSync(path.join(root, 'src/App.css')) + '\n' + readFileSync(path.join(root, 'src/index.css')) + '\n#root{padding:16px;max-width:1400px;margin:auto}'); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const temp = net.createServer(); await new Promise((r) => temp.listen(0, '127.0.0.1', r)); const port = temp.address().port; await new Promise((r) => temp.close(r));
  browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'cir-pesajes-edge-'))}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let page; for (let i = 0; i < 80; i++) { try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((p) => p.type === 'page'); if (page) break; } catch {} await esperar(100); }
  assert.ok(page); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', ({ data }) => { const m = JSON.parse(data), p = pendientes.get(m.id); if (m.method === 'Runtime.exceptionThrown') errores.push(m.params); if (p) { clearTimeout(p.timer); pendientes.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Emulation.setTimezoneOverride', { timezoneId: 'America/Costa_Rica' });
  for (const especie of ['Bovino', 'Porcino']) for (const width of [1440, 820, 390, 320]) {
    filas = [{ _id: 'legado', animal: animal(especie), tipoPesaje: 'Importacion', fecha: '2026-06-01', peso: 150 }];
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?especie=${especie}` }); await hasta("document.querySelector('tbody .tipo-pesaje-badge')");
    assert.equal(await evaluar("document.querySelector('.tipo-pesaje-badge').textContent"), 'Regular');
    await evaluar("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nuevo pesaje')).click()"); await hasta("document.querySelector('form [name=tipoPesaje]')");
    await cambiar('form [name=tipoPesaje]', 'DESTETE'); await hasta("document.querySelector('[role=note]')");
    await cambiar('form select:not([name])', especie); await cambiar('form input[type=date]', '2026-07-20'); await cambiar('form input[type=number]', '230');
    assert.ok(await evaluar('document.documentElement.scrollWidth<=innerWidth+1'));
    await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((r) => writeFileSync(path.join(os.tmpdir(), `cir-pesaje-${especie}-${width}.png`), Buffer.from(r.data, 'base64')));
    await evaluar("document.querySelector('form').requestSubmit()"); await hasta("document.querySelector('tbody')?.textContent.includes('Destete')");
    await cambiar('.pesajes-toolbar [name=tipoPesaje]', 'DESTETE'); await hasta("document.querySelectorAll('tbody tr').length===1");
    await evaluar("document.querySelector('button[title=Editar]').click()"); await hasta("document.querySelector('form [name=tipoPesaje]')");
    assert.equal(await evaluar("document.querySelector('form [name=tipoPesaje]').value"), 'DESTETE');
    await cambiar('form [name=tipoPesaje]', 'SALIDA_VENTA'); await evaluar("document.querySelector('form').requestSubmit()"); await hasta("!document.querySelector('form')");
    await cambiar('.pesajes-toolbar [name=tipoPesaje]', 'SALIDA_VENTA'); await hasta("document.querySelector('tbody')?.textContent.includes('Salida / Venta')");
    await evaluar("document.querySelector('button[title=Eliminar]').click()"); await hasta("!document.querySelector('tbody tr')");
  }
  assert.ok(peticiones.some((p) => p.metodo === 'POST' && p.body?.tipoPesaje === 'DESTETE'));
  assert.ok(peticiones.some((p) => p.metodo === 'PUT' && p.body?.tipoPesaje === 'SALIDA_VENTA'));
  assert.equal(errores.length, 0, JSON.stringify(errores));
  console.log(JSON.stringify({ resultado: 'PASS', especies: ['Bovino', 'Porcino'], viewports: [1440, 820, 390, 320], crearEditarFiltrarEliminar: true, capturas: os.tmpdir() }));
} finally {
  for (const p of pendientes.values()) clearTimeout(p.timer);
  if (socket) { try { await cdp('Browser.close'); } catch {} socket.close(); }
  if (browser && browser.exitCode === null) browser.kill();
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
