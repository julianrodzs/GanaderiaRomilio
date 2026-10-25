/* Regresión de cierre: MongoDB REAL desechable en loopback.
 * Nunca lee .env, nunca acepta URI externa, nunca envía correo real.
 * Solo escribe fixtures en el mongod hijo creado aquí y evidencias en documentation.
 * Requiere mongod local; CIERRE_MONGOD puede indicar su ejecutable.
 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');const assert=require('node:assert/strict');
const mongoose=require('mongoose'),bcrypt=require('bcrypt');
const {MongoClient}=require('mongodb');
const out={fecha:new Date().toISOString(),modo:'HTTP real + MongoDB replica set temporal, correo simulado',steps:[],requests:[],checks:[],indices:{}};
const diagnostic=process.argv.includes('--diagnostico-sin-indice-eventos');
const currency=process.argv.includes('--moneda-usd')?'USD':'CRC';out.monedaSolicitada=currency;
out.diagnosticoSinIndiceEventos=diagnostic;
const record=(step,status,details)=>{const r={step,status,details};out.steps.push(r);console.log(JSON.stringify(r));};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let mongod,server,client,base,token,platformToken,finca,org,admin,potrero,lote,hembra,macho,veterinario,ternero,finca2;
let mail=[];const nativeFetch=global.fetch;
const password='AuditoriaLocal!2026-NoReal';
const ago=d=>new Date(Date.now()-d*86400000).toISOString();
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
async function request(method,url,body,options={}){
 const response=await nativeFetch(base+url,{method,signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(finca?{'X-Finca-Id':finca}:{}),...options.headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>null);out.requests.push({method,url,status:response.status,...(response.status>=400?{body:data}:{})});
 return{status:response.status,data};
}
async function ok(method,url,body,expected=200){const r=await request(method,url,body);assert.equal(r.status,expected,`${method} ${url}: ${JSON.stringify(r.data)}`);return r.data;}
async function step(n,name,fn){try{const details=await fn();record(n+' '+name,'PASS',details);}catch(e){record(n+' '+name,'FAIL',{message:e.message});}}
async function comprobacion(id,fn){const details=await fn();out.checks.push({id,status:'PASS',details});console.log(JSON.stringify({check:id,status:'PASS',details}));}
async function start(){
 const port=await freePort(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ganaderia-cierre-'));
 out.mongo={port,dir,replicaSet:'cierreAudit',dbName:'cierre_smoke'};
 const exe=process.env.CIERRE_MONGOD||'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe';
 mongod=spawn(exe,['--dbpath',dir,'--bind_ip','127.0.0.1','--port',String(port),'--replSet','cierreAudit','--logpath',path.join(dir,'mongod.log'),'--wiredTigerCacheSizeGB','0.25'],{windowsHide:true,stdio:'ignore'});
 let spawnError;mongod.on('error',e=>{spawnError=e;});
 client=new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`,{serverSelectionTimeoutMS:800});
 for(let i=0;i<30;i++){if(spawnError)throw spawnError;try{await client.connect();break;}catch(e){if(i===29)throw e;await delay(250);}}
 await client.db('admin').command({replSetInitiate:{_id:'cierreAudit',members:[{_id:0,host:`127.0.0.1:${port}`} ]}});
 for(let i=0;i<60;i++){const h=await client.db('admin').command({hello:1});if(h.isWritablePrimary)break;if(i===59)throw Error('Replica set no eligió primario');await delay(250);}
 process.env.NODE_ENV='test';process.env.JWT_SECRET='clave-local-auditoria-cierre-2026-no-produccion';process.env.RESEND_API_KEY='solo-simulado';process.env.FRONTEND_URL='https://app.example.test';process.env.CRON_MODE='external';delete process.env.EMAIL_TEST_TO;
 global.fetch=async(url,options)=>{if(String(url)==='https://api.resend.com/emails'){mail.push(JSON.parse(options.body));return{ok:true,json:async()=>({id:'simulado'})};}throw Error('Red externa prohibida en smoke: '+url);};
 await mongoose.connect(`mongodb://127.0.0.1:${port}/cierre_smoke?replicaSet=cierreAudit`,{serverSelectionTimeoutMS:10000});
 const app=require('../app');
 for(const f of fs.readdirSync(path.join(__dirname,'../models')).filter(f=>f.endsWith('.js')))require('../models/'+f);
 const {verificarModelo,limpiarIndiceEventoObsoleto}=require('../scripts/sincronizar-indices');
 for(const M of Object.values(mongoose.models)){await M.init();await verificarModelo(M);out.indices[M.modelName]=await M.collection.indexes();}
 await comprobacion('INDICES_65_MODELOS',async()=>{
  assert.equal(Object.keys(out.indices).length,65);
  const version=await mongoose.connection.db.admin().command({buildInfo:1});
  assert.match(version.version,/^8\./);return{modelos:65,mongodb:version.version};
 });
 await comprobacion('MIGRACION_INDICE_SPARSE_EN_OTRA_BASE',async()=>{
  const dbMigracion=mongoose.connection.useDb('cierre_migracion_indices');
  const modelo=dbMigracion.model('EventoAnimal',require('../models/EventoAnimal').schema.clone(), 'eventos_migracion', {autoIndex:false});
  await modelo.createCollection();
  await modelo.collection.createIndex({organizacionId:1,fincaId:1,claveIdempotencia:1},{unique:true,sparse:true});
  await modelo.collection.insertOne({organizacionId:new mongoose.Types.ObjectId(),fincaId:new mongoose.Types.ObjectId(),claveIdempotencia:null});
  await limpiarIndiceEventoObsoleto(modelo);await modelo.syncIndexes();await verificarModelo(modelo);
  const migrado=await modelo.collection.findOne({});assert.equal(Object.hasOwn(migrado,'claveIdempotencia'),false);
  const indices=await modelo.collection.indexes();const indice=indices.find(i=>i.key.claveIdempotencia);
  assert.equal(indice.sparse,undefined);assert.deepEqual(indice.partialFilterExpression,{claveIdempotencia:{$type:'string'}});
  await dbMigracion.dropDatabase();return{indiceParcial:true,claveNulaOmitida:true,baseAislada:true};
 });
 await comprobacion('SCRIPT_INDICES_65_MODELOS_E_IDEMPOTENCIA',async()=>{
  const env={...process.env,NODE_ENV:'production',MONGODB_URI:`mongodb://127.0.0.1:${port}/cierre_indices_cli?replicaSet=cierreAudit`,MONGODB_DB:'cierre_indices_cli',JWT_SECRET:'Cierre-Local-0123456789-abcdefghijklmnop',CRON_SECRET:'Cron-Local-0123456789-abcdefghijklmnop',FRONTEND_URL:'https://app.example.test'};
  const ejecuciones=[];
  for(let i=0;i<2;i++){
   const r=spawnSync(process.execPath,['--require',path.join(__dirname,'cierre-sin-dotenv.cjs'),path.join(__dirname,'../scripts/sincronizar-indices.js')],{env,windowsHide:true,encoding:'utf8',timeout:30000});
   assert.equal(r.error,undefined);assert.equal(r.status,0,(r.stdout||'')+(r.stderr||''));assert.match(r.stdout,/65 modelos registrados/);
   ejecuciones.push({exit:r.status,modelos:65});
  }
  await client.db('cierre_indices_cli').dropDatabase();return{ejecuciones,produccion:true,baseAislada:true};
 });
 if(diagnostic){
  // Solo el mongod hijo vacío de ESTA ejecución. Contrafactual diagnóstico, no aprobación E2E.
  await require('../models/EventoAnimal').collection.dropIndex('organizacionId_1_fincaId_1_claveIdempotencia_1');
  out.checks.push({id:'DIAGNOSTICO_ALTERACION_CONTROLADA',detalle:'Índice EventoAnimal retirado únicamente de DB temporal para descubrir bloqueos posteriores. No es configuración aprobada.'});
 }
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;
 const Usuario=require('../models/Usuario');const platform=await Usuario.create({nombre:'Auditor plataforma local',correo:'plataforma@example.test',contrasena:await bcrypt.hash(password,10),estado:'Activo',esSuperAdministrador:true});
 token=require('../middleware/auth').generarToken({id:String(platform._id),tokenVersion:0});
 platformToken=token;
}
async function main(){
 try{
  await start();
  await step(1,'Aprovisionar organización y aceptar invitación administrador',async()=>{
   const created=await ok('POST','/api/admin/organizaciones',{organizacion:{nombre:'Empresa Audit Local',slug:'audit-local'},plan:{codigo:'PREMIUM',estado:'Activo'},finca:{nombre:'Finca principal',codigo:'PRINCIPAL'},administrador:{nombre:'Admin',correo:'admin@example.test'}},201);
   const data=created;org=String(data.organizacion._id);finca=String(data.finca._id);admin=String(data.administrador.id);
   const invitationToken=mail.at(-1)?.text.match(/aceptar-invitacion\/([a-f0-9]+)/)?.[1];assert.ok(invitationToken,'No se emitió invitación');
   const accept=await request('POST','/api/invitaciones/aceptar',{token:invitationToken,contrasena:password});
   assert.equal(accept.status,200,JSON.stringify(accept.data));
   const replay=await request('POST','/api/invitaciones/aceptar',{token:invitationToken,contrasena:password});assert.equal(replay.status,400);
   const usuario=await require('../models/Usuario').findById(admin).select('+resetPasswordToken +resetPasswordExpires').lean();
   assert.equal(usuario.estado,'Activo');assert.equal(usuario.tokenVersion,1);assert.equal(usuario.resetPasswordToken,undefined);
   return{org,finca};
  });
  await step(2,'Login y alta de Encargado y Veterinario',async()=>{
   const login=await ok('POST','/api/usuarios/login',{correo:'admin@example.test',contrasena:password});token=login.token;
   for(const rol of ['Encargado','Veterinario']){
    const data=await ok('POST','/api/usuarios',{nombre:rol,correo:rol.toLowerCase()+'@example.test',contrasena:password,rol,sinAccesoCorreo:true,accesoTodasFincas:true,fincas:[finca]},201);
    if(rol==='Veterinario')veterinario=data.usuario?._id||data._id;
   }
   assert.ok(veterinario);return{roles:['Encargado','Veterinario'],temporal:true};
  });
  await step(3,'Potrero de pastoreo y lote de engorde',async()=>{
   potrero=(await ok('POST','/api/potreros',{nombre:'Pastoreo audit',codigo:'P-01',tipoArea:'PASTOREO',area:2},201))._id;
   const data=await ok('POST','/api/lotes',{codigo:'ENG-01',nombre:'Engorde audit',especie:'Bovino',proposito:'ENGORDE',fechaInicio:ago(3)},201);lote=data._id||data.lote?._id;assert.ok(lote);return{potrero,lote};
  });
  await step(4,'Dos bovinos, pertenencia al lote y rotación',async()=>{
   const errors=[];
   for(const sexo of ['Hembra','Macho']){
    const response=await request('POST','/api/animales',{identificadorFinca:sexo==='Hembra'?'H-01':'M-01',diio:sexo==='Hembra'?'CR-AUD-H01':'CR-AUD-M01',especie:'Bovino',sexo,fechaNacimiento:ago(1200),objetivoProductivo:'ENGORDE',raza:'Brahman',estado:'Activo'});
    const list=await ok('GET','/api/animales');const a=list.find(x=>x.identificadorFinca===(sexo==='Hembra'?'H-01':'M-01'));
    if(sexo==='Hembra')hembra=a?._id;else macho=a?._id;
    if(response.status!==201)errors.push({sexo,status:response.status,persistido:Boolean(a),error:response.data});
   }
   if(errors.length){out.checks.push({id:'ALTA_ANIMAL_PARCIAL',errors});assert.fail(JSON.stringify(errors));}
   await ok('POST',`/api/lotes/${lote}/animales`,{animales:[hembra,macho],fechaEntrada:ago(2)},201);
   await ok('POST',`/api/lotes/${lote}/cambiar-potrero`,{potrero,fechaEntrada:ago(1)});
   return{hembra,macho,lote,potrero};
  });
  await step(5,'Pesajes del lote y suministro de alimentación',async()=>{
   await ok('POST',`/api/lotes/${lote}/pesajes`,{fecha:ago(0.02),pesajes:[{animal:hembra,peso:420},{animal:macho,peso:450}]},201);
   const alimentos=await ok('GET','/api/alimentacion/alimentos');const alimento=alimentos[0];assert.ok(alimento);
   const supplied=await ok('POST','/api/alimentacion/suministros',{lote,fechaHora:ago(0),claveIdempotencia:'audit-suministro-1',detalles:[{alimento:alimento._id,tipoMedicion:'PESADA',cantidadIngresada:20,unidadIngresada:'KG',sobranteKg:2}]},201);
   assert.equal(supplied.totalKgSuministrados,20);return{totalKg:supplied.totalKgSuministrados};
  });
  const sale=()=>({especie:'Bovino',fechaVenta:ago(0),comprador:'Comprador local de prueba',moneda:currency,animales:[{animal:macho,pesoVentaKg:450,precioKg:2}]});
  await step(6,'Tratamiento con retiro y advertencia de venta',async()=>{
   await ok('POST','/api/tratamientos-sanitarios',{animales:[macho],especie:'Bovino',motivo:'Prueba integración',producto:'Producto sintético',fechaInicio:ago(0.01),diasRetiroCarne:30,cantidadAplicaciones:1,registrarPrimeraAplicacion:true,asignadoA:veterinario},201);
   const warning=await request('POST','/api/ventas',sale());assert.equal(warning.status,409,JSON.stringify(warning));assert.ok(warning.data.retiros?.length);return{status:warning.status,retiros:warning.data.retiros.length};
  });
  await step(7,'Ciclo, parto, ternero y consumo de cupo',async()=>{
   const before=await ok('GET','/api/plan/actual');out.planAntesTernero=before;
   const cycle=await ok('POST','/api/reproduccion',{animal:hembra,especie:'Bovino',fechaMonta:ago(284),asignadoA:veterinario},201);
   await ok('PUT','/api/reproduccion/'+cycle._id,{fechaPartoReal:ago(0.005)});
   const calf=await ok('POST',`/api/reproduccion/${cycle._id}/ternero`,{identificadorFinca:'T-01',sexo:'Macho',pesoNacimiento:35},201);ternero=calf._id;
   assert.equal(String(calf.madre?._id||calf.madre),hembra);assert.equal(calf.madreDiio,'CR-AUD-H01');assert.equal(calf.especie,'Bovino');assert.match(calf.descripcionRacial||calf.raza,/Brahman/i);assert.equal(String(calf.fincaId),finca);out.herenciaTernero={madre:hembra,madreDiio:calf.madreDiio,especie:calf.especie,raza:calf.descripcionRacial||calf.raza,fincaId:calf.fincaId};const after=await ok('GET','/api/plan/actual');out.planDespuesTernero=after;
   assert.equal(after.uso.animalesActuales,before.uso.animalesActuales+1);return{ternero,madre:hembra,antes:before.uso.animalesActuales,despues:after.uso.animalesActuales};
  });
  await step(8,'Venta confirmada, salida del lote e ingreso '+currency,async()=>{
   const sold=await ok('POST','/api/ventas',{...sale(),confirmarRetiroCarne:true},201);
   const {ejecutarConOrganizacion:scope}=require('../context/organizacion-context');
   const result=await scope(org,async()=>({animal:await require('../models/Animal').findById(macho).lean(),pertenencias:await require('../models/PertenenciaLote').countDocuments({animal:macho,activo:true}),movimientos:await require('../models/MovimientoFinanciero').find({referenciaModelo:'VentaAnimal'}).lean()}),finca);
   out.ventaVerificada={estado:result.animal.estado,pertenencias:result.pertenencias,movimientos:result.movimientos.map(m=>({monto:m.monto,moneda:m.moneda}))};
   assert.equal(result.animal.estado,'Vendido');assert.equal(result.pertenencias,0);assert.equal(result.movimientos.length,1);assert.equal(result.movimientos[0].moneda,currency);assert.equal(result.movimientos[0].monto,900);
   return{venta:sold._id,estado:result.animal.estado,pertenencias:0,ingreso:900,moneda:currency};
  });
  await step(9,'Dashboard y reporte de resumen',async()=>{
   const resumen=await ok('GET','/api/reportes/resumen');const inventory=await ok('GET','/api/animales');const multi=await ok('GET','/api/reportes/multi-finca');
   out.dashboard={resumen,multi};assert.equal(multi.consolidado.animalesActivos,2);assert.equal(resumen.inventario.totalAnimales,3);assert.equal(resumen.reproduccion.partos.resumen.totalPartos,1);assert.equal(multi.consolidado.monedas[currency]?.ingresos||0,900,'Ingreso esperado por la solicitud de venta; revisar moneda persistida');return{animales:inventory.length,activos:multi.consolidado.animalesActivos,partos:1,ingresos:900,moneda:currency};
  });
  await comprobacion('ALTA_ANIMAL_ROLLBACK_EVENTO',async()=>{
   const Evento=require('../models/EventoAnimal'),Animal=require('../models/Animal'),original=Evento.findOneAndUpdate;
   Evento.findOneAndUpdate=function(filtro,update,...args){if(update?.$set?.metadata?.diio==='CR-ROLLBACK')throw Error('Fallo de evento provocado');return original.call(this,filtro,update,...args);};
   try{
    const response=await request('POST','/api/animales',{identificadorFinca:'CR-ROLLBACK',diio:'CR-ROLLBACK',especie:'Bovino',sexo:'Macho',fechaNacimiento:ago(400),objetivoProductivo:'ENGORDE'});
    assert.equal(response.status,400,JSON.stringify(response.data));
    const n=await Animal.collection.countDocuments({diio:'CR-ROLLBACK'});assert.equal(n,0);return{status:400,animalesPersistidos:0};
   }finally{Evento.findOneAndUpdate=original;}
  });
  await comprobacion('EVENTOS_IDEMPOTENCIA_Y_CLAVES_OMITIDAS',async()=>{
   const {ejecutarConOrganizacion:scope}=require('../context/organizacion-context');
   return scope(org,async()=>{
    const M=require('../models/EventoAnimal'),{upsertEventoAnimal}=require('../services/eventoAnimal-service');
    const baseEvento={animal:ternero,tipoEvento:'Observacion',fecha:new Date(),titulo:'Control idempotencia',moduloOrigen:'Manual'};
    for(const claveIdempotencia of [null,'','   ',undefined])await M.create({...baseEvento,claveIdempotencia});
    const a=await upsertEventoAnimal({...baseEvento,claveIdempotencia:'control-cierre'}),b=await upsertEventoAnimal({...baseEvento,claveIdempotencia:'control-cierre'});
    assert.equal(String(a._id),String(b._id));
    await assert.rejects(()=>M.create({...baseEvento,claveIdempotencia:'control-cierre'}),e=>e.code===11000);
    const docs=await M.find({animal:ternero,titulo:baseEvento.titulo}).select('+claveIdempotencia').lean();
    assert.equal(docs.length,5);assert.equal(docs.filter(d=>Object.hasOwn(d,'claveIdempotencia')).length,1);return{sinClave:4,conClave:1,deduplicado:true};
   },finca);
  });
  await step('X1','Traslado entre fincas con plugin de aislamiento',async()=>{
   const created=await ok('POST','/api/fincas',{nombre:'Finca secundaria',codigo:'SECUNDARIA'},201);finca2=created._id||created.finca?._id;assert.ok(finca2,JSON.stringify(created));
   await ok('POST','/api/fincas/traslados',{fincaDestino:finca2,animales:[hembra],fecha:ago(0),motivo:'Auditoría integración'},201);
   const dest=await request('GET','/api/animales',undefined,{headers:{'X-Finca-Id':finca2}});assert.equal(dest.status,200);assert.ok(dest.data.some(a=>a._id===hembra));assert.ok(!(await ok('GET','/api/animales')).some(a=>a._id===hembra));return{finca2,animal:hembra};
  });
  await comprobacion('TRASLADO_HISTORIAL_Y_ROLLBACK',async()=>{
   const Evento=require('../models/EventoAnimal'),Animal=require('../models/Animal'),Historia=require('../models/HistorialFincaAnimal'),Traslado=require('../models/TrasladoFinca');
   const eventos=await Evento.collection.find({animal:new mongoose.Types.ObjectId(hembra),moduloOrigen:'Fincas'}).toArray();
   assert.deepEqual(new Set(eventos.map(e=>String(e.fincaId))),new Set([finca,finca2]));
   const iniciales={historias:await Historia.collection.countDocuments({animal:new mongoose.Types.ObjectId(ternero)}),traslados:await Traslado.collection.countDocuments({})};
   const original=Evento.create;Evento.create=async function(docs,...args){if(docs?.some(d=>String(d.animal)===String(ternero)&&d.moduloOrigen==='Fincas'))throw Error('Fallo de evento traslado provocado');return original.call(this,docs,...args);};
   try{
    const r=await request('POST','/api/fincas/traslados',{fincaDestino:finca2,animales:[ternero],fecha:ago(0),motivo:'Rollback controlado'});
    assert.ok(r.status>=400);const animal=await Animal.collection.findOne({_id:new mongoose.Types.ObjectId(ternero)});assert.equal(String(animal.fincaId),finca);
    assert.equal(await Historia.collection.countDocuments({animal:animal._id}),iniciales.historias);assert.equal(await Traslado.collection.countDocuments({}),iniciales.traslados);
    return{bitacoraEnAmbasFincas:true,rollbackCompleto:true,status:r.status};
   }finally{Evento.create=original;}
  });
  await step('X2','Transferencia, gasto compartido y anulaciones',async()=>{
   assert.ok(finca2);const output=[];
   for(const [route,body] of [['transferencias',{fincaDestino:finca2,monto:100}],['gastos-compartidos',{montoTotal:100,modo:'IGUAL',distribucion:[{fincaId:finca},{fincaId:finca2}],categoria:'Otros gastos',descripcion:'Gasto de auditoría'}]]){
    const response=await request('POST','/api/finanzas/multi-finca/'+route,{...body,fecha:ago(0),moneda:'USD'});
    if(response.status!==201){output.push({route,status:response.status,body:response.data});continue;}const created=response.data;
    await ok('POST',`/api/finanzas/multi-finca/grupos/${created.grupoConsolidacion}/anular`,{motivo:'Anulación auditada'});
    const items=(await ok('GET','/api/finanzas/multi-finca')).filter(m=>m.grupoConsolidacion===created.grupoConsolidacion);
    assert.equal(items.length,4);const net=items.reduce((sum,m)=>sum+(m.naturaleza==='Ingreso'?1:-1)*m.monto,0);assert.equal(net,0);output.push({route,movimientos:items.length,neto:net});
   }out.finanzasMulti=output;assert.ok(output.every(x=>x.neto===0),JSON.stringify(output));return output;
  });
  await step('X2R','Anulación de grupos preexistentes sintéticos',async()=>{
   // Fixtures directos, en el mongod desechable, para probar la anulación aunque falle el alta HTTP.
   const {ejecutarConOrganizacion:scope}=require('../context/organizacion-context'),M=require('../models/MovimientoFinanciero');const output=[];
   for(const kind of ['TRANSFERENCIA_INTERNA','GASTO_COMPARTIDO']){
    const grupo=new mongoose.Types.ObjectId();
    for(const [i,farm] of [finca,finca2].entries())await scope(org,()=>M.create({fecha:new Date(),tipoMovimiento:kind==='TRANSFERENCIA_INTERNA'?'Transferencia interna':'Compra',naturaleza:kind==='TRANSFERENCIA_INTERNA'&&i===1?'Ingreso':'Egreso',categoria:'Otros gastos',descripcion:'Fixture sintético para anulación',monto:50,moneda:'USD',alcanceFinanciero:kind,grupoConsolidacion:grupo,excluirConsolidacion:kind==='TRANSFERENCIA_INTERNA',referenciaModelo:kind==='TRANSFERENCIA_INTERNA'?'TransferenciaInterna':'GastoCompartido',referenciaId:grupo}),farm);
    const r=await request('POST',`/api/finanzas/multi-finca/grupos/${grupo}/anular`,{motivo:'Validación de grupo preexistente sintético'});output.push({kind,status:r.status,...(r.status!==200?{body:r.data}:{})});
   }out.anulacionesFixtures=output;assert.ok(output.every(x=>x.status===200),JSON.stringify(output));return output;
  });
  await comprobacion('TRANSFERENCIA_ROLLBACK_SEGUNDA_PARTIDA',async()=>{
   const M=require('../models/MovimientoFinanciero'),original=M.create;
   M.create=async function(docs,options){if(docs?.length===2&&docs[0].descripcion==='Rollback segunda partida'){await original.call(this,[docs[0]],options);throw Error('Fallo provocado en segunda partida');}return original.call(this,docs,options);};
   try{
    const r=await request('POST','/api/finanzas/multi-finca/transferencias',{fincaDestino:finca2,monto:100,fecha:ago(0),moneda:'CRC',descripcion:'Rollback segunda partida'});
    assert.ok(r.status>=400);assert.equal(await M.collection.countDocuments({descripcion:'Rollback segunda partida'}),0);return{status:r.status,partidasPersistidas:0};
   }finally{M.create=original;}
  });
  await comprobacion('GASTO_Y_ANULACIONES_ROLLBACK_E_IDEMPOTENCIA',async()=>{
   const M=require('../models/MovimientoFinanciero'),A=require('../models/Auditoria');
   const crearOriginal=M.create,auditarOriginal=A.create;
   const gasto={montoTotal:100,modo:'IGUAL',distribucion:[{fincaId:finca},{fincaId:finca2}],categoria:'Otros gastos',descripcion:'Rollback gasto compartido',fecha:ago(0),moneda:'CRC'};
   M.create=async function(docs,options){if(docs?.length===2&&docs[0].descripcion===gasto.descripcion){await crearOriginal.call(this,[docs[0]],options);throw Error('Fallo provocado segunda finca');}return crearOriginal.call(this,docs,options);};
   try{
    const r=await request('POST','/api/finanzas/multi-finca/gastos-compartidos',gasto);assert.ok(r.status>=400);
    assert.equal(await M.collection.countDocuments({descripcion:gasto.descripcion}),0);
   }finally{M.create=crearOriginal;}
   const output=[];
   for(const [route,datos] of [['transferencias',{fincaDestino:finca2,monto:100,fecha:ago(0),moneda:'CRC'}],['gastos-compartidos',{...gasto,descripcion:'Control anulación gasto'}]]){
    const grupo=await ok('POST','/api/finanzas/multi-finca/'+route,datos,201);
    A.create=async function(docs,...args){if(docs?.some(d=>d.accion==='ANULAR_GRUPO_MULTI_FINCA'))throw Error('Fallo auditoría anulación provocado');return auditarOriginal.call(this,docs,...args);};
    try{
     const r=await request('POST',`/api/finanzas/multi-finca/grupos/${grupo.grupoConsolidacion}/anular`,{motivo:'Prueba rollback'});assert.ok(r.status>=400);
     const rows=await M.collection.find({grupoConsolidacion:new mongoose.Types.ObjectId(grupo.grupoConsolidacion)}).toArray();
     assert.equal(rows.length,2);assert.ok(rows.every(m=>!m.grupoAnuladoEn));
    }finally{A.create=auditarOriginal;}
    for(let intento=0;intento<2;intento++)await ok('POST',`/api/finanzas/multi-finca/grupos/${grupo.grupoConsolidacion}/anular`,{motivo:'Anulación definitiva'});
    const finales=await M.collection.find({grupoConsolidacion:new mongoose.Types.ObjectId(grupo.grupoConsolidacion)}).toArray();
    assert.equal(finales.length,4);assert.equal(finales.reduce((sum,m)=>sum+(m.naturaleza==='Ingreso'?1:-1)*m.monto,0),0);
    output.push({route,rollbackCompleto:true,anulacionIdempotente:true,neto:0});
   }
   return output;
  });
  await step('X3','Compra y egreso automático',async()=>{
   const compra=await ok('POST','/api/compras',{especie:'Bovino',fechaCompra:ago(0),proveedor:'Proveedor sintético',animales:[{diio:'CR-AUD-COMPRA',identificadorFinca:'C-01',sexo:'Macho',fechaNacimiento:ago(700),pesoCompraKg:300,precioKg:2}]},201);
   const movements=await ok('GET','/api/finanzas');out.compraRespuesta=compra;
   const list=Array.isArray(movements)?movements:movements.movimientos;assert.ok(list?.some(m=>m.referenciaModelo==='CompraAnimal'&&m.monto===600&&m.moneda==='CRC'));return{egreso:600,moneda:'CRC'};
  });
  await comprobacion('COMPRAVENTAS_RECHAZAN_USD',async()=>{
   const Compra=require('../models/CompraAnimal'),Venta=require('../models/VentaAnimal'),M=require('../models/MovimientoFinanciero');
   const iniciales=[await Compra.collection.countDocuments({}),await Venta.collection.countDocuments({}),await M.collection.countDocuments({})];
   const compra=await request('POST','/api/compras',{especie:'Bovino',moneda:'USD',fechaCompra:ago(0),proveedor:'Control USD',animales:[{diio:'USD-COMPRA',sexo:'Macho',pesoCompraKg:300,precioKg:2}]});
   const venta=await request('POST','/api/ventas',{especie:'Bovino',moneda:'USD',fechaVenta:ago(0),comprador:'Control USD',animales:[{animal:ternero,pesoVentaKg:35,precioKg:2}]});
   assert.equal(compra.status,400,JSON.stringify(compra.data));assert.equal(venta.status,400,JSON.stringify(venta.data));
   assert.match(compra.data.mensaje,/CRC/);assert.match(venta.data.mensaje,/CRC/);
   assert.deepEqual([await Compra.collection.countDocuments({}),await Venta.collection.countDocuments({}),await M.collection.countDocuments({})],iniciales);
   return{compra:400,venta:400,persistenciaAlterada:false};
  });
  await step('X4','Importación Excel y confirmación transaccional',async()=>{
   const XLSX=require('xlsx'),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['DIIO','ESPECIE','SEXO','CATEGORIA'],['CR-AUD-IMPORT','Bovino','Macho','Ternero']]),'INVENTARIO');
   const form=new FormData();form.append('archivo',new Blob([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'audit.xlsx');
   const resp=await nativeFetch(base+'/api/importar/excel',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Finca-Id':finca},body:form,signal:AbortSignal.timeout(30000)});const preview=await resp.json();out.importPreview=preview;out.requests.push({method:'POST',url:'/api/importar/excel',status:resp.status});assert.equal(resp.status,200,JSON.stringify(preview));
   const confirmed=await ok('POST','/api/importar/excel/confirmar',{importacionId:preview.importacionId,modo:'solo_crear'},201);
   assert.ok((await ok('GET','/api/animales')).some(a=>a.diio==='CR-AUD-IMPORT'));return confirmed;
  });
  await step('X5','Cron con organizaciones y fincas reales',async()=>{
   // Simula una categoría desactualizada por el paso del tiempo, solo en el animal sintético.
   await require('../models/Animal').collection.updateOne({_id:new mongoose.Types.ObjectId(hembra),organizacionId:new mongoose.Types.ObjectId(org)},{$set:{categoria:'Ternera'}});
   process.env.CRON_SECRET='cron-local-sintetico';const output=[];
   for(const route of ['alertas','resumenes-email']){const r=await request('POST','/api/cron/'+route,{}, {headers:{Authorization:'Bearer '+process.env.CRON_SECRET}});assert.equal(r.status,200,JSON.stringify(r));output.push({route,resultado:r.data});}return output;
  });
  await step('X6','Selector organizaciones, finca y revocación tokenVersion',async()=>{
   const originalToken=token;token=platformToken;
   const other=await ok('POST','/api/admin/organizaciones',{organizacion:{nombre:'Segunda organización',slug:'audit-segunda'},plan:{codigo:'PREMIUM',estado:'Activo'},finca:{nombre:'Otra principal',codigo:'OTRA'},administrador:{nombre:'Admin',correo:'admin@example.test'}},201);
   token=originalToken;const decode=t=>JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString('utf8')),before=decode(token);
   const changed=await ok('POST','/api/usuarios/cambiar-organizacion-activa',{organizacionId:other.organizacion._id});token=changed.token;assert.ok(token);const after=decode(token);assert.equal(after.exp,before.exp);assert.equal(after.authTime,before.authTime);
   const otherAnimals=await request('GET','/api/animales',undefined,{headers:{'X-Finca-Id':other.finca._id}});assert.equal(otherAnimals.status,200);assert.equal(otherAnimals.data.length,0);
   const denied=await request('GET','/api/animales');assert.equal(denied.status,403,'Finca de otra organización debe rechazarse');
   const originalFarm=finca;finca=String(other.finca._id);
   token=(await ok('POST','/api/usuarios/cambiar-organizacion-activa',{organizacionId:org})).token;finca=originalFarm;
   await ok('PUT','/api/usuarios/perfil',{contrasenaActual:password,contrasenaNueva:password+'Cambio'});
   const statuses=[];for(const [method,url,body] of [['GET','/api/usuarios/perfil'],['GET','/api/animales'],['POST','/api/usuarios/cambiar-organizacion-activa',{organizacionId:org}]]){const r=await request(method,url,body);statuses.push(r.status);assert.equal(r.status,401);}
   token=(await ok('POST','/api/usuarios/login',{correo:'admin@example.test',contrasena:password+'Cambio'})).token;return{cambioOrganizacion:true,conservaExpAuthTime:true,fincaAjena:403,tokenRevocado:statuses};
  });
 }catch(e){record('INFRAESTRUCTURA','FAIL',{message:e.message,stack:e.stack});}
 finally{
  fs.writeFileSync(path.join(__dirname,currency==='USD'?'cierre-smoke-moneda-usd-resultados.json':diagnostic?'cierre-smoke-diagnostico-resultados.json':'cierre-smoke-resultados.json'),JSON.stringify(out,null,2));
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  await delay(200);await mongoose.disconnect().catch(()=>{});await client?.close().catch(()=>{});
  if(mongod&&!mongod.killed)mongod.kill();global.fetch=nativeFetch;
  process.exitCode=out.steps.length!==16||out.steps.some(s=>s.status==='FAIL')?1:0;
 }
}
main();
