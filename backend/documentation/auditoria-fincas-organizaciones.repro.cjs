/* Solo local. No carga .env ni conecta MongoDB. Hooks/queries Mongoose reales sobre
 * driver en memoria; HTTP loopback con rutas reales y controladores de negocio neutros.
 * Las aserciones son regresiones de la remediación F01-F12.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const mongoose = require('mongoose');
const express = require('express');
const { ejecutarConOrganizacion: scope, obtenerOrganizacionActual: orgActual, obtenerFincaActual: farmActual } = require('../context/organizacion-context');
const { aplicarAislamientoOrganizacion } = require('../models/plugins/organizacion-plugin');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
function load(file, overrides={}) {
  const filename=path.join(root,file), local=createRequire(filename), m={exports:{}};
  vm.runInThisContext(`(function(require,module,exports){${read(file)}\n})`,{filename})(n=>Object.hasOwn(overrides,n)?overrides[n]:local(n),m,m.exports);
  return m.exports;
}
const oid = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24,'0'));
const ids={a:oid(1), b:oid(2), a1:oid(11), a2:oid(12), a3:oid(13), b1:oid(21), adminA:oid(31), encargado:oid(32), adminB:oid(33)};
const eq=(a,b)=>String(a?._id||a)===String(b?._id||b);
function matches(d,f={}) {
 return Object.entries(f).every(([k,v])=>{
  if(k==='$or')return v.some(x=>matches(d,x));
  if(k==='$and')return v.every(x=>matches(d,x));
  const x=d[k];
  if(v && typeof v==='object' && !v._bsontype && !(v instanceof Date)) return Object.entries(v).every(([op,y])=>{
   if(op==='$in')return y.some(z=>eq(x,z)); if(op==='$nin')return !y.some(z=>eq(x,z)); if(op==='$ne')return !eq(x,y);
   if(op==='$exists')return (x!==undefined)===y; if(op==='$gte')return x>=y;if(op==='$lte')return x<=y;if(op==='$gt')return x>y;if(op==='$lt')return x<y; return false;
  });
  return eq(x,v);
 });
}
function memory(Model, rows) {
 const trace=[];
 Model.collection.find=(f)=>{trace.push({op:'find',f});return {toArray:async()=>rows.filter(x=>matches(x,f))};};
 Model.collection.findOne=async f=>{trace.push({op:'findOne',f});return rows.find(x=>matches(x,f))||null;};
 Model.collection.countDocuments=async f=>{trace.push({op:'countDocuments',f});return rows.filter(x=>matches(x,f)).length;};
 Model.collection.distinct=async(k,f)=>{trace.push({op:'distinct',f});return [...new Set(rows.filter(x=>matches(x,f)).map(x=>String(x[k])))];};
 for(const op of ['updateOne','updateMany','deleteOne','deleteMany','findOneAndUpdate'])Model.collection[op]=async(f,u)=>{
  trace.push({op,f,u}); const found=rows.filter(x=>matches(x,f)); if(u?.$set) for(const row of (op==='updateMany'?found:found.slice(0,1)))Object.assign(row,u.$set);
  if(op==='findOneAndUpdate')return found[0]||null;
  return {acknowledged:true,matchedCount:found.length,modifiedCount:found.length,deletedCount:found.length};
 };
 Model.collection.insertOne=async d=>{trace.push({op:'insertOne',d});rows.push(d);return{acknowledged:true,insertedId:d._id};};
 Model.collection.insertMany=async ds=>{trace.push({op:'insertMany',ds});rows.push(...ds);return{acknowledged:true,insertedCount:ds.length,insertedIds:ds.map(x=>x._id)};};
 Model.collection.bulkWrite=async ops=>{trace.push({op:'bulkWrite',ops});for(const o of ops)if(o.updateOne){const d=rows.find(x=>matches(x,o.updateOne.filter));if(d)Object.assign(d,o.updateOne.update.$set);}return{modifiedCount:1};};
 Model.collection.aggregate=(pipeline)=>{trace.push({op:'aggregate',pipeline});return{toArray:async()=>pipeline.filter(s=>s.$match).reduce((r,s)=>r.filter(x=>matches(x,s.$match)),rows)};};
 return trace;
}
const schema=new mongoose.Schema({nombre:String,valor:Number,usuario:{type:mongoose.Schema.Types.ObjectId,ref:'Usuario'},relacion:{type:mongoose.Schema.Types.ObjectId,ref:'AuditFincaProbe'}});
schema.plugin(aplicarAislamientoOrganizacion,{finca:true});
const Probe=mongoose.model('AuditFincaProbe',schema);
let rows=[ids.a1,ids.a2,ids.a3,ids.b1].map((f,i)=>({_id:oid(100+i),nombre:`dato-${i}`,valor:i,organizacionId:i===3?ids.b:ids.a,fincaId:f}));
const trace=memory(Probe,rows);
const Finca=require('../models/Finca');
const farms=[ids.a1,ids.a2,ids.a3,ids.b1].map((f,i)=>({_id:f,nombre:`F${i}`,codigo:`F${i}`,organizacionId:i===3?ids.b:ids.a,estado:'Activa',lineasProductivas:[{especie:'Bovino',objetivos:['ENGORDE'],activa:true}]}));
memory(Finca,farms);
const orgs=[{_id:ids.a,nombre:'Org A',estado:'Activa',fincaPrincipal:ids.a1,plan:{codigo:'PREMIUM',estado:'Activo'}},{_id:ids.b,nombre:'Org B',estado:'Activa',fincaPrincipal:ids.b1,plan:{codigo:'PREMIUM',estado:'Activo'}}];
const User=require('../models/Usuario');
const users=[ids.adminA,ids.encargado,ids.adminB].map((u,i)=>({_id:u,nombre:`U${i}`,correo:`u${i}@example.test`,estado:'Activo',tokenVersion:0,esSuperAdministrador:false}));
memory(User,users);
const {Membresia}=require('../models/Membresia');
const memberships=users.map((u,i)=>({_id:oid(50+i),usuario:u._id,organizacionId:i===2?ids.b:ids.a,rol:i===1?'Encargado':'Administrador',estado:'Activo',accesoTodasFincas:i!==1,fincas:i===1?[ids.a1]:[]}));
memory(Membresia,memberships);
const Org=require('../models/Organizacion'); memory(Org,orgs);
const secretBefore=process.env.JWT_SECRET; process.env.JWT_SECRET='local-audit-only-fincas-2026-strong-key';
const auth=require('../middleware/auth');
const access=require('../services/accesoFinca-service');
let checks=0;const results=[];
async function check(name,fn){const details=await fn();checks++;results.push({name,details});console.log(`OK ${checks} ${name}${details?' '+JSON.stringify(details):''}`);}
const q=v=>{const x={then:(a,b)=>Promise.resolve(v).then(a,b)};for(const k of ['select','lean','sort','setOptions','session','populate','limit','skip'])x[k]=()=>x;return x;};
async function core(){
 for(const operation of ['find','findOne','findById','countDocuments','distinct','updateOne','updateMany','findOneAndUpdate','deleteOne','deleteMany'])await check(`C01 ${operation} inyecta organización y finca`,async()=>scope(ids.a,async()=>{
  let query;
  if(operation==='findById')query=Probe.findById(rows[3]._id);
  else if(operation==='distinct')query=Probe.distinct('nombre',{});
  else if(operation.startsWith('update')||operation==='findOneAndUpdate')query=Probe[operation]({},{ $set:{valor:10}});
  else query=Probe[operation]({});
  await query;const last=trace.at(-1);assert.ok(eq(last.f.organizacionId,ids.a));assert.ok(eq(last.f.fincaId,ids.a1));
 },ids.a1));
 await check('C02 aggregate limita raíz y el lookup sanitario valida organización',async()=>scope(ids.a,async()=>{
  await Probe.aggregate([{$lookup:{from:Probe.collection.name,localField:'relacion',foreignField:'_id',as:'ajeno'}}]);
  const p=trace.at(-1).pipeline;assert.ok(eq(p[0].$match.organizacionId,ids.a));
  assert.match(read('controllers/reporte-controller.js'),/\$eq: \['\$organizacionId', '\$\$organizacionId'\]/);
 },ids.a1));
 await check('C03 populate modelo aislado rechaza referencia B; Usuario global sí retorna identidad B',async()=>scope(ids.a,async()=>{
  rows[0].relacion=rows[3]._id;rows[0].usuario=ids.adminB;
  const d=await Probe.findById(rows[0]._id).populate('relacion').populate('usuario','nombre correo').lean();
  assert.equal(d.relacion,null);assert.equal(d.usuario.correo,'u2@example.test');
 },ids.a1));
 await check('C04 sin contexto lectura obligatoria vacía; contexto solo org abarca 3 fincas',async()=>{
  assert.equal((await Probe.find()).length,0);
  assert.equal((await scope(ids.a,()=>Probe.find())).length,3);
 });
 await check('F01 bulkWrite inyecta organización y finca',async()=>scope(ids.a,async()=>{
  await Probe.bulkWrite([{updateOne:{filter:{_id:rows[3]._id},update:{$set:{valor:99}}}}]);
  assert.notEqual(rows[3].valor,99);assert.ok(eq(trace.at(-1).ops[0].updateOne.filter.organizacionId,ids.a));assert.ok(eq(trace.at(-1).ops[0].updateOne.filter.fincaId,ids.a1));
 },ids.a1));
 await check('F01 save/insertMany imponen el tenant del contexto',async()=>scope(ids.a,async()=>{
  await new Probe({nombre:'save-ajeno',organizacionId:ids.b,fincaId:ids.b1}).save();
  assert.ok(eq(rows.at(-1).organizacionId,ids.a));assert.ok(eq(rows.at(-1).fincaId,ids.a1));
  await Probe.insertMany([{nombre:'insert-ajeno',organizacionId:ids.b,fincaId:ids.b1}]);
  assert.ok(eq(rows.at(-1).organizacionId,ids.a));assert.ok(eq(rows.at(-1).fincaId,ids.a1));
 },ids.a1));
 await check('F01 updateOne elimina cambios de tenant',async()=>scope(ids.a,async()=>{
  await Probe.updateOne({_id:rows[0]._id},{$set:{organizacionId:ids.b,fincaId:ids.b1}});
  assert.ok(eq(rows[0].organizacionId,ids.a));assert.ok(eq(rows[0].fincaId,ids.a1));
 },ids.a1));
 await check('C05 100 contextos asíncronos entrelazados sin mezcla',async()=>{
  await Promise.all(Array.from({length:100},(_,i)=>scope(i%2?ids.a:ids.b,async()=>{
   await new Promise(r=>setTimeout(r,i%7));const d=await Probe.find();assert.ok(d.every(x=>eq(x.organizacionId,i%2?ids.a:ids.b)&&eq(x.fincaId,i%2?ids.a1:ids.b1)));
  },i%2?ids.a1:ids.b1)));assert.equal(orgActual(),null);return {contexts:100};
 });
 await check('C06 finca A2/B1 e inactiva rechazadas para Encargado A1',async()=>{
  for(const f of [ids.a2,ids.b1])await assert.rejects(access.resolverFincaActiva({membresia:memberships[1],organizacion:orgs[0],fincaSolicitada:String(f)}),e=>e.status===403);
  farms[0].estado='Inactiva';await assert.rejects(access.resolverFincaActiva({membresia:memberships[1],organizacion:orgs[0],fincaSolicitada:String(ids.a1)}),e=>e.status===403);farms[0].estado='Activa';
 });
 await check('C07 reporte resuelve solo fincas autorizadas',async()=>{
  const partial={...memberships[0],accesoTodasFincas:false,fincas:[ids.a1,ids.a2]};
  const got=await access.resolverFincasParaReporte({membresia:partial,organizacionId:ids.a});assert.equal(got.length,2);
  await assert.rejects(access.resolverFincasParaReporte({membresia:partial,organizacionId:ids.a,fincaIds:[ids.a3]}),e=>e.status===403);
 });
}
const matrixSpec=[
 ['animal.js','animales','/','/'],['loteRoutes.js','lotes','/','/'],['alimentacionRoutes.js','alimentacion','/planes','/planes'],['camadaRoutes.js','camadas','/','/'],['pesaje.js','pesajes','/','/'],['potrero.js','potreros','/','/'],['rotacion.js','rotaciones','/','/'],['sanidad.js','sanidad','/','/'],['planSanitario.js','plan-sanitario','/','/'],['tratamientoSanitarioRoutes.js','tratamientos-sanitarios','/','/'],['aplicacionSanitariaRoutes.js','aplicaciones-sanitarias','/','/unica'],['reproduccionRoutes.js','reproduccion','/','/'],['iatfRoutes.js','iatf','/campanas','/campanas'],['protocoloEngordeRoutes.js','protocolos-engorde','/ciclos','/ciclos'],['protocoloPorcinoRoutes.js','protocolos-porcinos','/bandas','/bandas'],['finanza.js','finanzas','/','/'],['ventaAnimalRoutes.js','ventas','/','/'],['compraAnimalRoutes.js','compras','/','/'],['reporte.js','reportes','/multi-finca','/multi-finca/cierres'],['finca.js','fincas','/','/'],['tareaRoutes.js','tareas','/','/'],['eventoAnimalRoutes.js','eventos-animal','/animal/'+oid(100),'/'],['eventoCamadaRoutes.js','eventos-camada','/camada/'+oid(100),'/'],['usuario.js','usuarios','/perfil','/'],['notificacionRoutes.js','notificaciones','/','/:id/leida'],['importar.js','importar','/excel/plantilla','/excel'],['conteoDroneRoutes.js','conteo-drone','/','/procesar']
];
async function httpMatrix(){
 const app=express();app.use(express.json());
 const pass=(q,s,n)=>n(), business=(q,s)=>s.json({ok:true,org:orgActual(),finca:farmActual()});
 const config={requireFeature:()=>pass,requirePlanVigente:()=>pass};
 for(const [file,mount]of matrixSpec){
  const overrides={'../middleware/auth':auth,'../middleware/plan':config,'../middleware/rateLimit':{rateLimitLogin:pass,rateLimitRecuperacion:pass,rateLimitInvitacion:pass}};
  for(const m of read(`routes/${file}`).matchAll(/require\('([^']*controllers[^']*)'\)/g))overrides[m[1]]=new Proxy(business,{get:()=>business});
  app.use('/api/'+mount,auth.auth,load('routes/'+file,overrides));
 }
 // Un endpoint representativo sin lógica de negocio permite observar el contexto HTTP.
 app.get('/scope',auth.auth,async(q,s)=>{await new Promise(r=>setTimeout(r,Math.random()*8));s.json({org:orgActual(),finca:farmActual()});});
 const s=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const base=`http://127.0.0.1:${s.address().port}`;
 const jwt=i=>auth.generarToken({id:String(users[i]._id),organizacionId:String(i===2?ids.b:ids.a),tokenVersion:0});
 const request=async(url,i,f,method='GET')=>fetch(base+url,{method,headers:{Authorization:'Bearer '+jwt(i),'X-Finca-Id':String(f),'Content-Type':'application/json'},...(method!=='GET'?{body:'{}'}:{})});
 const output=[];
 try{
  await check('C08 matriz HTTP: 3 usuarios x 4 fincas x GET/POST x 27 módulos',async()=>{
   for(const [file,mount,get,post]of matrixSpec)for(let u=0;u<3;u++)for(const f of [ids.a1,ids.a2,ids.a3,ids.b1])for(const method of ['GET','POST']){
    const accessible=u===0?!eq(f,ids.b1):u===1?eq(f,ids.a1):eq(f,ids.b1);
    const actualMethod=mount==='notificaciones'&&method==='POST'?'PATCH':method;
    const route=mount==='importar'&&method==='GET'?'/plantilla':(method==='GET'?get:post);
    const r=await request('/api/'+mount+route,u,f,actualMethod);const body=await r.json().catch(()=>({}));
    const deniedByScope=['FINCA_ACCESS_DENIED','FINCA_NOT_AVAILABLE'].includes(body.code);
    if(!accessible){assert.equal(r.status,403,`${mount}/${u}/${f}`);assert.equal(deniedByScope,true);}
    else {assert.equal(deniedByScope,false);assert.notEqual(r.status,404,`${mount} ${actualMethod} ruta inexistente`);}
    output.push({modulo:mount,usuario:['AdminA','EncargadoA1','AdminB'][u],finca:String(f),method:actualMethod,esperado:accessible?'Superar guarda finca; depende rol/ruta':'403 finca',status:r.status,code:body.code||null});
   }return{requests:output.length,denied:output.filter(x=>x.esperado==='403 finca').length};
  });
  await check('C09 60 peticiones HTTP simultáneas no mezclan contexto',async()=>{
   await Promise.all(Array.from({length:60},(_,i)=>request('/scope',i%2?0:2,i%2?ids.a2:ids.b1).then(r=>r.json()).then(d=>{assert.equal(d.org,String(i%2?ids.a:ids.b));assert.equal(d.finca,String(i%2?ids.a2:ids.b1));})));return{requests:60};
  });
 }finally{await new Promise(r=>s.close(r));}
 return output;
}
async function businessChecks(){
 const service=require('../services/consolidacionMultiFinca-service');
 const report=require('../services/reporteMultiFinca-service');
 await check('F02 reparto exige centavos exactos y partidas positivas',async()=>{
  const dist=[ids.a1,ids.a2,ids.a3].map(f=>({fincaId:String(f)}));
  assert.throws(()=>service.calcularDistribucionGasto({montoTotal:0.01,distribucion:dist}));
  assert.throws(()=>service.calcularDistribucionGasto({montoTotal:1.001,modo:'MONTO',distribucion:[{fincaId:String(ids.a1),monto:1}]}));
 });
 await check('C10 sumas y ponderaciones por finca/moneda: 3 fincas desiguales',async()=>{
  const input={fincas:farms.slice(0,3),inventario:farms.slice(0,3).map((f,i)=>({_id:f._id,activos:i+1,bovinos:i+1,animalesConPeso:i+1,pesoTotal:(i+1)*(100+100*i)})),finanzas:farms.slice(0,3).flatMap((f,i)=>['CRC','USD'].map(moneda=>({_id:{fincaId:f._id,moneda},ingresos:(i+1)*(moneda==='CRC'?100:1),egresos:i,transferenciasEntrantes:i,gastosCompartidos:i}))),partos:[{_id:ids.a1,cantidad:2}],destetes:[{_id:ids.a1,cantidad:3,conPeso:3,pesoTotal:300}],aplicaciones:[{_id:ids.a2,cantidad:5}],tratamientos:[{_id:ids.a3,cantidad:7}],traslados:[{fincaOrigen:ids.a1,fincaDestino:ids.a2,cantidad:2}]};
  const r=report.construirComparativoMultiFinca(input);
  for(const [metric,path]of [['animalesActivos',['inventario','activos']],['bovinos',['inventario','bovinos']],['porcinos',['inventario','porcinos']],['animalesConPeso',['inventario','animalesConPeso']],['ingresos',['finanzas','ingresos']],['egresos',['finanzas','egresos']],['gastosCompartidos',['finanzas','gastosCompartidos']],['partos',['reproduccion','partos']],['destetes',['reproduccion','destetes']],['aplicaciones',['sanidad','aplicaciones']],['tratamientosActivos',['sanidad','tratamientosActivos']],['traslados',['traslados','entradas']]])assert.equal(r.consolidado[metric],r.fincas.reduce((n,x)=>n+x[path[0]][path[1]],0));
  assert.equal(r.consolidado.pesoPromedio,1400/6);assert.equal(r.consolidado.monedas.CRC.ingresos,600);assert.equal(r.consolidado.monedas.USD.ingresos,6);assert.equal(r.consolidado.balance,r.consolidado.ingresos-r.consolidado.egresos);
  assert.equal(r.consolidado.fincas,r.fincas.length);
  assert.equal(r.consolidado.transferenciasInternas,r.fincas.reduce((n,x)=>n+x.finanzas.transferenciasEntrantes,0));
  for(const currency of ['CRC','USD'])for(const metric of ['ingresos','egresos','balance','gastosCompartidos','transferenciasInternas'])assert.equal(r.consolidado.monedas[currency][metric],r.fincas.reduce((n,x)=>n+x.finanzas.monedas[currency][metric==='transferenciasInternas'?'transferenciasEntrantes':metric],0));
  for(const metric of ['inventarioPct','ingresosPct','egresosPct'])assert.ok(Math.abs(r.fincas.reduce((n,x)=>n+x.participacion[metric],0)-100)<1e-10);
  const zero=report.construirComparativoMultiFinca({fincas:farms.slice(0,3)});assert.equal(zero.consolidado.pesoPromedio,null);
  return {animales:6,pesoPromedio:r.consolidado.pesoPromedio,CRC:r.consolidado.monedas.CRC,USD:r.consolidado.monedas.USD};
 });
 await check('F03 corte histórico usa Pesaje y ventana temporal de tratamientos',async()=>{
  const src=read('services/reporteMultiFinca-service.js');
  assert.match(read('services/poblacionHistorica-service.js'),/pesoAlCorte: pesaje\?\.peso/);
  assert.match(src,/fechaInicio: \{ \$lte: fin \}/);assert.match(src,/fechaFin: \{ \$gte: inicio \}/);
 });
 await check('F04 agrupación mensual usa zona horaria de la organización',async()=>{
  const when=new Date('2026-10-01T02:00:00Z');assert.equal(when.getUTCMonth()+1,10);assert.equal(new Intl.DateTimeFormat('en',{timeZone:'America/Costa_Rica',month:'numeric'}).format(when),'9');
  assert.match(read('services/reporteMultiFinca-service.js'),/\$month: \{ date: '\$fecha', timezone: zonaHoraria \}/);
 });
 await check('F05 consultas históricas incluyen fincas inactivas autorizadas',async()=>{
  farms[1].estado='Inactiva';try{const got=await access.resolverFincasParaReporte({membresia:memberships[0],organizacionId:ids.a,fincaIds:[ids.a1,ids.a2],incluirInactivas:true});assert.equal(got.length,2);}finally{farms[1].estado='Activa';}
  assert.match(read('controllers/consolidacionMultiFinca-controller.js'),/const fincasHistoricas/);
 });
 await check('F06 traslado futuro se rechaza antes de modificar inventario',async()=>{
  const operations=[];const animal={_id:oid(600),fincaId:ids.a1,organizacionId:ids.a,estado:'Activo',especie:'Bovino',createdAt:new Date('2020-01-01')};
  const stub={create:async d=>d,updateMany:async()=>({modifiedCount:1}),exists:()=>q(true),find:()=>q([])};
  const mover=load('services/consolidacionMultiFinca-service.js',{
   mongoose:{...mongoose,startSession:async()=>({withTransaction:async f=>f(),endSession:async()=>{}})},
   '../models/Animal':{find:()=>q([animal]),findOne:()=>q(null),updateOne:async(f,u)=>{operations.push(u);return{modifiedCount:1};}},
   '../models/TrasladoFinca':{create:async d=>d.map(x=>({...x,_id:oid(601)}))},'../models/HistorialFincaAnimal':stub,'../models/PertenenciaLote':stub,'../models/EventoAnimal':stub,'../models/Auditoria':stub,
   './finca-service':{validarObjetivoProductivoFinca:async()=>true}
  });
  const future=new Date(Date.now()+30*86400000);await assert.rejects(mover.trasladarAnimalesEntreFincas({fincaOrigenId:ids.a1,fincaDestino:farms[1],animales:[String(animal._id)],fecha:future,motivo:'Prueba local',usuarioId:ids.adminA}),e=>e.code==='TRANSFER_DATE_IN_FUTURE');
  assert.equal(operations.length,0);return{futureAccepted:false};
 });
 await check('C11 meta/cierre no acepta fincas ajenas en resolver; clave cierre estable',async()=>{
  await assert.rejects(service.guardarMetaConsolidacion({datos:{alcance:'FINCA',finca:String(ids.b1),fechaInicio:'2026-01-01',fechaFin:'2026-01-31',metas:{partos:2}},fincasAutorizadas:farms.slice(0,3),usuarioId:ids.adminA}),e=>e.status===403);
  assert.equal(service.claveCierre({fincaIds:[ids.a1,ids.a2]}),service.claveCierre({fincaIds:[ids.a2,ids.a1]}));
 });
 await check('F07 downgrade conserva excedentes en solo lectura y permite elegir operativas',async()=>{
  const p=require('../services/plan-service'); orgs[0].plan.codigo='PRO';
  const extra=[41,42,43].map(n=>({_id:oid(n),organizacionId:ids.a,estado:'Activa'}));farms.push(...extra);
  const allowed=await scope(ids.a,()=>p.puedeCrearFinca({organizacionId:ids.a}));assert.equal(allowed.permitido,false);assert.equal(allowed.sobreLimite,true);
  const politica=await scope(ids.a,()=>p.obtenerPoliticaFincasOperativas(ids.a),ids.a1);assert.equal(politica.operativas.length,5);assert.equal(politica.soloLectura.length,1);farms.splice(4);orgs[0].plan.codigo='PREMIUM';
 });
}
async function frontendRace(){
 await check('F08 respuesta tardía A1 se descarta al cambiar a A2',async()=>{
  let session={token:'local',organizacion:{_id:String(ids.a)},usuario:{_id:String(ids.adminA)},fincaId:String(ids.a1)};let resolveFetch;
  const box={localStorage:{getItem:()=>JSON.stringify(session)},FormData:class{},window:{dispatchEvent(){}},CustomEvent:class{},Event:class{},fetch:()=>new Promise(r=>resolveFetch=r),obtenerContextoOffline:()=>({clave:session.fincaId})};
  const src=read('../frontend/src/services/api.js').replace(/import \{ obtenerContextoOffline \} from '.\/offlineStorage';/,'').replaceAll('import.meta.env.VITE_API_URL',"'http://local.invalid/api'").replaceAll('import.meta.env.DEV','false').replace(/export (const|\{)/g,'$1').replace(/^\{ API_URL \};/m,'')+'\nglobalThis.api=request;';
  vm.runInNewContext(src,box);const pending=box.api('/animales');session={...session,fincaId:String(ids.a2)};resolveFetch({ok:true,json:async()=>[{_id:'animal-A1'}]});
  await assert.rejects(pending,e=>e.code==='REQUEST_CONTEXT_CHANGED');
  const storage=read('../frontend/src/services/offlineStorage.js');assert.match(storage,/contextoEsperado\.clave !== contextoActual\.clave/);
 });
}
async function benchmark(){
 const animals=Array.from({length:10000},(_,i)=>({_id:oid(1000+i),fincaId:oid(100+i%10),especie:'Bovino',fechaNacimiento:new Date('2020-01-01'),pesoActual:100+i%500}));
 const ten=Array.from({length:10},(_,i)=>({_id:oid(100+i),codigo:`F${i}`,nombre:`Finca ${i}`}));let reads=0;
 const history=load('services/poblacionHistorica-service.js',{'../models/Animal':{find:()=>{reads+=animals.length;return q(animals);}},'../models/HistorialFincaAnimal':{find:()=>q([])},'../models/Pesaje':{find:()=>q([])}});
 const empty={find:()=>q([]),aggregate:()=>({option:()=>Promise.resolve([])})};
 const rpt=load('services/reporteMultiFinca-service.js',{'./poblacionHistorica-service':history,'../models/Animal':empty,'../models/MovimientoFinanciero':empty,'../models/RegistroReproductivo':{RegistroReproductivo:empty},'../models/AplicacionSanitaria':{AplicacionSanitaria:empty},'../models/TratamientoSanitario':{TratamientoSanitario:empty},'../models/MetaConsolidacion':empty,'../models/TrasladoFinca':empty,'../models/HistorialFincaAnimal':empty,'../models/Camada':empty});
 await check('F09 carga 10000 animales una sola vez para 10 fincas',async()=>{
  const times=[];for(let i=0;i<5;i++){const t=performance.now();const r=await rpt.obtenerReporteMultiFinca({fincas:ten,fechaInicio:'2026-01-01',fechaFin:'2026-10-23',especie:'Todos'});assert.equal(r.consolidado.animalesActivos,10000);times.push(performance.now()-t);}
  const app=express();app.get('/consolidado',async(req,res)=>res.json(await rpt.obtenerReporteMultiFinca({fincas:ten,fechaInicio:'2026-01-01',fechaFin:'2026-10-23',especie:'Todos'})));
  const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const httpTimes=[];
  try{for(let i=0;i<5;i++){const start=performance.now();const data=await fetch(`http://127.0.0.1:${server.address().port}/consolidado`).then(r=>r.json());assert.equal(data.consolidado.animalesActivos,10000);httpTimes.push(performance.now()-start);}}
  finally{await new Promise(r=>server.close(r));}
  assert.equal(reads/10,10000);return{fincas:10,animales:10000,ms:times.map(x=>Math.round(x*100)/100),httpMs:httpTimes.map(x=>Math.round(x*100)/100),animalRowsReadPerRun:reads/10,environment:'Node '+process.version+' local '+process.platform+' '+process.arch+', DB adaptada en memoria; HTTP loopback sin middleware de auth'};
 });
}
async function additionalChecks(){
 await check('F10 administrador limitado a A1 no puede editar A2 por ID',async()=>{
  const app=express();app.use(express.json());app.use('/api/fincas',auth.auth,require('../routes/finca'));
  const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  const previous={...memberships[0]},name=farms[1].nombre;
  memberships[0].accesoTodasFincas=false;memberships[0].fincas=[ids.a1];
  try{
   const token=auth.generarToken({id:String(ids.adminA),organizacionId:String(ids.a),tokenVersion:0});
   const headers={Authorization:'Bearer '+token,'X-Finca-Id':String(ids.a1),'Content-Type':'application/json'};
   const base=`http://127.0.0.1:${server.address().port}/api/fincas`;
   const listed=await fetch(base,{headers}).then(r=>r.json());assert.equal(listed.length,1);
   const response=await fetch(base+'/'+ids.a2,{method:'PUT',headers,body:JSON.stringify({nombre:'Cambio sin acceso a A2'})});
   const body=await response.json();assert.equal(response.status,403,JSON.stringify(body));assert.equal(farms[1].nombre,name);
   const foreign=await fetch(base+'/'+ids.b1,{method:'PUT',headers,body:JSON.stringify({nombre:'No debe cambiar B'})});assert.equal(foreign.status,403);
   return{listedFarms:1,unauthorizedSameOrgUpdate:response.status,foreignOrgUpdate:foreign.status};
  }finally{Object.assign(memberships[0],previous);farms[1].nombre=name;await new Promise(r=>server.close(r));}
 });
 await check('C12 último cupo de finca: dos creaciones concurrentes y reactivación concurrente',async()=>{
  let lock=null;
  const quota={findOneAndUpdate:async(f,u)=>{if(u.$setOnInsert)return{};if(lock)return null;lock=u.$push.reservas;return{reservas:[lock]};},updateOne:async(f,u)=>{if(u.$pull?.reservas?.token===lock?.token)lock=null;return{};}};
  const plan=load('services/plan-service.js',{'../models/ReservaCuotaPlan':quota});
  const service=load('services/finca-service.js',{'./plan-service':plan});
  orgs[0].plan.codigo='PRO';farms.push({_id:oid(800),organizacionId:ids.a,estado:'Activa'});
  try{
   const run=n=>scope(ids.a,()=>service.crearFinca({organizacionId:ids.a,datos:{nombre:'Finca '+n,codigo:'TEST'+n}}),ids.a1);
   const created=await Promise.allSettled([run(1),run(2)]);assert.equal(created.filter(x=>x.status==='fulfilled').length,1);assert.equal(created.find(x=>x.status==='rejected').reason.status,422);
   const newFarm=farms.find(x=>x.codigo?.startsWith('TEST'));newFarm.estado='Inactiva';
   const reactivate=()=>scope(ids.a,()=>service.cambiarEstadoFinca({fincaId:newFarm._id,estado:'Activa',organizacionId:ids.a}),ids.a1);
   const mixed=await Promise.allSettled([run(3),reactivate()]);assert.equal(mixed.filter(x=>x.status==='fulfilled').length,1);assert.equal(farms.filter(x=>eq(x.organizacionId,ids.a)&&x.estado==='Activa').length,5);
   return{createStatuses:created.map(x=>x.status),mixedStatuses:mixed.map(x=>x.status),scope:'Servicios reales, CAS Mongo simulado; no replica set'};
  }finally{farms.splice(4);orgs[0].plan.codigo='PREMIUM';}
 });
 await check('C13 índices de negocio contienen organización/finca y Esencial rechaza segunda especie',async()=>{
  for(const [file,field,perFarm]of [['Animal','identificadorFinca',true],['Animal','diio',false],['Finca','codigo',false],['Potrero','codigo',true],['Lote','codigo',true],['Camada','codigoCamada',true]]){
   const M=require('../models/'+file);const idx=M.schema.indexes().find(([keys,o])=>keys[field]&&o.unique);
   assert.ok(idx,`${file}.${field}`);assert.equal(idx[0].organizacionId,1);if(perFarm)assert.equal(idx[0].fincaId,1);
  }
  orgs[0].plan.codigo='ESENCIAL';orgs[0].plan.especiePlan='Bovino';
  try{await assert.rejects(require('../services/finca-service').validarEspeciesLineasPlan([{especie:'Porcino',activa:true}],ids.a),e=>e.status===403);}
  finally{orgs[0].plan.codigo='PREMIUM';delete orgs[0].plan.especiePlan;}
 });
 await check('F11 fotos operativas R2 son privadas y sin URL permanente',async()=>{
  let command;const before={};const env={R2_ACCOUNT_ID:'local',R2_ACCESS_KEY_ID:'local',R2_SECRET_ACCESS_KEY:'local',R2_BUCKET:'audit-local',R2_PRIVATE_BUCKET:'audit-private-local',R2_PUBLIC_URL:'https://imagenes.example.test'};
  for(const[k,v]of Object.entries(env)){before[k]=process.env[k];process.env[k]=v;}
  try{
   const service=load('services/almacenamientoR2-service.js',{'@aws-sdk/client-s3':{S3Client:class{async send(c){command=c.input;}},PutObjectCommand:class{constructor(input){this.input=input;}},GetObjectCommand:class{constructor(input){this.input=input;}},DeleteObjectCommand:class{}}});
   const result=await service.subirImagenR2({archivo:{buffer:Buffer.from([255,216,255]),mimetype:'image/jpeg',originalname:'animal.jpg'},organizacionId:ids.a,fincaId:ids.a1,uso:'FOTO_ANIMAL'});
   assert.equal(command.CacheControl,'private, no-store');assert.equal(result.url,'');assert.equal(result.visibilidad,'PRIVADO');assert.match(read('routes/archivoRoutes.js'),/router\.get\('\/r2\/:id'/);
   return{public:false,cache:command.CacheControl,scope:'Contrato local; bucket real no consultado'};
  }finally{for(const[k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;}
 });
 await check('F12 operaciones financieras protegidas tienen anulación transaccional del grupo',async()=>{
  const protect=require('../services/movimientoFinanciero-proteccion-service');
  for(const reference of ['TransferenciaInterna','GastoCompartido'])assert.equal(protect.presentarMovimientoFinanciero({referenciaModelo:reference}).soloLectura,true);
  const routes=read('routes/finanza.js');assert.match(routes,/\/multi-finca\/grupos\/:grupoConsolidacion\/anular/);
  const service=require('../services/consolidacionMultiFinca-service');assert.equal(typeof service.anularGrupoFinancieroMultiFinca,'function');assert.match(read('services/consolidacionMultiFinca-service.js'),/withTransaction/);
 });
}
async function main(){
 try{await core();const matrix=await httpMatrix();await businessChecks();await frontendRace();await benchmark();await additionalChecks();
  fs.writeFileSync(path.join(__dirname,'auditoria-fincas-organizaciones.resultados.json'),JSON.stringify({fecha:'2026-10-23',modo:'Local, persistencia simulada; no producción',escenario:ids,checks,results,matrix},null,2));
  console.log(`TOTAL ${checks} comprobaciones; ${matrix.length} casos de matriz HTTP. Sin conexiones MongoDB.`);
 }finally{if(secretBefore===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secretBefore;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
