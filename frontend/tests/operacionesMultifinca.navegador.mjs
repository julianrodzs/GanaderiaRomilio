// Formularios reales con API local ficticia; nunca accede a MongoDB ni a servicios externos.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url)), pending = new Map(), requests = [];
let server, browser, socket, sequence = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method)); }, 15000);
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
};
const until = async (expression) => {
  for (let n = 0; n < 100; n++) { if (await evaluate(`Boolean(${expression})`)) return; await wait(50); } throw Error(expression);
};
const campo = (formulario, etiqueta, value) => evaluate(`(()=>{
  const f=document.querySelectorAll('form')[${formulario}],l=[...f.querySelectorAll('label')].find(l=>l.firstChild?.textContent.trim()===${JSON.stringify(etiqueta)}),e=l?.querySelector('input,select');
  if(!e)throw Error('Campo: '+${JSON.stringify(etiqueta)});
  Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});
  e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));
})()`);
const medidas = () => evaluate(`(()=>{
  const page=document.querySelector('.operaciones-multifinca-page'),grid=page.querySelector('.operaciones-multifinca-grid');
  return {pagina:document.documentElement.scrollWidth,ancho:innerWidth,columnas:getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    campos:[...grid.querySelectorAll('input:not([type=checkbox]),select')].every(e=>{const r=e.getBoundingClientRect(),l=e.parentElement.getBoundingClientRect();return r.width<=l.width+1&&r.right<=l.right+1&&r.height>=43&&parseFloat(getComputedStyle(e).paddingLeft)>=11}),
    casillas:[...grid.querySelectorAll('input[type=checkbox]')].every(e=>e.getBoundingClientRect().width===18&&e.getBoundingClientRect().height===18),
    controles:[...grid.querySelectorAll('.form-grid')].map(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)};
})()`);

try {
  const bundle = await build({ stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import Operaciones from'./src/Components/OperacionesFinancierasMultiFinca.js';localStorage.setItem('ganaderiaSesion',JSON.stringify({token:'fixture',usuario:{_id:'u',organizacionId:'o'},organizacion:{_id:'o'},fincaId:'principal'}));createRoot(document.getElementById('root')).render(<Operaciones onCerrar={()=>{}} onActualizado={async()=>{}}/>);`, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: path.join(root, 'fixture.js'), loader: { '.js': 'jsx' }, define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_API_URL: '/api' }) } });
  server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      let cuerpo = ''; for await (const chunk of req) cuerpo += chunk;
      requests.push({ url: req.url, method: req.method, body: cuerpo ? JSON.parse(cuerpo) : null });
      const datos = req.url === '/api/fincas' ? [{ _id: 'principal', codigo: 'PRINCIPAL', nombre: 'Finca principal', estado: 'Activa', esActiva: true }, { _id: 'secundaria', codigo: 'SECUNDARIA', nombre: 'Finca de nombre extenso para comprobar que la seleccion de participantes no desborde', estado: 'Activa' }]
        : req.url === '/api/finanzas/catalogos' ? { categorias: ['Alimentación', 'Sanidad'], destinosUso: ['Finca'] }
          : req.url === '/api/finanzas/multi-finca' ? [] : {};
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(datos));
    }
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.js')).contents); }
    if (req.url === '/style.css') {
      res.setHeader('Content-Type', 'text/css');
      return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.css')).text + '\n' + readFileSync(path.join(root, 'src/App.css')) + '\n' + readFileSync(path.join(root, 'src/index.css')) + '\n#root{max-width:1400px;margin:0 auto;padding:20px;background:#f8f9f5}');
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const temp = net.createServer(); await new Promise((r) => temp.listen(0, '127.0.0.1', r)); const port = temp.address().port; await new Promise((r) => temp.close(r));
  browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'cir-multifinca-edge-'))}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let page; for (let i = 0; i < 80; i++) { try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((p) => p.type === 'page'); if (page) break; } catch {} await wait(100); }
  assert.ok(page); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', ({ data }) => { const m = JSON.parse(data), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  for (const ancho of [1440, 1024, 820, 390, 320]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: 1100, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` }); await until("document.querySelectorAll('input[type=checkbox]').length===2");
    const inicial = await medidas(); assert.ok(inicial.pagina <= ancho + 1 && inicial.campos && inicial.casillas, JSON.stringify(inicial));
    assert.equal(inicial.columnas, ancho > 1100 ? 2 : 1); assert.deepEqual(inicial.controles, ancho <= 600 ? [1, 1] : [2, 2]);
    await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((r) => writeFileSync(path.join(os.tmpdir(), `cir-multifinca-${ancho}.png`), Buffer.from(r.data, 'base64')));
    await evaluate("document.querySelectorAll('input[type=checkbox]').forEach(e=>e.click())");
    await campo(1, 'Distribución', 'PORCENTAJE'); await until("document.querySelectorAll('.multifinca-valor input').length===2");
    await campo(1, 'Porcentaje (%)', '50');
    const reparto = await medidas(); assert.ok(reparto.pagina <= ancho + 1 && reparto.campos && reparto.casillas, JSON.stringify(reparto));
    await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((r) => writeFileSync(path.join(os.tmpdir(), `cir-multifinca-reparto-${ancho}.png`), Buffer.from(r.data, 'base64')));
    if (ancho === 1440) {
      await campo(0, 'Destino', 'secundaria'); await campo(0, 'Monto', '15000'); await campo(0, 'Descripción', 'Transferencia de prueba');
      await evaluate("document.querySelectorAll('form')[0].requestSubmit()"); await until("document.body.textContent.includes('Transferencia registrada')");
      assert.ok(requests.some((r) => r.method === 'POST' && r.url.endsWith('/transferencias') && r.body.fincaDestino === 'secundaria' && r.body.monto === '15000'));
      await campo(1, 'Distribución', 'IGUAL'); await campo(1, 'Monto total', '20000'); await campo(1, 'Categoría', 'Alimentación'); await campo(1, 'Descripción', 'Compra compartida de prueba');
      await evaluate("document.querySelectorAll('form')[1].requestSubmit()"); await until("document.body.textContent.includes('El gasto quedó distribuido')");
      assert.ok(requests.some((r) => r.method === 'POST' && r.url.endsWith('/gastos-compartidos') && r.body.distribucion.length === 2 && r.body.modo === 'IGUAL'));
    }
    if (ancho === 320) { await campo(1, 'Distribución', 'MONTO'); await until("document.querySelector('label.multifinca-valor').textContent.includes('Monto (CRC)')"); assert.ok((await medidas()).campos); }
  }
  console.log(JSON.stringify({ resultado: 'PASS', viewports: [1440, 1024, 820, 390, 320], modos: ['IGUAL', 'PORCENTAJE', 'MONTO'], guardadoSimulado: true, capturas: os.tmpdir() }));
} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  if (socket) { try { await cdp('Browser.close'); } catch {} socket.close(); }
  if (browser && browser.exitCode === null) browser.kill();
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
