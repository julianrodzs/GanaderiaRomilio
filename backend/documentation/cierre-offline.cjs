// Ejecuta código frontend real con almacenamiento IndexedDB en memoria y red simulada.
// Sin navegador, sin disco de clientes y sin solicitudes externas.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(path.join(__dirname,'../../frontend/src/services',f),'utf8');
const source=s=>s.replace(/import[\s\S]*?from ['"][^'"]+['"];\s*/g,'').replace(/export const /g,'const ').replace(/export \{[^}]+\};/g,'');
const results=[];
async function scenario({status=200,switchFarm=false}){
 const data=new Map(),events=[],calls=[],local=new Map();
 const localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
 const db={close(){},transaction(name){const tx={};setImmediate(()=>tx.oncomplete?.());if(!data.has(name))data.set(name,new Map());const store=data.get(name);const request=result=>{const r={result:structuredClone(result)};setImmediate(()=>{r.onsuccess?.();});return r;};tx.objectStore=()=>({get:k=>request(store.get(k)),getAll:()=>request([...store.values()]),put:v=>{store.set(v.id,structuredClone(v));},delete:k=>{store.delete(k);}});return tx;}};
 const indexedDB={open(){const r={result:db};setImmediate(()=>r.onsuccess?.());return r;}};
 class E{constructor(type,opts={}){this.type=type;this.detail=opts.detail;}}
 const window={indexedDB,dispatchEvent:e=>events.push(e.type)},base={console,Date,JSON,Map,Set,Promise,Event:E,CustomEvent:E,window,localStorage,indexedDB,atob:s=>Buffer.from(s,'base64').toString('binary'),navigator:{onLine:true},FormData,URL,URLSearchParams};
 const payload={authTime:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600};const session={token:'fixture.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.fixture',usuario:{_id:'u'},organizacion:{_id:'o'},fincaId:'f1'};
 localStorage.setItem('ganaderiaSesion',JSON.stringify(session));
 const storageNames=['obtenerContextoOffline','guardarCambiosPendientes','obtenerCambiosPendientes','actualizarCambioPendiente','eliminarCambioPendiente','actualizarTareaEnCache','registrarResultadoSincronizacion'];
 const storage=vm.runInNewContext(source(read('offlineStorage.js'))+'\n({'+storageNames.join(',')+'})',base);
 const fetch=async(url,options)=>{calls.push({url,headers:options.headers});return{ok:status<400,status,json:async()=>status===200?{_id:'tarea',estado:'Completada'}:{mensaje:'Token revocado',code:'ACCESS_REVOKED'}};};
 const apiSource=source(read('api.js')).replace(/import\.meta\.env/g,'__env');
 const api=vm.runInNewContext(apiSource+'\n({completarTarea,crearEventoAnimal})',{...base,...storage,fetch,__env:{VITE_API_URL:'https://no-network.example.test/api',DEV:false}});
 const sync=vm.runInNewContext(source(read('offlineSync.js'))+'\n({sincronizarCambiosOffline})',{...base,...storage,...api});
 await storage.guardarCambiosPendientes({id:'fixture-1',tipo:'completar-tarea',referenciaId:'tarea',payload:{versionEsperada:'v1'}});
 if(switchFarm)localStorage.setItem('ganaderiaSesion',JSON.stringify({...session,fincaId:'f2'}));
 let summary,error;try{summary=await sync.sincronizarCambiosOffline();}catch(e){error=e.message;}
 const queue=[...(data.get('cambiosPendientes')?.values()||[])];
 if(switchFarm){assert.equal(calls.length,0);assert.equal(queue.length,1);}
 else if(status===401){assert.equal(calls.length,1);assert.equal(localStorage.getItem('ganaderiaSesion'),null);assert.ok(events.includes('ganaderiaSesionExpirada'));assert.equal(error,undefined);assert.equal(summary.sesionExpirada,true);}
 else {assert.equal(summary.sincronizados,1);assert.equal(queue.length,0);assert.equal(calls[0].headers['X-Finca-Id'],'f1');}
 return{status,switchFarm,envios:calls.length,resumen:summary,error,cola:queue.map(q=>({clave:q.clave,estado:q.estadoSincronizacion})),sesionEliminada:!localStorage.getItem('ganaderiaSesion'),eventos:events};
}
(async()=>{for(const c of [{status:200},{status:200,switchFarm:true},{status:401}]){let timer;try{results.push({ejecutado:true,...await Promise.race([scenario(c),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timeout del adaptador')),5000);})])});}catch(e){results.push({ejecutado:false,caso:c,error:e.stack});}finally{clearTimeout(timer);}}
 fs.writeFileSync(path.join(__dirname,'cierre-offline-resultados.json'),JSON.stringify({fecha:new Date().toISOString(),nota:'Adaptador IndexedDB en memoria; no monta React App ni su listener de limpieza al expirar sesión',results},null,2));console.log(JSON.stringify(results));process.exitCode=results.some(r=>!r.ejecutado)?1:0;})();
