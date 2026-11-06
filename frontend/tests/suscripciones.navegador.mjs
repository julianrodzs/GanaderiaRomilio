// Edge headless con API ficticia. No usa sesiones ni servicios del cliente.
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
const wait = (n) => new Promise((r) => setTimeout(r, n));
const requests = [], pending = new Map();
let server, browser, ws, seq = 0;
const org = { _id: '111111111111111111111111', nombre: 'Finca de prueba', slug: 'prueba', estado: 'Activa', plan: { codigo: 'PRO', estado: 'Activo' },
  diasGracia: 5, fincaPrincipal: { nombre: 'Principal' }, fincasActivas: 1, usuariosActivos: 2,
  suscripcion: { modoFacturacion: 'MANUAL', estadoSuscripcion: 'ACTIVA', fechaProximoVencimiento: '2026-12-05T12:00:00Z', diasParaVencer: 30, permiteOperar: true } };
const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(Error(method)); }, 15000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const until = async (expr) => { for (let n = 0; n < 100; n++) { if (await evaluate(`Boolean(${expr})`)) return; await wait(50); } throw Error(`${expr}: ${JSON.stringify({ texto: await evaluate('document.body.innerText'), requests })}`); };
const click = (texto) => evaluate(`Array.from((document.querySelector('dialog[open]')||document).querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(texto)})?.click()`);
const field = (label, value) => evaluate(`(()=>{const l=Array.from(document.querySelectorAll('dialog label')).find(l=>l.firstChild?.textContent?.trim()===${JSON.stringify(label)});const e=l?.querySelector('input,select,textarea');if(!e)throw Error('Campo no encontrado');const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
try {
  const bundle = await build({ stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import Admin from'./src/pages/AdministracionSaas.js';import Facturacion from'./src/Components/FacturacionPlan.js';localStorage.setItem('ganaderiaSesion',JSON.stringify({token:'fixture',usuario:{_id:'u',organizacionId:'o'},organizacion:{_id:'o'},fincaId:'f'}));createRoot(document.getElementById('root')).render(<main style={{maxWidth:1400,margin:'auto',padding:16}}>{location.pathname==='/cliente'?<Facturacion codigoActual="PRO"/>:<Admin onCerrar={()=>{}}/>}</main>);`, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: path.join(root, 'fixture.js'), loader: { '.js': 'jsx' }, define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_API_URL: '/api', VITE_WHATSAPP_SOPORTE: '50688887777' }) } });
  server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname.startsWith('/api/')) {
      let raw = ''; for await (const chunk of req) raw += chunk;
      requests.push({ ruta: req.url, method: req.method, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST') { org.suscripcion.fechaProximoVencimiento = '2027-03-05T12:00:00Z'; res.statusCode = 201; return res.end(JSON.stringify({ organizacion: org, pago: { _id: 'p' } })); }
      if (u.pathname === '/api/admin/organizaciones') return res.end(JSON.stringify([org]));
      if (u.pathname.endsWith('/cartera/resumen')) return res.end(JSON.stringify({ activas: 1, prueba: 0, porVencer: 0, vencidas: 0, ingresos: { CRC: 12000, USD: 35 } }));
      if (u.pathname === '/api/facturacion/estado') return res.end(JSON.stringify({ organizacion: org, suscripcion: org.suscripcion, plan: org.plan, stripeConfigurado: false, catalogo: [{ codigo: 'PRO', nombre: 'Pro', precioMensualUSD: 35 }, { codigo: 'PREMIUM', nombre: 'Premium', precioMensualUSD: 60 }] }));
      if (u.pathname.endsWith('/pagos')) return res.end(JSON.stringify({ pagos: [{ _id: 'p', plan: 'PRO', metodoPago: 'SINPE_MOVIL', referenciaComprobante: 'SINPE123', moneda: 'CRC', monto: 12000, periodoCubiertoInicio: '2026-12-05', periodoCubiertoFin: '2027-03-05', fechaPago: '2026-11-05', estado: 'REGISTRADO' }], pagina: 1, totalPaginas: 1, total: 1 }));
      res.statusCode = 404; return res.end('{}');
    }
    if (u.pathname === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles.find((f) => f.path.endsWith('.js')).contents); }
    if (u.pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(readFileSync(path.join(root, 'src/App.css')) + '\n' + readFileSync(path.join(root, 'src/index.css')) + '\n' + bundle.outputFiles.find((f) => f.path.endsWith('.css')).text); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const socket = net.createServer(); await new Promise((r) => socket.listen(0, '127.0.0.1', r)); const port = socket.address().port; await new Promise((r) => socket.close(r));
  browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'cir-suscripciones-edge-'))}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let page; for (let i = 0; i < 80; i++) { try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((p) => p.type === 'page'); if (page) break; } catch {} await wait(100); }
  assert.ok(page); ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  for (const [ancho, nombre] of [[1440, 'desktop'], [390, 'movil']]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await until("document.querySelector('.saas-tabla tbody tr strong')");
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((r) => writeFileSync(path.join(os.tmpdir(), `cir-suscripciones-${nombre}.png`), Buffer.from(r.data, 'base64')));
    await click('+ Registrar pago'); await until("document.querySelector('dialog[open]')");
    await field('Monto', '12000'); await field('Número de comprobante', 'SINPE123'); await field('Meses cubiertos', '3');
    await cdp('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(path.join(os.tmpdir(), `cir-suscripciones-pago-${nombre}.png`), Buffer.from(r.data, 'base64')));
    const medidas = await evaluate("(()=>{const d=document.querySelector('dialog');return{ancho:d.getBoundingClientRect().width,scroll:d.scrollWidth,cliente:d.clientWidth};})()");
    assert.ok(medidas.ancho <= ancho && medidas.scroll <= medidas.cliente + 1, JSON.stringify(medidas));
    if (nombre === 'desktop') { await click('Registrar pago'); await until("!document.querySelector('dialog[open]')"); assert.ok(requests.some((r) => r.method === 'POST' && r.body.monto === 12000 && r.body.mesesCubiertos === 3 && r.body.claveIdempotencia)); }
    else { await click('Cerrar'); await until("!document.querySelector('dialog[open]')"); }
    await click('Historial de pagos'); await until("document.querySelector('dialog').textContent.includes('SINPE123')"); await click('Cerrar');
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/cliente` });
    await until("document.querySelector('a[href^=\"https://wa.me/\"]')");
    assert.ok(await evaluate("document.body.textContent.includes('Mis pagos registrados')&&!document.body.textContent.includes('configurado en Stripe')"));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((r) => writeFileSync(path.join(os.tmpdir(), `cir-mi-plan-${nombre}.png`), Buffer.from(r.data, 'base64')));
  }
  console.log(JSON.stringify({ resultado: 'PASS', viewports: [1440, 390], pagoRegistrado: true, historial: true, whatsapp: true, capturas: os.tmpdir() }));
} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  if (ws) { try { await cdp('Browser.close'); } catch {} ws.close(); }
  if (browser && browser.exitCode === null) browser.kill();
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
