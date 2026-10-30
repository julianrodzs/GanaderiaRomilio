// Prueba local con Edge aislado, datos ficticios y sin conexiones a R2 o MongoDB.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(existsSync(edge), 'Define EDGE_PATH con la ruta de Edge para esta prueba.');
const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
const pendientes = new Map();
const errores = [];
const peticionesFoto = [];
const imagenVacia = () => ({ id: null, url: '', personalizada: false });
const apariencia = {
  almacenamiento: { disponible: true, maximoMb: 8 }, predeterminadas: { logo: '', dashboard: '', potreros: '' },
  organizacion: { logo: imagenVacia() },
  fincas: [{ id: 'finca-fixture', nombre: 'Finca de prueba', codigo: 'F1', dashboard: imagenVacia(), potreros: imagenVacia(), comparteImagen: false }]
};
let secuencia = 0;
let socket;
let navegador;
let servidor;
let fallarSubida = false;
let subidas = 0;

const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++secuencia;
  const timer = setTimeout(() => { pendientes.delete(id); reject(new Error(`Tiempo agotado: ${method}`)); }, 15000);
  pendientes.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluar = async expression => {
  const respuesta = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (respuesta.exceptionDetails) throw new Error(JSON.stringify(respuesta.exceptionDetails));
  return respuesta.result.value;
};
const hasta = async expression => {
  for (let intento = 0; intento < 80; intento += 1) {
    if (await evaluar(expression)) return;
    await esperar(100);
  }
  throw new Error(`No se cumplio: ${expression}`);
};

