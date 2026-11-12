// Componentes reales, API ficticia local y navegador sin acceso a servicios externos.
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
const pendientes = new Map(), requests = [], errores = [];
let server, browser, socket, secuencia = 0;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++secuencia, timer = setTimeout(() => { pendientes.delete(id); reject(Error(method)); }, 15000);
  pendientes.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluar = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
};
const hasta = async (expresion) => { for (let i = 0; i < 100; i++) { if (await evaluar(`Boolean(${expresion})`)) return; await esperar(50); } throw Error(expresion); };
const campo = (name, valor) => evaluar(`(()=>{const e=document.querySelector('[name=${name}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const usuario = { _id: 'u', nombre: 'Responsable', rol: 'Administrador', estado: 'Activo' };
const tarea = { _id: 'tarea', titulo: 'Destetar ternera 2001', tipo: 'Reproducción', estado: 'Pendiente', prioridad: 'Media', moduloOrigen: 'Reproduccion', especie: 'Bovino', claveAutomatica: 'destete', creadoAutomaticamente: true, animal: { _id: 'cria', diio: '2001' }, referenciaId: 'ciclo', asignadoA: usuario, updatedAt: '2026-11-11T12:00:00Z', fechaProgramada: '2027-05-02T00:00:00Z' };
try {
  const bundle = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {FormularioMetodoReproductivo} from './src/Components/MetodoReproductivo.js';
    import Tareas from './src/pages/Tareas.js';
    localStorage.setItem('ganaderiaSesion',JSON.stringify({token:'fixture',usuario:{_id:'u',organizacionId:'o'},organizacion:{_id:'o'},fincaId:'f'}));
    window.confirmaciones=[];window.aceptar=false;window.confirm=(texto)=>{window.confirmaciones.push(texto);return window.aceptar;};
    const usuario=${JSON.stringify(usuario)};
    createRoot(document.getElementById('root')).render(location.search.includes('tareas')?<Tareas usuario={usuario}/>:<FormularioMetodoReproductivo
      especie="Bovino" animales={[{_id:'madre',sexo:'Hembra',especie:'Bovino',estado:'Activo',diio:'1001'}]} usuariosAsignables={[usuario]}
      registroInicial={{animal:{_id:'madre'},asignadoA:'u',metodo:'DESCONOCIDO',estadoCiclo:'Cerrado',fechaPartoReal:'2026-10-02',fechaDestete:'2027-05-02'}}
      onGuardar={datos=>{window.guardado=datos;}} onCancelar={()=>{}}/>);
    `, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: path.join(root, 'fixture.js'), loader: { '.js': 'jsx' }, define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_API_URL: '/api' }) } });
  server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      let texto = ''; for await (const parte of req) texto += parte;
      requests.push({ url: req.url, method: req.method, body: texto ? JSON.parse(texto) : null });
      const datos = req.url.includes('/completar') ? { ...tarea, estado: 'Completada' }
        : req.url.startsWith('/api/tareas') ? [tarea] : req.url.includes('/asignables') ? [usuario] : [];
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(datos));
    }
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.js')).contents); }
    if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.css')).text + '\n' + readFileSync(path.join(root, 'src/App.css')) + '\n' + readFileSync(path.join(root, 'src/index.css')) + '\n#root{padding:20px;max-width:1400px;margin:auto}'); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const temp = net.createServer(); await new Promise((r) => temp.listen(0, '127.0.0.1', r)); const port = temp.address().port; await new Promise((r) => temp.close(r));
  browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'cir-destete-edge-'))}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let page; for (let i = 0; i < 80; i++) { try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((p) => p.type === 'page'); if (page) break; } catch {} await esperar(100); }
  assert.ok(page); socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', ({ data }) => { const m = JSON.parse(data), p = pendientes.get(m.id); if (m.method === 'Runtime.exceptionThrown') errores.push(m.params); if (p) { clearTimeout(p.timer); pendientes.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Emulation.setTimezoneOverride', { timezoneId: 'America/Costa_Rica' });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const width of [1440, 820, 390, 320]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url }); await hasta("document.querySelector('[name=fechaDestete]')");
    assert.equal(await evaluar("document.querySelector('[name=fechaDestete]').value"), '2027-05-02');
    await campo('fechaDestete', '2027-04-02'); await hasta("document.querySelector('[name=motivoCambioDestete]')");
    await evaluar("document.querySelector('form').requestSubmit()"); assert.equal(await evaluar('Boolean(window.guardado)'), false);
    await campo('motivoCambioDestete', 'Adelanto segun condicion de la cria');
    await evaluar("document.querySelector('form').requestSubmit()"); await hasta('window.guardado');
    const guardado = await evaluar('window.guardado'); assert.equal(guardado.fechaDestete, '2027-04-02'); assert.equal(guardado.motivoCambioDestete, 'Adelanto segun condicion de la cria'); assert.ok(!guardado.diagnostico && !guardado.resultado);
    assert.ok(await evaluar('document.documentElement.scrollWidth<=innerWidth+1'));
    await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((r) => writeFileSync(path.join(os.tmpdir(), `cir-destete-form-${width}.png`), Buffer.from(r.data, 'base64')));
  }
  await cdp('Page.navigate', { url: `${url}/?tareas` }); await hasta("document.querySelector('button[title=Completar]')");
  await evaluar("document.querySelector('button[title=Completar]').click()"); await hasta('window.confirmaciones.length===1');
  assert.ok((await evaluar('window.confirmaciones[0]')).includes('fecha de ejecución'));
  assert.equal(requests.filter((r) => r.url.includes('/completar')).length, 0);
  await evaluar("document.querySelector('button[title=\"Ver detalle\"]').click()"); await hasta("document.querySelector('[role=note]')");
  assert.ok((await evaluar("document.querySelector('[role=note]').textContent")).includes('no la fecha programada'));
  await evaluar("document.querySelector('[role=note]').scrollIntoView({block:'center'})");
  await cdp('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(path.join(os.tmpdir(), 'cir-destete-tarea-320.png'), Buffer.from(r.data, 'base64')));
  await evaluar("window.aceptar=true;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Completar tarea').click()");
  for (let i = 0; i < 100 && !requests.some((r) => r.url.includes('/completar')); i++) await esperar(50);
  assert.equal(requests.filter((r) => r.url.includes('/completar')).length, 1);
  assert.equal(errores.length, 0, JSON.stringify(errores));
  console.log(JSON.stringify({ resultado: 'PASS', viewports: [1440, 820, 390, 320], edicion: true, motivoObligatorio: true, avisoYCancelacion: true, capturas: os.tmpdir() }));
} finally {
  for (const p of pendientes.values()) clearTimeout(p.timer);
  if (socket) { try { await cdp('Browser.close'); } catch {} socket.close(); }
  if (browser && browser.exitCode === null) browser.kill();
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
