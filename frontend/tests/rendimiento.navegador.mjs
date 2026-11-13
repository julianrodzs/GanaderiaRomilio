// React y HTTP reales sobre loopback; sin credenciales, Atlas ni correos.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const express = require('express');
const { compresionHttp, cachePrivadaRevalidada } = require('./middleware/rendimientoHttp');
const root = fileURLToPath(new URL('../', import.meta.url));
const pendientes = new Map(), respuestas = [];
let browser, server, socket, secuencia = 0;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++secuencia, timer = setTimeout(() => { pendientes.delete(id); reject(Error(method)); }, 15000);
  pendientes.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluar = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
};
const hasta = async (expression) => { for (let n = 0; n < 100; n++) { if (await evaluar(`Boolean(${expression})`)) return; await esperar(50); } throw Error(expression); };
const puertoLibre = async () => { const s = net.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; };
try {
  const bundle = await build({ stdin: { contents: `
    import React,{useEffect}from'react';import{createRoot}from'react-dom/client';
    import{PlanProvider,usePlan}from'./src/context/PlanContext.js';
    import FeatureGate from'./src/Components/FeatureGate.js';
    import Campana from'./src/Components/CampanaNotificaciones.js';
    import{obtenerAnimales}from'./src/services/api.js';
    localStorage.setItem('ganaderiaSesion',JSON.stringify({token:'fixture',usuario:{_id:'u'},organizacion:{_id:'o'},fincaId:'A'}));
    window.leerAnimales=obtenerAnimales;window.cargasDashboard=0;window.montajesModulo=0;
    function Modulo(){useEffect(()=>{window.montajesModulo++},[]);return <p>Modulo cargado</p>}
    function Prueba(){const{plan,tieneFeature,recargarPlan}=usePlan();window.recargarPlan=recargarPlan;
      useEffect(()=>{if(plan)window.cargasDashboard++},[Boolean(plan),tieneFeature]);
      return <><button onClick={()=>recargarPlan()}>Actualizar plan</button><Campana/><FeatureGate feature="analiticaProductiva"><Modulo/></FeatureGate></>}
    createRoot(document.getElementById('root')).render(<PlanProvider><Prueba/></PlanProvider>);
  `, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: 'fixture.js', loader: { '.js': 'jsx', '.css': 'empty' }, define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_API_URL: '/api' }) } });
  const app = express(); app.use(compresionHttp, cachePrivadaRevalidada);
  let revision = 0, autorizado = true;
  app.use('/api', (req, res, next) => {
    res.once('finish', () => respuestas.push({ ruta: req.originalUrl, status: res.statusCode, condicional: Boolean(req.get('if-none-match')), finca: req.get('X-Finca-Id') }));
    if (!autorizado) return res.status(401).json({ mensaje: 'Acceso revocado' });
    if (req.get('Authorization') !== 'Bearer fixture') return res.status(401).json({ mensaje: 'Sin token' });
    next();
  });
  app.get('/api/plan/actual', (req, res) => res.json({ plan: { vigente: true, modoEspecies: 'AMBAS' }, funcionalidades: { analiticaProductiva: true }, uso: { animalesActuales: revision } }));
  app.get('/api/notificaciones/no-leidas/count', (req, res) => res.json({ cantidad: 3 }));
  app.get('/api/notificaciones', (req, res) => res.json({ items: [{ _id: 'n', titulo: 'Tarea', mensaje: 'Revisar animal', createdAt: '2026-11-13', leida: false }] }));
  app.get('/api/animales', (req, res) => res.json([{ _id: 'a', nombre: `Animal finca ${req.get('X-Finca-Id')}`, revision }]));
  app.post('/fixture/revision', (req, res) => { revision++; res.json({}); });
  app.post('/fixture/revocar', (req, res) => { autorizado = false; res.json({}); });
  app.get('/fixture.js', (req, res) => res.type('js').send(bundle.outputFiles[0].text));
  app.get('/', (req, res) => res.type('html').send('<!doctype html><html lang="es"><div id="root"></div><script type="module" src="/fixture.js"></script></html>'));
  server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  const port = await puertoLibre();
  browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'cir-performance-edge-'))}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', (e) => { console.error(e.message); });
  let page;
  for (let n = 0; n < 80; n++) { try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((p) => p.type === 'page'); if (page) break; } catch {} await esperar(100); }
  assert.ok(page, 'Edge local disponible');
  socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', ({ data }) => { const m = JSON.parse(data), p = pendientes.get(m.id); if (p) { clearTimeout(p.timer); pendientes.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await hasta('window.cargasDashboard===1 && document.querySelector(".notificaciones-boton small")');
  assert.equal(respuestas.filter((r) => r.ruta === '/api/notificaciones/no-leidas/count').length, 1);
  assert.equal(respuestas.filter((r) => r.ruta.startsWith('/api/notificaciones?')).length, 0);
  await evaluar('Promise.all([window.recargarPlan(),window.recargarPlan()])');
  assert.equal(await evaluar('window.cargasDashboard'), 1);
  assert.equal(await evaluar('window.montajesModulo'), 1);
  assert.equal(respuestas.filter((r) => r.ruta === '/api/plan/actual').length, 2);
  assert.ok(respuestas.some((r) => r.ruta === '/api/plan/actual' && r.status === 304 && r.condicional));
  await evaluar('window.leerAnimales()'); await evaluar('window.leerAnimales()');
  assert.equal(respuestas.filter((r) => r.ruta === '/api/animales').at(-1).status, 304);
  await evaluar('fetch("/fixture/revision",{method:"POST"})');
  assert.equal((await evaluar('window.leerAnimales()'))[0].revision, 1);
  assert.equal(respuestas.filter((r) => r.ruta === '/api/animales').at(-1).status, 200);
  await evaluar('window.recargarPlan()');
  assert.equal(await evaluar('window.cargasDashboard'), 1);
  assert.equal(await evaluar('window.montajesModulo'), 1);
  await evaluar('localStorage.setItem("ganaderiaSesion",JSON.stringify({...JSON.parse(localStorage.getItem("ganaderiaSesion")),fincaId:"B"}))');
  assert.equal((await evaluar('window.leerAnimales()'))[0].nombre, 'Animal finca B');
  assert.equal(respuestas.filter((r) => r.ruta === '/api/animales').at(-1).status, 200);
  await evaluar('document.querySelector(".notificaciones-boton").click()');
  await hasta('document.querySelector(".notificacion-item")');
  assert.equal(respuestas.filter((r) => r.ruta.includes('resumen=true')).length, 1);
  // Simula los eventos de visibilidad del navegador; el reloj extendido se prueba sin red en unitarias.
  await evaluar('Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});document.dispatchEvent(new Event("visibilitychange"))');
  const antes = respuestas.length;
  await evaluar('window.dispatchEvent(new Event("focus"));window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("ganaderiaNotificacionesActualizadas"));window.dispatchEvent(new Event("ganaderiaPlanActualizado"))');
  await esperar(150); assert.equal(respuestas.length, antes);
  await evaluar('fetch("/fixture/revocar",{method:"POST"})');
  assert.equal(await evaluar('window.leerAnimales().then(()=>0,e=>e.status)'), 401);
  assert.equal(await evaluar('localStorage.getItem("ganaderiaSesion")'), null);
  console.log(JSON.stringify({ resultado: 'PASS', etagRealNavegador: true, cambiaFincaSinFiltracion: true,
    revocacion401: true, planSinRecargaDashboard: true, peticionesOcultasPorEventos: 0,
    listaCampanaSoloAlAbrir: true, respuestas }));
} finally {
  for (const p of pendientes.values()) { clearTimeout(p.timer); p.reject(Error('Cierre de fixture')); } pendientes.clear();
  socket?.close(); if (browser && browser.exitCode === null && browser.pid) browser.kill();
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
