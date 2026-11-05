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
let browser, socket, server, sequence = 0, codigoPlan = 'GESTION';
const metodos = ['MONTA_NATURAL', 'IA_CONVENCIONAL', 'IATF', 'TRANSFERENCIA_EMBRIONES', 'DESCONOCIDO'];
const atribuciones = ['CONFIRMADA', 'PROBABLE', 'INCIERTA', 'SIN_SERVICIO'];
const resumen = { inventario: { totalAnimales: 22, pesoPromedio: 420, porSexo: [{ sexo: 'Hembra', cantidad: 18 }, { sexo: 'Macho', cantidad: 4 }], porEstado: [{ estado: 'Activo', cantidad: 22 }] }, potreros: { totalPotreros: 4, rotacionesActivas: [] }, finanzas: { porNaturaleza: [{ naturaleza: 'Ingreso', moneda: 'CRC', total: 1100000 }, { naturaleza: 'Egreso', moneda: 'USD', total: 250 }], porCategoria: [], gastosPorMes: [] }, drone: { totalConteos: 2 }, sanidad: { alertas: [] }, reproduccion: { partos: { resumen: {}, porVaca: [], anios: [] } } };
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method)); }, 15000);
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const until = async (expression) => { for (let i = 0; i < 80; i++) { if (await evaluate(`Boolean(${expression})`)) return; await wait(80); } throw Error(`No se cumple: ${expression}`); };
const click = (text) => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click()`);
const field = (label, value) => evaluate(`(() => {const label=Array.from(document.querySelectorAll('label')).find(l=>l.firstChild?.textContent?.trim()===${JSON.stringify(label)});const e=label?.querySelector('input,select,textarea');if(!e)throw Error('Campo no encontrado');const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);

try {
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Reportes from './src/Components/Reportes.js';import{PlanProvider}from'./src/context/PlanContext.js';localStorage.setItem('ganaderiaSesion',JSON.stringify({token:'fixture',usuario:{_id:'usuario',organizacionId:'org'},organizacion:{_id:'org'},fincaId:'finca'}));createRoot(document.getElementById('root')).render(<PlanProvider><main style={{maxWidth:1440,margin:'auto',padding:20}}><Reportes usuario={{rol:'Consulta'}}/></main></PlanProvider>);`, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: path.join(root,'fixture.js'), format:'esm', loader:{'.js':'jsx'}, define:{'import.meta.env':JSON.stringify({DEV:false,VITE_API_URL:'/api'})} });
  server = http.createServer(async (req,res) => {
    const u = new URL(req.url,'http://localhost');
    if(u.pathname.startsWith('/api/')){
      requests.push({url:req.url,plan:codigoPlan});
      res.setHeader('Content-Type','application/json');
      let data=null;
      if(u.pathname==='/api/plan/actual') data={plan:{codigo:codigoPlan,vigente:true,modoEspecies:'AMBAS',especiePlan:'Bovino'},funcionalidades:{analiticaProductiva:codigoPlan!=='ESENCIAL',analiticaEconomica:['PRO','PREMIUM'].includes(codigoPlan),reportesMultiFinca:codigoPlan==='PREMIUM'}};
      if(u.pathname==='/api/reportes/resumen') {
        const campos={inventario:['inventario','drone'],reproduccion:['reproduccion'],produccion:['potreros'],sanidad:['sanidad'],finanzas:['finanzas']}[u.searchParams.get('seccion')];
        data=campos?Object.fromEntries(campos.map(c=>[c,resumen[c]])):resumen;
      }
      if(u.pathname==='/api/reportes/reproduccion/partos-metodo') data={partos:Array.from({length:22},(_,i)=>({_id:'p'+i,fecha:'2026-11-04T00:00:00Z',animal:{diio:'1880000'+i,nombre:'Vaca '+i},metodo:metodos[i%5],estadoAtribucion:atribuciones[i%4]})).filter(p=>u.searchParams.get('especie')!=='Porcino'||!['IATF','TRANSFERENCIA_EMBRIONES'].includes(p.metodo))};
      if(u.pathname==='/api/reportes/reproduccion/metodos') data={iaTotal:12,porMetodo:metodos.filter(m=>!u.searchParams.get('metodo')||m===u.searchParams.get('metodo')).filter(m=>u.searchParams.get('especie')!=='Porcino'||!['IATF','TRANSFERENCIA_EMBRIONES'].includes(m)).map(metodo=>({metodo,partos:3,partosSinServicio:1,servicios:12,prenecesAtribuidas:8,tasaPrenez:66.7,serviciosPorConcepcion:1.5,intervaloEntrePartosDias:370,perdidas:1}))};
      if(u.pathname==='/api/fincas') data=[];
      if(u.pathname==='/api/reportes/potreros/rendimiento') data={potreros:[],resumen:{}};
      if(u.pathname==='/api/reportes/lotes') data={resumen:{},lotes:[{_id:'lote',codigo:'ENG-1',nombre:'Lote 1',especie:'Bovino',proposito:'ENGORDE',etapaOperativa:'FINALIZACION',animales:12,estado:'Activo'}]};
      if(u.pathname==='/api/reportes/productos/resumen') data={cantidadMovimientos:25,monedas:{CRC:{montoTotal:25000}}};
      if(u.pathname==='/api/reportes/productos/por-producto') {
        const pagina=Number(u.searchParams.get('pagina')||1),limite=Number(u.searchParams.get('limite')||10);
        data={datos:Array.from({length:Math.min(limite,25-(pagina-1)*limite)},(_,i)=>({producto:'Producto '+((pagina-1)*limite+i),categoria:'Sanidad',unidadMedida:'UNIDAD',cantidadTotal:1,montoTotal:1000,moneda:'CRC'})),paginacion:{pagina,limite,total:25,totalPaginas:Math.ceil(25/limite)}};
      }
      res.end(JSON.stringify(data));return;
    }
    if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents);}
    if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(readFileSync(path.join(root,'src/App.css'))+'\n'+readFileSync(path.join(root,'src/index.css'))+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text);}
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
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

  await until("document.querySelectorAll('.reportes-seccion-cabecera').length===6&&document.body.textContent.includes('Distribución del ganado')");
  assert.equal(await evaluate("document.querySelectorAll('.reportes-seccion-cabecera[aria-expanded=true]').length"),1);
  assert.ok(!requests.some(r=>r.url.includes('/partos-metodo')));
  await wait(250);
  assert.ok(requests.filter(r=>!r.url.includes('/plan/')).every(r=>r.url.includes('/resumen?')&&r.url.includes('seccion=inventario')),JSON.stringify(requests));
  const antesRepro=requests.length;
  await click('Reproducción'); await until("document.querySelector('.reporte-metodos tbody tr')");
  assert.equal(await evaluate("document.querySelectorAll('.reportes-seccion:not([hidden])').length"),1);
  await until("document.body.textContent.includes('Incierta (requiere revisión)')");
  assert.ok(await evaluate("!document.querySelector('.reporte-metodos').textContent.includes('SIN_SERVICIO')"));
  assert.ok(await evaluate("!document.querySelector('.reporte-metodos').textContent.includes('Inseminacion')"));
  await wait(250);
  assert.ok(!requests.slice(antesRepro).some(r=>/productos|sanidad|destinos|ventas|peso-destete|lotes/.test(r.url)),JSON.stringify(requests.slice(antesRepro)));
  assert.ok(await evaluate("document.querySelector('.reporte-metodos').textContent.includes('Partos registrados')"));
  await field('Desde','2026-01-15'); await field('Hasta','2026-11-04');
  await until("document.querySelector('.reporte-metodos tbody tr')");
  await field('Método','IATF'); await until("!document.querySelector('.reporte-metodos [role=status]')");
  await evaluate("document.querySelector('.reporte-metodos button[aria-label=\"Página siguiente\"]').click()");
  await until("document.querySelector('.reporte-metodos').textContent.includes('Página 2 de')");
  await evaluate("document.querySelector('[data-seccion=reproduccion] .reportes-seccion-cabecera').click()");
  await wait(250);
  assert.ok(await evaluate("document.querySelector('.reporte-metodos').closest('[inert]')!==null"));
  await evaluate("document.querySelector('[data-seccion=reproduccion] .reportes-seccion-cabecera').click()");
  assert.ok(await evaluate("document.querySelector('.reporte-metodos').textContent.includes('Página 2 de')"));
  assert.equal(await evaluate("document.querySelector('.reporte-metodos-filtro select').value"),'IATF');
  const antesSanidad=requests.length;
  await click('Sanidad');await wait(300);
  assert.ok(requests.slice(antesSanidad).every(r=>r.url.includes('sanidad')),JSON.stringify(requests.slice(antesSanidad)));
  const antesFecha=requests.length;
  await field('Desde','2026-02-01');await wait(300);
  assert.ok(requests.slice(antesFecha).length>0);
  assert.ok(requests.slice(antesFecha).every(r=>r.url.includes('sanidad')),JSON.stringify(requests.slice(antesFecha)));
  await click('Reproducción');await until("!document.querySelector('.reporte-metodos [role=status]')");await wait(300);
  assert.ok(requests.slice(antesFecha).some(r=>r.url.includes('/partos-metodo')&&r.url.includes('2026-02-01')));
  const antesReabrir=requests.length;
  await evaluate("document.querySelector('[data-seccion=reproduccion] .reportes-seccion-cabecera').click()");await wait(100);
  await evaluate("document.querySelector('[data-seccion=reproduccion] .reportes-seccion-cabecera').click()");await wait(250);
  assert.equal(requests.length,antesReabrir,'Reabrir sin cambios reutiliza consultas y filtros');
  for(const [width,height,n] of [[1440,1000,'escritorio'],[820,1180,'ipad'],[390,844,'movil']]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});await wait(250);
    const medidas=await evaluate("({pagina:document.documentElement.scrollWidth,ancho:innerWidth,celdas:[...document.querySelectorAll('.reporte-metodos th,.reporte-metodos td')].every(c=>parseFloat(getComputedStyle(c).paddingLeft)>=16),tabla:document.querySelector('.reporte-metodos table').getBoundingClientRect().width,overflow:getComputedStyle(document.querySelector('.reporte-metodos .tabla-scroll')).overflowX})");
    assert.ok(medidas.pagina<=medidas.ancho+1,JSON.stringify(medidas));assert.ok(medidas.celdas);assert.ok(medidas.tabla>=720);assert.equal(medidas.overflow,'auto');
    await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>writeFileSync(path.join(os.tmpdir(),`cir-reportes-${n}.png`),Buffer.from(r.data,'base64')));
  }
  await click('Expandir todas'); await until("document.querySelectorAll('.reportes-seccion-cabecera[aria-expanded=true]').length===6"); await wait(500);
  assert.equal(await evaluate("document.querySelector('.reportes-filtros input').value"),'2026-02-01');
  assert.ok(await evaluate("!document.querySelector('[data-seccion=produccion]').textContent.includes('FINALIZACION')"));
  await click('Contraer todas'); await until("document.querySelectorAll('.reportes-seccion-cabecera[aria-expanded=true]').length===0");
  await click('Comercialización');await until("document.querySelector('.productos-reportes-panel tbody tr')");await wait(300);
  const antesPagina=requests.length;
  await evaluate("document.querySelector('.productos-reportes-panel button[aria-label=\"Página siguiente\"]').click()");
  await until("document.querySelector('.productos-reportes-panel').textContent.includes('Página 2 de')");await wait(250);
  assert.ok(requests.slice(antesPagina).length>0);
  assert.ok(requests.slice(antesPagina).every(r=>r.url.includes('/productos/por-producto')),JSON.stringify(requests.slice(antesPagina)));
  await click('Contraer todas');await wait(150);
  const antesRecargar=requests.length;
  await cdp('Page.reload'); await until("document.querySelectorAll('.reportes-seccion-cabecera').length===6"); await wait(200);
  assert.equal(await evaluate("document.querySelectorAll('.reportes-seccion-cabecera[aria-expanded=true]').length"),0);
  assert.ok(!requests.slice(antesRecargar).some(r=>r.url.startsWith('/api/reportes/')),'Todas cerradas no dispara reportes al restaurar');
  for(const plan of ['ESENCIAL','GESTION','PRO','PREMIUM']){
    codigoPlan=plan;const inicio=requests.length;
    await cdp('Page.reload');await until("document.body.textContent.includes('Distribución del ganado')||document.querySelectorAll('.reportes-seccion-cabecera').length===6");
    await click('Reproducción');await until("document.querySelector('.reporte-metodos tbody tr')");await wait(300);
    assert.equal(requests.slice(inicio).some(r=>r.url.includes('/reproduccion/metodos?')),plan!=='ESENCIAL');
    if(plan==='ESENCIAL')assert.ok(await evaluate("document.querySelector('.reporte-metodos').textContent.includes('Indicadores por método')"));
    await click('Expandir todas');await wait(500);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: seis secciones; seleccion individual; expandir/contraer; fechas, metodo y pagina preservados; restauracion de sesion; cuatro planes; tablas con espacio y scroll; escritorio/iPad/movil sin desborde ni errores JS.');
} finally {
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Cierre de prueba')); }
  socket?.close(); if (browser && !browser.killed) { browser.kill(); await new Promise((r) => browser.once('exit', r)); }
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
