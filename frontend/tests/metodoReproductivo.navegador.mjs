// Modales reales con API ficticia, Edge aislado y capturas fuera del repositorio.
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
const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method)); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const until = async (expression) => { for (let n = 0; n < 100; n++) { if (await evaluate(`Boolean(${expression})`)) return; await wait(50); } throw Error(expression); };
const click = (texto) => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(texto)})?.click()`);
const campo = (label, value) => evaluate(`(()=>{const l=Array.from(document.querySelectorAll('.metodo-seguimiento label')).find(l=>l.firstChild?.textContent.trim()===${JSON.stringify(label)});const e=l?.querySelector('input,select');if(!e)throw Error('Campo: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
try {
  const bundle = await build({ stdin: { contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{HistorialMetodo}from'./src/Components/MetodoReproductivo.js';localStorage.setItem('ganaderiaSesion',JSON.stringify({token:'fixture',usuario:{_id:'u',organizacionId:'o'},organizacion:{_id:'o'},fincaId:'f'}));function Fixture(){const[abierto,setAbierto]=useState(true);return abierto?<HistorialMetodo registro={{_id:'ciclo',estadoCiclo:'Activo',especie:'Bovino',metodo:'MONTA_NATURAL',servicios:[],historialDiagnosticos:[]}} animales={[{_id:'toro',sexo:'Macho',especie:'Bovino',diio:'188000012345',nombre:'Semental de nombre largo para probar el selector'}]} usuarios={[{_id:'usuario',nombre:'Nicolas',rol:'Administrador'}]} semenDisponible={[{_id:'semen',especie:'Bovino',toro:'Semen externo de referencia',moneda:'CRC',cantidadDisponible:20}]} onCerrar={()=>setAbierto(false)} onActualizar={async()=>{}}/>:<button onClick={()=>setAbierto(true)}>Abrir historial</button>}createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: path.join(root, 'fixture.js'), loader: { '.js': 'jsx' }, define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_API_URL: '/api' }) } });
  server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      let cuerpo = ''; for await (const chunk of req) cuerpo += chunk;
      requests.push({ url: req.url, method: req.method, body: cuerpo ? JSON.parse(cuerpo) : null }); res.setHeader('Content-Type', 'application/json'); return res.end('{}');
    }
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.js')).contents); }
    // Orden adverso: estilos generales despues de los del componente para probar especificidad.
    if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.css')).text + '\n' + readFileSync(path.join(root, 'src/App.css')) + '\n' + readFileSync(path.join(root, 'src/index.css'))); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const temp = net.createServer(); await new Promise((r) => temp.listen(0, '127.0.0.1', r)); const port = temp.address().port; await new Promise((r) => temp.close(r));
  browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'cir-metodo-edge-'))}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let page; for (let i = 0; i < 80; i++) { try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((p) => p.type === 'page'); if (page) break; } catch {} await wait(100); }
  assert.ok(page); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', ({ data }) => { const m = JSON.parse(data), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  for (const ancho of [1440, 820, 390, 320]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: 960, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` }); await until("document.querySelector('.metodo-modal')");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.metodo-timeline')).display"), 'none');
    for (const [accion, etiqueta] of [['servicios', 'Registrar servicio / repaso'], ['diagnosticos', 'Registrar diagnóstico']]) {
      await click(etiqueta); await until("document.querySelector('.metodo-seguimiento input')");
      const medidas = await evaluate(`(()=>{const modal=document.querySelector('.metodo-modal'),form=modal.querySelector('form'),campos=[...form.querySelectorAll('input,select')];return{ancho:modal.getBoundingClientRect().width,scroll:modal.scrollWidth,cliente:modal.clientWidth,pagina:document.documentElement.scrollWidth,cols:getComputedStyle(form.querySelector('.form-grid')).gridTemplateColumns.split(' ').length,campos:campos.every(e=>{const r=e.getBoundingClientRect(),l=e.parentElement.getBoundingClientRect();return r.width<=l.width+1&&r.right<=l.right+1&&parseFloat(getComputedStyle(e).paddingLeft)>=11&&r.height>=42}),activo:[...modal.querySelectorAll('[aria-pressed=true]')].map(b=>b.textContent),titulo:parseFloat(getComputedStyle(modal.querySelector('h2')).fontSize)};})()`);
      assert.ok(medidas.ancho <= ancho - 20 && medidas.scroll <= medidas.cliente + 1 && medidas.pagina <= ancho + 1, JSON.stringify(medidas));
      assert.ok(medidas.campos, JSON.stringify(medidas)); assert.equal(medidas.cols, ancho <= 600 ? 1 : 2); assert.deepEqual(medidas.activo, [etiqueta]); assert.ok(medidas.titulo <= 24);
      await cdp('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(path.join(os.tmpdir(), `cir-metodo-${accion}-${ancho}.png`), Buffer.from(r.data, 'base64')));
      if (accion === 'servicios') {
        await campo('Modalidad', 'LIBRE'); await until("document.querySelector('input[name=fechaServicioDesde]')");
        await campo('Método reproductivo', 'IATF'); await until("document.body.textContent.includes('Semen del banco')");
        await campo('Método reproductivo', 'MONTA_NATURAL'); await campo('Fecha del servicio', '2026-11-06');
      } else { await campo('Fecha del diagnóstico', '2026-11-06'); await campo('Días de gestación estimados', '90'); }
      if (ancho === 1440) {
        await click('Guardar'); await until("!document.querySelector('.metodo-modal')");
        assert.ok(requests.some((r) => r.url === `/api/reproduccion/ciclo/${accion}` && r.method === 'POST' && r.body.claveIdempotencia));
        await click('Abrir historial'); await until("document.querySelector('.metodo-modal')");
      } else { await click('Cancelar'); await until("!document.querySelector('.metodo-seguimiento')"); }
    }
  }
  console.log(JSON.stringify({ resultado: 'PASS', viewports: [1440, 820, 390, 320], formularios: ['servicios', 'diagnosticos'], guardadoSimulado: true, capturas: os.tmpdir() }));
} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  if (socket) { try { await cdp('Browser.close'); } catch {} socket.close(); }
  if (browser && browser.exitCode === null) browser.kill();
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
