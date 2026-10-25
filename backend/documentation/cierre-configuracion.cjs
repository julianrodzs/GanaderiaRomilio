// Verificaciones de solo lectura sobre código y HTTP loopback. Nunca lee .env ni conecta DB.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function load(file,mocks={},globals={}){const filename=path.join(root,file),m={exports:{}},req=createRequire(filename);vm.runInNewContext(read(file),{require:n=>Object.hasOwn(mocks,n)?mocks[n]:req(n),module:m,exports:m.exports,console,process,...globals},{filename});return m.exports;}
const results=[];async function check(id,fn){try{const data=await fn();results.push({id,ejecutado:true,data});console.log(id,JSON.stringify(data));}catch(e){results.push({id,ejecutado:false,error:e.message});console.error(id,e.message);}}
async function main(){
 await check('ARRANQUE_SIN_VARIABLES',async()=>{
  const env={NODE_ENV:'production'},state={};
  const mongoose={connect:async(uri,options)=>{state.uri=uri;state.options=options;},connection:{db:{databaseName:'solo-simulado'}}};
  const database=load('database.js',{mongoose},{process:{env}});
  const validar=()=>require('../config/env').validarConfiguracionArranque(env);
  load('index.js',{dotenv:{config(){}},'./config/env':{validarConfiguracionArranque:validar},'./app':{get:()=>4000,listen:(port,cb)=>{state.listen=true;cb();}},'./database':database,'./services/trabajoProgramado-service':{iniciarProgramadorAlertas:()=>state.cron=true}},{process:{env,exit:code=>state.exit=code}});
  await new Promise(r=>setImmediate(r));assert.equal(state.listen,undefined);assert.equal(state.uri,undefined);assert.equal(state.exit,1);return{...state,nota:'Entrypoint real con listen/conexión instrumentados: aborta antes de conectar o escuchar'};
 });
 process.env.NODE_ENV='production';delete process.env.RESEND_API_KEY;delete process.env.IA_SERVICE_URL;process.env.IA_ALLOW_SIMULATION='true';process.env.FRONTEND_URL='https://app.example.test';process.env.EMAIL_TEST_TO='pruebas@example.test';
 await check('EMAIL_TEST_TO_PRODUCCION',async()=>{const to=await require('../services/correoElectronico-service').obtenerDestinatariosAdministradores(null);assert.deepEqual(to,[]);return{destino:to,ignorado:true};});
 await check('CORREO_SIN_API_KEY',async()=>{
  const logs=[],before=[console.log,console.warn,console.error];let message;
  try{console.log=console.warn=console.error=(...args)=>logs.push(args.join(' '));await require('../services/correoElectronico-service').enviarCorreoRecuperacion({correo:'audit@example.test',nombre:'Local',token:'MARCADOR_NO_REAL'});}catch(e){message=e.message;}finally{[console.log,console.warn,console.error]=before;}
  assert.ok(message);assert.ok(!logs.join('').includes('MARCADOR_NO_REAL'));return{rechazado:message,tokenEnLogs:false};
 });
 await check('IA_PRODUCCION',async()=>{const ia=require('../services/iaConteoService');assert.equal(ia.simulacionPermitida(),false);await assert.rejects(ia.procesarImagenConteo({imagenPath:'no-se-lee',imagenUrl:'local'}));return{simulacion:false};});
 await check('JWT_LONGITUD',async()=>{const auth=require('../middleware/auth');process.env.JWT_SECRET='x';assert.throws(()=>auth.generarToken({id:'local'}));process.env.JWT_SECRET='x'.repeat(32);assert.throws(()=>auth.generarToken({id:'local'}));process.env.JWT_SECRET='Cierre-Local-0123456789-abcdefghijklmnop';assert.ok(auth.generarToken({id:'local'}));return{rechazaCorto:true,rechaza32Repetidos:true,validacionEnUso:true};});
 await check('CABECERAS_CORS_PROXY',async()=>{
  const app=require('../app');app.get('/__cierre/ip',(req,res)=>res.json({ip:req.ip,secure:req.secure}));app.get('/__cierre/error',(req,res)=>res.status(500).json({error:'NO_EXPONER'}));
  const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const base=`http://127.0.0.1:${server.address().port}`;
  try{
   const response=await fetch(base+'/__cierre/ip',{headers:{Origin:'https://ajeno.example.test','X-Forwarded-For':'203.0.113.7','X-Forwarded-Proto':'https'}});const body=await response.json();assert.equal(body.ip,'203.0.113.7');
   const error=await fetch(base+'/__cierre/error').then(r=>r.json());assert.equal(error.mensaje,'Error interno del servidor.');
   const plain=await fetch(base+'/');const forwarded=await fetch(base+'/',{headers:{'X-Forwarded-Proto':'http'}});
   return{trustProxy:app.get('trust proxy'),ip:body.ip,headers:Object.fromEntries([...response.headers].filter(([k])=>/access-control|security-policy|strict-transport|x-content|x-frame|referrer|permissions/.test(k))),sinForwardedProto:plain.status,forwardedHttp:forwarded.status,error500:error};
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 });
 await check('PWA_BUNDLE',async()=>{
  const sw=read('../frontend/dist/sw.js');const dir=path.join(root,'../frontend/dist/assets');
  const bundles=fs.readdirSync(dir).map(file=>({file,bytes:fs.statSync(path.join(dir,file)).size}));
  assert.ok(sw.includes('skipWaiting'));assert.ok(sw.includes('clientsClaim'));assert.ok(sw.includes('denylist'));assert.ok(sw.includes('api'));
  assert.ok(bundles.filter(b=>b.file.endsWith('.js')).every(b=>b.bytes<=500000),'Hay un chunk superior a 500 kB');
  return{bundles,skipWaiting:true,clientsClaim:true,cleanupOutdatedCaches:sw.includes('cleanupOutdatedCaches'),navigationDenylist:true,nota:'La denylist excluye API de navegación; la prueba de navegador verifica caché y actualización'};
 });
 const {planesConfig}=require('../config/planes');
 fs.writeFileSync(path.join(__dirname,'cierre-configuracion-resultados.json'),JSON.stringify({fecha:new Date().toISOString(),results,planes:planesConfig},null,2));
 process.exitCode=results.some(r=>!r.ejecutado)?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
