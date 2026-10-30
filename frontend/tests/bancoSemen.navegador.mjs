// UI real en Edge aislado; API sintetica, sin MongoDB ni servicios externos.
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const requests = [], errors = [], pending = new Map();
let browser, socket, server, sequence = 0, failSale = true;
const fichas = Array.from({ length: 13 }, (_, i) => ({ _id: String(i + 1).padStart(24, '0'), nombreSemental: `Semental ${i + 1}`, diio: `100${i}`, raza: 'Brahman', especie: 'Bovino', stockReproductivo: 30, stockComercial: 20, asignadoCampanas: 0, totalIngresado: 50, totalUsadasIATF: 0, totalVendidas: 0, totalMermas: 0, saldos: { CRC: { reproductivo: 30, comercial: 20, asignado: 0 }, USD: { reproductivo: 0, comercial: 0, asignado: 0 } } }));
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method)); }, 15000);
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const until = async (expression) => { for (let i = 0; i < 80; i++) { if (await evaluate(`Boolean(${expression})`)) return; await wait(80); } throw Error(`No se cumple: ${expression}`); };
const click = (text) => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click()`);
const field = (label, value) => evaluate(`(() => {const label=Array.from(document.querySelectorAll('label')).find(l=>l.firstChild?.textContent?.trim()===${JSON.stringify(label)});const e=label?.querySelector('input,select,textarea');if(!e)throw Error('Campo no encontrado');const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
try {
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Banco from './src/Components/BancoSemen.js';localStorage.setItem('ganaderiaSesion',JSON.stringify({token:'fixture',fincaId:'finca-fixture'}));function App(){const[c,setC]=React.useState(false);return <main style={{maxWidth:1280,margin:'auto',padding:16}}><button onClick={()=>setC(!c)}>{c?'Modo reproductivo':'Modo comercial'}</button><Banco key={String(c)} comercial={c} permitirEdicion /></main>};createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: path.join(root, 'fixture.js'), format: 'esm', loader: { '.js': 'jsx' }, define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_API_URL: '/api' }) } });
  server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
      requests.push({ url: req.url, method: req.method, body });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && req.url === '/api/ventas/pajillas' && failSale) { res.statusCode = 500; return res.end(JSON.stringify({ mensaje: 'Fallo de venta simulado' })); }
      if (req.method === 'POST') return res.end(JSON.stringify({ ficha: fichas[0] }));
      if (req.url === '/api/semen' || req.url === '/api/ventas/pajillas/existencias') return res.end(JSON.stringify(fichas));
      if (req.url === '/api/ventas/pajillas') return res.end('[]');
      if (req.url === '/api/ventas/pajillas/resumen') return res.end('{"CRC":0,"USD":0}');
      if (req.url === '/api/animales') return res.end(JSON.stringify([{ _id: 'macho', nombre: 'Toro interno', diio: 'T100', sexo: 'Macho', estado: 'Activo', especie: 'Bovino', raza: 'Brahman' }]));
      return res.end(JSON.stringify({ ficha: fichas[0], movimientos: [] }));
    }
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.js')).contents); }
    if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(readFileSync(path.join(root, 'src/App.css')) + '\n' + readFileSync(path.join(root, 'src/index.css')) + '\n' + bundle.outputFiles.find((f) => f.path.endsWith('.css')).text); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const temp = net.createServer(); await new Promise((r) => temp.listen(0, '127.0.0.1', r)); const port = temp.address().port; await new Promise((r) => temp.close(r));
  const profile = mkdtempSync(path.join(os.tmpdir(), 'cir-banco-edge-'));
  browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let page;
  for (let i = 0; i < 80; i++) { try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((p) => p.type === 'page'); if (page) break; } catch {} await wait(100); }
  assert.ok(page, 'Edge no disponible'); socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.id) { const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await until("document.querySelectorAll('tbody tr').length===10");
  await cdp('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(path.join(os.tmpdir(), 'cir-banco-escritorio.png'), Buffer.from(r.data, 'base64')));
  await click('Nueva entrada'); await until("document.querySelector('.semen-form')");
  await field('Nombre del semental', 'Prueba nueva'); await field('Cantidad', '50'); await field('Destino', 'DIVIDIR');
  await until("Array.from(document.querySelectorAll('label')).some(l=>l.firstChild?.textContent==='Reproductiva')");
  await field('Reproductiva', '30'); await field('Comercial', '20');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false });
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  await cdp('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(path.join(os.tmpdir(), 'cir-banco-ipad.png'), Buffer.from(r.data, 'base64')));
  await click('Registrar'); await until("document.body.textContent.includes('Operacion registrada.')");
  const entrada = requests.find((r) => r.url === '/api/semen/entradas' && r.method === 'POST');
  assert.ok(entrada); assert.equal(entrada.body.destino, 'DIVIDIR'); assert.equal(entrada.body.cantidad, '50'); assert.equal(entrada.body.cantidadReproductiva, '30'); assert.ok(entrada.body.claveIdempotencia);
  await click('Modo comercial'); await until("document.querySelector('button[title=\"Vender pajillas\"]')");
  await evaluate("document.querySelector('button[title=\"Vender pajillas\"]').click()");
  await field('Comprador', 'Comprador prueba'); await field('Cantidad', '3'); await field('Precio unitario', '10'); await field('Moneda de venta', 'USD');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  await click('Registrar'); await until("document.body.textContent.includes('Fallo de venta simulado')");
  assert.ok(await evaluate("document.querySelector('.semen-form')!==null"));
  failSale = false; await click('Registrar'); await until("document.body.textContent.includes('Operacion registrada.')");
  const ventas = requests.filter((r) => r.url === '/api/ventas/pajillas' && r.method === 'POST');
  assert.equal(ventas.length, 2); assert.equal(ventas[0].body.claveIdempotencia, ventas[1].body.claveIdempotencia); assert.equal(ventas[1].body.moneda, 'USD');
  await cdp('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(path.join(os.tmpdir(), 'cir-banco-movil.png'), Buffer.from(r.data, 'base64')));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('PASS: banco y ventas, paginacion, entrada dividida, reintento idempotente, escritorio/iPad/movil sin desborde ni errores JS.');
} finally {
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Cierre de prueba')); }
  socket?.close(); if (browser && !browser.killed) { browser.kill(); await new Promise((r) => browser.once('exit', r)); }
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