try {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import FotoAnimal from './src/Components/FotoAnimal.js';
        import TablaDinamica from './src/Components/TablaDinamica.js';
        import ConfiguracionApariencia from './src/Components/ConfiguracionApariencia.js';
        import ImagenPersonalizada from './src/Components/ImagenPersonalizada.js';
        import MarcaProducto from './src/Components/MarcaProducto.js';
        import { AparienciaProvider, useApariencia } from './src/context/AparienciaContext.js';
        import MiPlan from './src/pages/MiPlan.js';
        import IniciarSesion from './src/Components/IniciarSesion.js';
        import { PlanProvider } from './src/context/PlanContext.js';
        localStorage.setItem('ganaderiaSesion', JSON.stringify({token:'fixture', fincaId:'finca-fixture'}));
        const animal = {diio:'100', nombre:'Luna', fotoPrincipal:{url:'/api/archivos/r2/foto-fixture'}};
        const datos = Array.from({length:26}, (_,i)=>({_id:String(i),diio:String(26-i),foto:i%2?'':'foto'}));
        const columnas = [{id:'foto',label:'Foto',accessor:a=>a.foto},{id:'diio',label:'DIIO',accessor:a=>a.diio}];
        const VistaApariencia = () => {
          const imagenes = useApariencia();
          return <main style={{maxWidth:1280, margin:'auto', padding:20}}><MarcaProducto />
            <ConfiguracionApariencia /><section id="imagenes-activas" className="apariencia-finca-imagenes">
              <ImagenPersonalizada src={imagenes.logo} alt="Logo activo" className="brand-logo" vacio="CIR" />
              <ImagenPersonalizada src={imagenes.dashboard} alt="Dashboard activo" />
              <ImagenPersonalizada src={imagenes.potreros} alt="Potreros activos" />
            </section></main>;
        };
        const App = () => {
          const [filas, setFilas] = React.useState(datos);
          const [vista, setVista] = React.useState('foto');
          window.mostrarApariencia = () => setVista('apariencia');
          window.mostrarMiPlan = () => setVista('plan');
          window.mostrarLogin = () => setVista('login');
          window.actualizarFotos = () => setFilas(actuales => actuales.map(fila => ({...fila,foto:'/foto-nueva'})));
          if (vista === 'apariencia') return <AparienciaProvider contextoId="fixture"><VistaApariencia /></AparienciaProvider>;
          if (vista === 'plan') return <AparienciaProvider contextoId="fixture"><PlanProvider><MiPlan /></PlanProvider></AparienciaProvider>;
          if (vista === 'login') return <main className="auth-page"><IniciarSesion onLogin={()=>{}} onOlvideContrasena={()=>{}} /></main>;
          return <><TablaDinamica titulo="Inventario" columnas={columnas} datos={filas}
          ordenInicial={{campo:'diio',direccion:'asc'}} mostrarAcciones={false} />
          <div className="modal-backdrop"><section className="modal-panel detalle-animal-panel">
            <div className="panel-title"><h2>Detalle animal</h2></div>
            <section className="foto-animal-principal"><FotoAnimal animal={animal} detalle />
              <div className="foto-animal-contenido"><h3>Fotografia principal</h3></div>
            </section></section></div></>;
        };
        createRoot(document.getElementById('root')).render(<App />);`,
      resolveDir: raiz,
      loader: 'jsx'
    },
    bundle: true,
    write: false,
    format: 'esm',
    loader: { '.js': 'jsx' },
    define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: '/api', DEV: false }) }
  });
  servidor = http.createServer(async (req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles[0].contents); }
    if (req.url === '/style.css') {
      res.setHeader('Content-Type', 'text/css');
      return res.end(readFileSync(path.join(raiz, 'src/index.css'), 'utf8') + '\n' + readFileSync(path.join(raiz, 'src/App.css'), 'utf8'));
    }
    if (req.url.startsWith('/imagen-fixture.png')) {
      res.setHeader('Content-Type', 'image/png');
      return res.end(readFileSync(path.join(raiz, 'public/assests/mapa-potreros.png')));
    }
    if (req.url === '/api/plan/actual') {
      await esperar(200);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        plan: { codigo: 'PRO', nombre: 'Pro', precioMensualUSD: 35, estado: 'Activo', vigente: true, modoEspecies: 'AMBAS' },
        limites: { animales: 500, usuarios: 10, fincas: 1, conteosDrone: 0 },
        uso: { animalesActuales: 0, usuariosActuales: 1, fincasActuales: 1, conteosDroneMes: 0, periodo: '2026-10' },
        sobreLimite: {}, funcionalidades: {}, fincasOperativas: []
      }));
    }
    if (req.url === '/api/fincas' || req.url === '/api/facturacion/estado') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(req.url === '/api/fincas' ? [] : { plan: { estado: 'Activo', administrable: false }, catalogo: [] }));
    }
    if (req.url.startsWith('/api/apariencia')) {
      assert.equal(req.headers.authorization, 'Bearer fixture');
      if (req.method === 'POST') {
        subidas += 1;
        await esperar(300);
        if (fallarSubida) {
          req.resume();
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ mensaje: 'No se pudo subir la imagen de prueba.' }));
        }
        const entrada = new Request(`http://${req.headers.host}${req.url}`, {
          method: 'POST', headers: req.headers, body: req, duplex: 'half'
        });
        const formulario = await entrada.formData();
        assert.ok(formulario.get('imagen').size > 0);
        const tipo = req.url.split('/').at(-1);
        const imagen = { id: `imagen-${tipo}`, personalizada: true, url: `http://${req.headers.host}/imagen-fixture.png?${tipo}` };
        if (tipo === 'logo') apariencia.organizacion.logo = imagen;
        else apariencia.fincas[0][tipo] = imagen;
      }
      if (req.method === 'PATCH') {
        apariencia.fincas[0].potreros = apariencia.fincas[0].dashboard;
        apariencia.fincas[0].comparteImagen = true;
      }
      if (req.method === 'DELETE') {
        const tipo = req.url.split('/').at(-1).split('?')[0];
        if (tipo === 'logo') apariencia.organizacion.logo = imagenVacia();
        else apariencia.fincas[0][tipo] = imagenVacia();
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(req.url === '/api/apariencia'
        ? { almacenamiento: apariencia.almacenamiento, organizacion: apariencia.organizacion, finca: apariencia.fincas[0] }
        : apariencia));
    }
    if (req.url === '/api/archivos/r2/foto-fixture') {
      peticionesFoto.push(req.headers);
      if (req.headers.authorization !== 'Bearer fixture' || req.headers['x-finca-id'] !== 'finca-fixture') {
        res.writeHead(401); return res.end('{}');
      }
      res.setHeader('Content-Type', 'image/png');
      return res.end(readFileSync(path.join(raiz, 'public/assests/mapa-potreros.png')));
    }
    if (req.url !== '/') { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
  });
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  const temporal = net.createServer();
  await new Promise(resolve => temporal.listen(0, '127.0.0.1', resolve));
  const puertoDebug = temporal.address().port;
  await new Promise(resolve => temporal.close(resolve));
  const perfil = mkdtempSync(path.join(os.tmpdir(), 'cir-foto-edge-'));
  navegador = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost',
    `--remote-debugging-port=${puertoDebug}`, `--user-data-dir=${perfil}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let pagina;
  for (let intento = 0; intento < 80; intento += 1) {
    try {
      pagina = (await fetch(`http://127.0.0.1:${puertoDebug}/json/list`).then(res => res.json())).find(item => item.type === 'page');
      if (pagina) break;
    } catch {}
    await esperar(100);
  }
  assert.ok(pagina, 'No se pudo abrir Edge.');
  socket = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = evento => {
    const mensaje = JSON.parse(evento.data);
    if (mensaje.method === 'Runtime.exceptionThrown') errores.push(mensaje.params.exceptionDetails);
    const pendiente = pendientes.get(mensaje.id);
    if (!pendiente) return;
    clearTimeout(pendiente.timer);
    pendientes.delete(mensaje.id);
    if (mensaje.error) pendiente.reject(new Error(JSON.stringify(mensaje.error)));
    else pendiente.resolve(mensaje.result);
  };
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${servidor.address().port}/` });
  await hasta("Boolean(document.querySelector('.foto-animal-ampliar img')?.naturalWidth)");
  assert.equal(peticionesFoto.length, 1);
  assert.deepEqual(await evaluar("Array.from(document.querySelectorAll('tbody tr'),fila=>fila.cells[1].textContent)"), ['1','2','3','4','5','6','7','8','9','10']);

  for (const [nombre, width, height] of [['escritorio',1440,1000], ['ipad',820,1180], ['movil',390,844]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluar("document.querySelector('.foto-animal-ampliar').focus(); document.querySelector('.foto-animal-ampliar').click()");
    await hasta("document.querySelector('dialog').open && document.querySelector('dialog img').naturalWidth > 0");
    const medidas = await evaluar(`(() => {
      const dialog = document.querySelector('dialog'), img = dialog.querySelector('img');
      const marco = dialog.getBoundingClientRect(), foto = img.getBoundingClientRect();
      return {fit:getComputedStyle(img).objectFit, foco:dialog.contains(document.activeElement),
        visible:marco.left>=0 && marco.top>=0 && marco.right<=innerWidth && marco.bottom<=innerHeight,
        imagenDentro:foto.left>=marco.left && foto.right<=marco.right && foto.bottom<=marco.bottom,
        scroll:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.equal(medidas.fit, 'contain');
    assert.equal(medidas.foco, true);
    assert.equal(medidas.visible, true);
    assert.equal(medidas.imagenDentro, true);
    const captura = await cdp('Page.captureScreenshot', { format: 'png' });
    const archivo = path.join(os.tmpdir(), `cir-foto-${nombre}.png`);
    writeFileSync(archivo, Buffer.from(captura.data, 'base64'));
    console.log(`PASS ${nombre}: foto completa, foco y dimensiones. Captura: ${archivo}`);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await hasta("!document.querySelector('dialog').open");
    assert.equal(await evaluar("document.activeElement.classList.contains('foto-animal-ampliar')"), true);
  }
  await evaluar("document.querySelector('.foto-animal-ampliar').click(); document.querySelector('dialog button').click()");
  assert.equal(await evaluar("document.querySelector('dialog').open"), false);
  await evaluar("document.querySelector('.foto-animal-ampliar').click()");
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 2, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 2, button: 'left', clickCount: 1 });
  await hasta("!document.querySelector('dialog').open");
  await evaluar("document.querySelectorAll('th button')[1].click()");
  assert.equal(await evaluar("document.querySelector('tbody tr').cells[1].textContent"), '26');
  await evaluar("document.querySelector('[aria-label=\"Página siguiente\"]').click()");
  await hasta("document.querySelector('.paginacion-tabla').textContent.includes('Página 2')");
  await evaluar("document.querySelector('[aria-label=\"Página siguiente\"]').click()");
  await hasta("document.querySelector('.paginacion-tabla').textContent.includes('Página 3')");
  const antes = await evaluar("Array.from(document.querySelectorAll('tbody tr'),fila=>fila.cells[1].textContent)");
  await evaluar('window.actualizarFotos()');
  await hasta("document.querySelector('tbody td').textContent === '/foto-nueva'");
  assert.deepEqual(await evaluar("Array.from(document.querySelectorAll('tbody tr'),fila=>fila.cells[1].textContent)"), antes);
  assert.match(await evaluar("document.querySelector('.paginacion-tabla').textContent"), /Página 3/);
  assert.equal(peticionesFoto.length, 1, 'Abrir el visor no vuelve a descargar la foto privada.');
  assert.deepEqual(errores, []);
  console.log('PASS: DIIO inicial, orden manual y pagina conservados al cambiar fotos, descarga autenticada unica, Escape, boton Cerrar y fondo.');
  await evaluar(`localStorage.setItem('ganaderiaApariencia:fixture', JSON.stringify({logo:'/assests/logo-romilio.png',
    dashboard:'/assests/mapa-potreros.png',potreros:'/assests/mapa-potreros.png'})); window.mostrarApariencia()`);
  await hasta("document.querySelectorAll('.apariencia-imagen-item').length === 3");
  assert.equal(await evaluar("document.querySelectorAll('.apariencia-preview img, #imagenes-activas img').length"), 0);
  assert.equal(await evaluar("document.querySelectorAll('img[src*=\"assests\"]').length"), 0);

  for (const [nombre, width, height] of [['escritorio',1440,1000], ['movil',390,844]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluar('document.documentElement.scrollWidth <= innerWidth'), true);
    const captura = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(os.tmpdir(), `cir-apariencia-${nombre}.png`), Buffer.from(captura.data, 'base64'));
  }
  const subir = async indice => evaluar(`(async()=>{
    const input=document.querySelectorAll('.apariencia-imagen-item input')[${indice}];
    const archivo=new File([await (await fetch('/imagen-fixture.png')).blob()], 'prueba.png', {type:'image/png'});
    const transferencia=new DataTransfer(); transferencia.items.add(archivo); input.files=transferencia.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await subir(0);
  await hasta("Boolean(document.querySelector('#imagenes-activas img[alt=\"Logo activo\"]')?.naturalWidth)");
  await subir(1);
  await hasta("Boolean(document.querySelector('#imagenes-activas img[alt=\"Dashboard activo\"]')?.naturalWidth)");
  await evaluar("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Usar la del dashboard').click()");
  await hasta("Boolean(document.querySelector('#imagenes-activas img[alt=\"Potreros activos\"]')?.naturalWidth)");
  await evaluar("document.querySelector('.apariencia-imagen-item .boton-link').click()");
  await hasta("!document.querySelector('#imagenes-activas img[alt=\"Logo activo\"]')");
  assert.match(await evaluar("document.querySelector('#imagenes-activas [aria-label=\"Logo activo\"]').textContent"), /CIR/);
  assert.equal(await evaluar("document.querySelectorAll('img[src*=\"assests\"]').length"), 0);
  assert.deepEqual(errores, []);
  console.log('PASS: apariencia vacia, marca CIR Ganadero, subida de logo y dashboard, reutilizacion en potreros y quitar sin restaurar imagenes locales.');
  await evaluar('window.mostrarMiPlan()');
  await hasta("Boolean(document.querySelector('.apariencia-imagen-item input'))");
  await evaluar("window.selectorAntesFoco = document.querySelector('.apariencia-imagen-item input'); window.dispatchEvent(new Event('focus'))");
  await esperar(40);
  assert.equal(await evaluar('window.selectorAntesFoco.isConnected'), true,
    'Volver del selector de archivos no debe desmontar el formulario mientras se actualiza el plan.');
  await hasta("Boolean(document.querySelector('.apariencia-imagen-item input'))");
  await subir(0);
  await hasta("Boolean(document.querySelector('.apariencia-imagen-item img')?.naturalWidth)");
  await hasta("document.querySelector('.mensaje-carga-imagen.exito')?.textContent === 'Logo actualizado.'");
  console.log('PASS: Mi plan conserva el selector al recuperar el foco y permite subir la imagen.');
  const urlAntes = await evaluar("document.querySelector('.apariencia-imagen-item img').src");
  fallarSubida = true;
  await subir(0);
  await hasta("document.querySelector('.apariencia-imagen-item').getAttribute('aria-busy') === 'true'");
  assert.equal(await evaluar("Array.from(document.querySelectorAll('.apariencia-imagen-item input')).every(input=>input.disabled)"), true);
  assert.match(await evaluar("document.querySelector('.apariencia-imagen-item [role=status]').textContent"), /Guardando/);
  await evaluar("window.dispatchEvent(new Event('focus'))");
  await hasta("Boolean(document.querySelector('.apariencia-imagen-item [role=alert]'))");
  assert.match(await evaluar("document.querySelector('.apariencia-imagen-item [role=alert]').textContent"), /No se pudo subir/);
  assert.equal(await evaluar("document.querySelector('.apariencia-imagen-item img').src"), urlAntes);
  assert.equal(await evaluar('document.documentElement.scrollWidth <= innerWidth'), true, 'Mi plan con imagen cargada no debe desbordarse en movil.');
  assert.equal(await evaluar("document.querySelector('.apariencia-imagen-item [role=alert]').getBoundingClientRect().height < 150"), true);
  await evaluar("document.querySelector('.apariencia-imagen-item [role=alert]').scrollIntoView({block:'center'})");
  const capturaError = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(os.tmpdir(), 'cir-apariencia-error.png'), Buffer.from(capturaError.data, 'base64'));
  fallarSubida = false;
  await subir(0);
  await hasta("document.querySelector('.mensaje-carga-imagen.exito')?.textContent === 'Logo actualizado.'");
  const solicitudesAntes = subidas;
  await evaluar(`(() => {
    const input=document.querySelector('.apariencia-imagen-item input');
    const transferencia=new DataTransfer();
    transferencia.items.add(new File(['no es imagen'], 'invalido.pdf', {type:'application/pdf'}));
    input.files=transferencia.files; input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await hasta("document.querySelector('.apariencia-imagen-item [role=alert]')?.textContent.includes('JPG, PNG o WebP')");
  assert.equal(subidas, solicitudesAntes);
  assert.deepEqual(errores, []);
  console.log('PASS: progreso visible, error junto a la imagen, foto anterior conservada, reintento y validacion sin enviar archivos invalidos.');
  await evaluar('window.mostrarLogin()');
  await hasta("Boolean(document.querySelector('.auth-landing-link'))");
  assert.equal(await evaluar("document.querySelector('.auth-landing-link').href"), 'https://cirganadero.circonsulting.net/');
  for (const [nombre, width, height] of [['escritorio',1440,1000], ['ipad',820,1180], ['movil',390,844]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluar("document.querySelector('.auth-landing-link').scrollIntoView({block:'center'});document.querySelector('.auth-link').focus()");
    await cdp('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await cdp('Input.dispatchKeyEvent', {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    const medidas = await evaluar(`(() => {
      const a=document.querySelector('.auth-landing-link'),r=a.getBoundingClientRect(),p=a.closest('form').getBoundingClientRect();
      return {ancho:document.documentElement.scrollWidth<=innerWidth,alto:r.height>=48,dentro:r.left>=p.left&&r.right<=p.right,visible:r.top>=0&&r.bottom<=innerHeight,foco:document.activeElement===a,outline:getComputedStyle(a).outlineStyle};
    })()`);
    assert.deepEqual(medidas, {ancho:true,alto:true,dentro:true,visible:true,foco:true,outline:'solid'});
    const captura = await cdp('Page.captureScreenshot', {format:'png'});
    writeFileSync(path.join(os.tmpdir(), `cir-login-${nombre}.png`), Buffer.from(captura.data, 'base64'));
  }
  await evaluar(`(() => {
    window.enviosLogin=0;window.destinoLanding='';
    document.querySelector('form').addEventListener('submit',()=>window.enviosLogin++);
    document.querySelector('.auth-landing-link').addEventListener('click',e=>{e.preventDefault();window.destinoLanding=e.currentTarget.href;},{once:true});
  })()`);
  await cdp('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await cdp('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await hasta("window.destinoLanding==='https://cirganadero.circonsulting.net/'");
  assert.equal(await evaluar('window.enviosLogin'), 0);
  assert.deepEqual(errores, []);
  console.log('PASS: enlace comercial del login en escritorio/iPad/movil, foco visible y activacion por teclado sin enviar credenciales.');
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await cdp('Browser.close'); } catch {}
    socket.close();
  }
  for (const pendiente of pendientes.values()) clearTimeout(pendiente.timer);
  if (navegador && !navegador.killed) navegador.kill();
  if (servidor) { servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve)); }
}
