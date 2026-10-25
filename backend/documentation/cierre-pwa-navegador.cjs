// Edge headless con perfil temporal. Sirve dist sin editarlo; dos versiones HTML/SW en memoria.
// Proxy cerrado para destinos externos. Solo HTTP loopback; nunca usa sesiones del usuario.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const delay=ms=>new Promise(r=>setTimeout(r,ms));
const out={fecha:new Date().toISOString(),modo:'Edge headless, perfil desechable, bundle real, dos versiones de shell en memoria'};
let server,browser,ws,version=1,seq=0;const pending=new Map();
const freePort=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function main(){try{
 const dist=path.resolve(__dirname,'../../frontend/dist');
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/api/audit-local'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({version}));}
  const file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream');
  let body=fs.readFileSync(file);
  if(file.endsWith('index.html'))body=body.toString().replace('</body>',`<span id="audit-shell">v${version}</span></body>`);
  if(file.endsWith(path.sep+'sw.js'))body=body.toString().replace(/(url:"index.html",revision:")[^"]+/,`$1audit-v${version}`);
  res.end(body);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const debug=await freePort();out.perfil=fs.mkdtempSync(path.join(os.tmpdir(),'ganaderia-cierre-edge-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost','--remote-debugging-port='+debug,'--user-data-dir='+out.perfil,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let spawnError;browser.on('error',e=>spawnError=e);let page;
 for(let i=0;i<60;i++){if(spawnError)throw spawnError;try{const pages=await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json());page=pages.find(p=>p.type==='page');if(page)break;}catch{}await delay(250);}assert.ok(page,'Edge no expuso CDP');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}};
 out.browser=await cdp('Browser.getVersion');await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Page.navigate',{url:base+'/'});
 let controlled=false;for(let i=0;i<100;i++){try{controlled=await evaluate("Boolean(navigator.serviceWorker.controller && document.querySelector('#audit-shell'))");if(controlled)break;}catch{}await delay(200);}assert.ok(controlled,'Service Worker no tomó control');
 out.version1=await evaluate("document.querySelector('#audit-shell').textContent");assert.equal(out.version1,'v1');
 out.apiOnline=await evaluate("fetch('/api/audit-local').then(r=>r.json())");
 out.apiEnCache=await evaluate("(async()=>{const urls=[];for(const key of await caches.keys()){for(const req of await (await caches.open(key)).keys())urls.push(req.url);}return urls.filter(u=>new URL(u).pathname.startsWith('/api/'));})()");assert.equal(out.apiEnCache.length,0);
 await cdp('Network.enable');await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 out.apiOffline=await evaluate("fetch('/api/audit-local').then(()=> 'RESPUESTA_INESPERADA').catch(()=> 'FALLO_RED_SIN_CACHE')");assert.equal(out.apiOffline,'FALLO_RED_SIN_CACHE');
 await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await cdp('Page.navigate',{url:base+'/api/audit-local'});
 let documentoApi;for(let i=0;i<40;i++){try{documentoApi=await evaluate("({shell:Boolean(document.querySelector('#audit-shell')),texto:document.body?.innerText})");if(documentoApi?.texto?.includes('version'))break;}catch{}await delay(100);}
 assert.equal(documentoApi?.shell,false);assert.equal(JSON.parse(documentoApi.texto).version,1);out.navegacionApiSinShell=true;
 await cdp('Page.navigate',{url:base+'/'});
 for(let i=0;i<60;i++){try{if(await evaluate("Boolean(navigator.serviceWorker.controller && document.querySelector('#audit-shell'))"))break;}catch{}await delay(100);}
 version=2;
 try{await evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update()).then(()=>true)");}catch(e){out.actualizacionContexto=e.message;}
 let marker;for(let i=0;i<100;i++){try{marker=await evaluate("document.querySelector('#audit-shell')?.textContent");if(marker==='v2')break;}catch{}await delay(200);}out.version2Automatica=marker;assert.equal(marker,'v2','Actualización no recargó la shell automáticamente');
 out.cacheKeys=await evaluate('caches.keys()');out.resultado='PASS';
 }catch(e){out.resultado='FAIL';out.error=e.stack;process.exitCode=1;}finally{
 fs.writeFileSync(path.join(__dirname,'cierre-pwa-navegador-resultados.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
 if(ws?.readyState===1){try{await cdp('Browser.close');}catch{}ws.close();}if(browser&&!browser.killed)browser.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 }}main();
