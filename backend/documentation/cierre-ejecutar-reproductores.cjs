// Ejecuta reproductores existentes sin modificar aplicación ni evidencia anterior.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
if(process.env.CIERRE_REPRO_CHILD==='1'){
 const original=fs.writeFileSync;
 fs.writeFileSync=function(file,...args){
  if(String(file).endsWith('auditoria-fincas-organizaciones.resultados.json'))file=path.join(__dirname,'cierre-repro-fincas.resultados.json');
  return original.call(this,file,...args);
 };
}else{
 const only=process.argv.find(a=>a.startsWith('--solo='))?.slice(7);
 const result=only?JSON.parse(fs.readFileSync(path.join(__dirname,'cierre-reproductores.json'),'utf8')).filter(r=>r.file!==only):[];
 for(const file of fs.readdirSync(__dirname).filter(f=>f.endsWith('.repro.cjs')&&(!only||f===only)).sort()){
  const start=Date.now();const r=spawnSync(process.execPath,['--require',__filename,path.join(__dirname,file)],{cwd:path.join(__dirname,'..'),env:{...process.env,CIERRE_REPRO_CHILD:'1'},encoding:'utf8',timeout:300000,maxBuffer:8*1024*1024,windowsHide:true});
  const log='cierre-'+file.replace('.cjs','.txt');fs.writeFileSync(path.join(__dirname,log),(r.stdout||'')+(r.stderr||''));
  const row={file,exit:r.status,signal:r.signal,error:r.error?.code,ms:Date.now()-start,log};result.push(row);console.log(JSON.stringify(row));
 }
 fs.writeFileSync(path.join(__dirname,'cierre-reproductores.json'),JSON.stringify(result,null,2));
 process.exitCode=result.some(r=>r.exit!==0)?1:0;
}
