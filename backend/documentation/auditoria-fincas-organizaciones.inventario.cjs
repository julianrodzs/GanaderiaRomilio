/* Inventario estático reproducible. No requiere dependencias, entorno ni DB. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['node_modules','.git','documentation','tests'].includes(e.name)?[]:walk(path.join(d,e.name))):e.name.endsWith('.js')?[path.join(d,e.name)]:[]);
const models=fs.readdirSync(path.join(root,'models')).filter(x=>x.endsWith('.js')).map(f=>{const s=fs.readFileSync(path.join(root,'models',f),'utf8');return{name:f.slice(0,-3),scope:!s.includes('.plugin(aplicarAislamientoOrganizacion')?'Global/manual':/finca:\s*true/.test(s)?'Organización + finca':'Organización',optional:/required:\s*false/.test(s)&&f==='Auditoria.js'};});
const globalNames=models.filter(x=>x.scope==='Global/manual').map(x=>x.name).join('|');
const globalQuery=new RegExp(`\\b(${globalNames}|Finca)\\.(find\\w*|countDocuments|distinct|aggregate|exists|create|insertMany|update\\w*|delete\\w*|bulkWrite)\\(`);
const explicit=/omitirAislamiento|\.collection\b|connection\.db|bulkWrite\(|\$lookup/;
const rows=[];
const info=(file,line)=>{
 if(file==='database.js')return['Log de nombre de base, no consulta','No aplica','No aplica','Informativo; no devuelve registros'];
 if(/notificacion-service/.test(file))return['Destinatarios y actor de notificación','Sí, filtro manual organización actual','Sí para destinatarios, actor por membresía','Bajo; valida finca y acceso antes de crear'];
 if(/sanidad-tarea-service/.test(file))return['Resolver responsable sanitario por membresía','Sí, explícito','Aquí no; callers deben validar asignación por finca','Endurecer referencia de responsable; no hay fuga reproducida'];
 if(/duracionGestacion/.test(file))return['Configuración de gestación de finca del registro','Sí, plugin','Derivada del registro/caller, no del modelo Finca','Bajo con caller; exigir finca autorizada al invocar'];
 if(/correoElectronico/.test(file))return['Destinatarios administradores por organización','Sí, explícito','No en este helper; correo administrativo general','No usar para correos de datos de finca; EMAIL_TEST_TO requiere control operativo'];
 if(file.startsWith('models/plugins/'))return['Implementación del aislamiento; no es un caller','Condicional','Solo contexto, no membresía','F01: cobertura parcial del contrato'];
 if(file.startsWith('scripts/')){
  const diagnostic=/diagnostico|verificar|revisarEstado/.test(file);
  return[diagnostic?'Diagnóstico operativo; alcance global deliberado':'Migración/administración operativa fuera de HTTP',/organizacionId/.test(line)?'Explícito en esta línea; revisar filtro completo':'Global o filtro en variable; sin garantía del plugin', 'No: operador de plataforma',diagnostic?'Lectura global; no exponer a tenants (revisarEstado tiene modo escritura)':'Alto impacto si se ejecuta contra DB equivocada; revisar selección y respaldo'];
 }
 if(/accesoFinca-service/.test(file))return['Resolver antes de establecer ALS','Sí, organización explícita','Sí, membresía y estado','Bajo; C06/C07'];
 if(/adminOrganizacion|auditoria-controller/.test(file))return['Vista de plataforma superadministrador','Global deliberado / IDs agrupados','No aplica a vista plataforma','Bajo si se conserva authPlataforma'];
 if(/alimentacion-service/.test(file))return['Semilla idempotente por finca vía bulkWrite','Sí, filtro y $setOnInsert','Contexto de finca autenticada','Bajo; escritura incluye ambos IDs'];
 if(/categoriaAnimal-service/.test(file))return['Recalcular categoría de IDs obtenidos por consulta aislada','Solo lectura inicial; actualización por _id','No revalida al escribir','F01: repetir org/finca en bulk; riesgo TOCTOU'];
 if(/potreroCobertura/.test(file))return['Catálogo técnico común de pastos','No: catálogo global intencional','No aplica','Bajo; semilla estática, sin datos cliente'];
 if(/archivoRoutes/.test(file))return['Resolver imagen almacenada de dron','Sí, plugin organizacional','Sí, membresía + permiso drone.ver','Bajo en endpoint local; R2 distinto (F11)'];
 if(/poblacionHistorica/.test(file))return['Reconstruir ubicación a fecha, incluso trasladados','Sí, plugin','Filtro histórico posterior por finca solicitada','F09: lectura amplia interna; no retorno bruto'];
 if(/reporteMultiFinca|consolidacionMultiFinca-controller/.test(file))return['Consolidación/historial entre fincas','Sí, plugin','Resolver de fincas o animal visible; filtrado por IDs/historia','F03/F05/F09; revisar referencias globales'];
 if(/consolidacionMultiFinca-service/.test(file))return['Comprobar identificador en finca destino','Sí, plugin','Destino resuelto por controlador','Bajo con caller autorizado'];
 if(/iatf-service|protocoloEngorde-service|protocoloPorcino-service/.test(file))return['Consolidado y documentos relacionados por IDs','Sí, plugin','Fincas resueltas en controlador; dependencias por ID','Bajo con caller; no invocar con lista vacía como autorización'];
 if(/reporte-controller/.test(file))return[line.includes('$lookup')?'Join de aplicaciones a animals':'Historia de pesajes para animales visibles',line.includes('$lookup')?'Solo raíz; lookup no tiene tenant':'Sí, plugin','IDs derivados; sin validador universal de referencias',line.includes('$lookup')?'F01: referencia corrupta puede cruzar tenant':'Bajo con referencias íntegras'];
 if(/pesaje|eventoAnimalController/.test(file))return['Historia completa de animal trasladado','Sí, plugin','Animal actual visible; historia previa por ID','Bajo; acceso histórico deliberado'];
 if(/catalogoFinanciero/.test(file))return['Catálogo de organización y conteo/renombre de sus usos','Sí, plugin','No individual: catálogo organizacional','Alcance org deliberado; solo permiso de gestión'];
 if(/animal-controller/.test(file))return['Comprobar DIIO único en organización','Sí, plugin','No necesita finca para unicidad organizacional','Bajo; no devuelve ficha de otra finca'];
 if(/plan-service/.test(file))return['Plan/consumo total organizacional','Sí: plugin o ID de organización explícito','No: cuota de toda la organización','Bajo con contexto válido; C12'];
 if(/finca-service/.test(file))return['Gestión del objeto Finca, modelo org-only','Sí, plugin o ID organización','No para finca objetivo de edición','P0 F10: header autorizado no autoriza req.params.id'];
 if(/finca-controller/.test(file))return['Lista de fincas por membresía','Sí, ID de membresía del actor','Sí al listar','Bajo en listado; F10 en mutación'];
 if(/alertasCorreo|resumenEmail/.test(file))return['Cron: enumerar organizaciones y destinatarios','Manual; ALS por organización en procesamiento','Sí, listarFincasAccesibles por destinatario','Bajo; no enviar a todos sin filtro'];
 if(/trabajoProgramado/.test(file))return['Exclusión mutua del programador global','No, bloqueo global deliberado','No aplica','Bajo; cronAuth / ejecución interna'];
 if(/facturacion/.test(file))return['Resolver cliente de pago/evento firmado','Manual por metadata/cliente/suscripción','No aplica; facturación organización','Requiere firma webhook; F07 cambio de plan sin transición'];
 if(/aprovisionamiento/.test(file))return['Crear organización desde plataforma en transacción','Explícito al crear entidades; identidad global','Administrador inicial de nueva organización','Solo plataforma; no ejecutar desde tenant'];
 if(/usuario|membresia|invitacion|auth|seguridadUsuario|bloqueoSeguridad|rateLimit/i.test(file))return['Identidad global / membresía / seguridad transversal','Manual por ID/correo/token/membresía','Según operación de identidad o membresía','Frontera explícita; auditoría Usuarios previa, no plugin automático'];
 if(/importacion|importar/i.test(file))return['Bloqueo/coordinación de importación','Clave/filtro manual según recurso','Contexto de importación autenticada','Comprobar claves org+finca; no es dato global consultable'];
 if(/apariencia/.test(file))return['Branding de organización/finca','ID del contexto + plugin en finca/archivo','Finca activa para imagen local','Bajo en metadata; F11 entrega R2'];
 return['Modelo global o Finca org-only; filtro manual en caller','Revisar filtro completo enlazado','No inherente al modelo','Revisión contextual necesaria; no acreditar aislamiento automático'];
};
for(const full of walk(root)){
 const file=path.relative(root,full).replaceAll('\\','/');
 fs.readFileSync(full,'utf8').split(/\r?\n/).forEach((line,i)=>{
  const scriptQuery=file.startsWith('scripts/')&&/\b\w+\.(find\w*|countDocuments|distinct|aggregate|exists|create|insertMany|update\w*|delete\w*|bulkWrite)\(/.test(line);
  const indirectOptions=/omitirAislamiento/.test(fs.readFileSync(full,'utf8'))&&/\.(option|setOptions)\(opciones\)/.test(line);
  if(explicit.test(line)||globalQuery.test(line)||scriptQuery||indirectOptions)rows.push({file,line:i+1,query:line.trim(),...Object.fromEntries(['reason','org','farms','risk'].map((k,n)=>[k,info(file,line)[n]]))});
 });
}
const clean=x=>x.replaceAll('|','\\|').replaceAll('`',"'");
const out=['# Inventario de excepciones y consultas de alcance manual','',
 'Anexo de AUDIT_MODULO_FINCAS_ORGANIZACIONES.md, 2026-10-23. Generado desde el árbol de trabajo. Incluye cada coincidencia de bypass, driver nativo, bulkWrite, lookup y consultas directas sobre modelos globales o Finca. Las líneas de asignación/opciones se conservan para no ocultar aliases; no todas son consultas ejecutables. No se ejecutó ningún script operativo.', '',
 'Las consultas ordinarias de modelos con plugin se cubren en la tabla de operaciones del informe. Una consulta sin tenant escrito no es una excepción si el plugin lo inyecta. Este inventario estático no demuestra ausencia de construcciones dinámicas; los aliases del driver de los scripts se revisan abajo. «Global» es una decisión de alcance, no un hallazgo automático.', '',
 '## Modelos y alcance declarado','', '| Modelo | Alcance | Nota |','|---|---|---|',...models.map(m=>`| ${m.name} | ${m.scope} | ${m.optional?'Sin ALS no filtra (auditoría plataforma)':''} |`),'',
 '## Sitios identificados','',`Total: ${rows.length} sitios.`, '',
 '| Archivo:línea | Qué consulta/opción | Por qué se omite | ¿Organización? | ¿Fincas autorizadas? | Riesgo |','|---|---|---|---|---|---|',
 ...rows.map(r=>`| [${r.file}:${r.line}](../${r.file}#L${r.line}) | ${clean(r.query)} | ${r.reason} | ${r.org} | ${r.farms} | ${r.risk} |`), '',
 '## Aliases y llamadas indirectas', '',
 '- `scripts/vincularMadresInternas.js`: `animales = mongoose.connection.collection(...)`; todas sus lecturas/escrituras son driver sin plugin. Mantenimiento global, no ruta HTTP.',
 '- `scripts/migrarCriaAReproduccion.js`: `grupo.collection` procede de cinco modelos globalmente leídos; bulkWrite aplica la normalización a todos los tenants.',
 '- `scripts/migrarSaasOrganizacion.js`: `Modelo`/`modelo` recorren modelos; filtros de legado sin tenant y posterior asignación explícita. Nunca debe ser endpoint de cliente.',
 '- `scripts/migrarFincasNotificaciones.js`: parámetro `fincas = Finca.collection`; resolución de origen por organización, fallback finca principal. Las actualizaciones nativas exigen revisión operativa.',
 '- `scripts/diagnostico-importaciones.js`: opciones de bypass guardadas en variable; alcance diagnóstico global intencional.',
 '- `services/reporteMultiFinca-service.js` y `controllers/consolidacionMultiFinca-controller.js`: `opciones` compartidas por varias agregaciones; conservan plugin de organización y usan fincas resueltas.',
 '- Métodos de documento `.save()` no tienen middleware de consulta: tanto creación explícita por plataforma como modificaciones después de lecturas aisladas dependen del caller. F01 reproduce campos de tenant ajenos aceptados.',
 '- Jobs: `trabajoProgramado-service` coordina globalmente; `alertasCorreo-service` y `resumenEmail-service` crean ALS por organización. Los workers de importación procesan datos del trabajo; no establecen una sesión multi-tenant de HTTP.'
];
fs.writeFileSync(path.join(__dirname,'auditoria-fincas-organizaciones.excepciones.md'),out.join('\n')+'\n');
console.log(JSON.stringify({sites:rows.length,models:models.length,unclassified:rows.filter(x=>x.risk.startsWith('Revisión contextual')).map(x=>x.file+':'+x.line)},null,2));
