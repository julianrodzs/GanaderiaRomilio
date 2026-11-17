# Fase 1: Fotos Privadas y Memoria

Fecha: 2026-11-14. Optimizaciones transparentes para los listados actuales y el
modo offline. No se modificaron datos de produccion, credenciales ni Render.

## Fotos privadas

- `frontend/src/services/archivoProtegidoCache.mjs`: LRU de sesion con maximo de
  150 entradas Y 50 MiB (52.428.800 bytes). La primera cota alcanzada expulsa la
  entrada menos usada. Clave: token, organizacion, finca, usuario y ruta.
- Dos solicitudes simultaneas comparten la promesa y el mismo blob. Miniatura
  y visor comparten un objectURL; desmontar un componente no elimina la foto.
- Se revocan objectURLs al expulsar, invalidar o limpiar. Cambiar finca u
  organizacion, cerrar/expirar sesion y guardar/eliminar foto limpian la cache.
  Tambien se atienden cambios de sesion desde otra pestana mediante storage.
- Caducidad de cinco minutos al volver a consultar: despues se revalida contra
  el backend. No hay timers de descarga ni persistencia adicional en IndexedDB.
  Un archivo mayor al limite no entra en LRU y se libera tras su ultimo consumidor.
- Los errores no se cachean. Un 404 invalida la imagen afectada; 401/403 limpian
  los recursos privados. Una respuesta tardia de otra sesion/finca se descarta.
- `api.js` mantiene el retorno Blob de obtenerArchivoProtegido. Solo las rutas
  de archivos protegidos se reutilizan en memoria. Excel/PDF siguen con no-store
  y se vuelven a generar, evitando exportaciones antiguas.

`backend/routes/archivoRoutes.js` calcula ETag SHA-256 con ID, updatedAt, clave y
tamano del ArchivoMultimedia. Primero autentica y consulta el archivo activo en
su organizacion y las fincas autorizadas. Despues evalua req.fresh, que interpreta
If-None-Match y sus variantes debiles/listas. Un 304 sale ANTES de llamar a R2.
Las respuestas son private, no-cache y varian por Authorization y X-Finca-Id.
No se convierte una foto privada en URL publica ni se omiten controles de acceso.

## Lecturas Sin Hidratacion

Pesajes, historial por animal, finanzas, tareas/mis tareas y notificaciones usan
lean(). `lecturaLean-service.js` aplica defaults publicos sin hidratar documentos,
respeta selecciones de populate y omite campos select:false. Se conserva tambien
la normalizacion legacy de tipoPesaje Individual/Lote/Importacion a REGULAR con
su origen correspondiente, que antes ejecutaba un hook de hidratacion.

Compatibilidad prioritaria: /api/animales, /api/pesajes, /api/finanzas y /api/tareas
siguen entregando sus arrays completos. No se cambia el formato de IndexedDB ni
se exige paginacion. Las fichas publicas anidadas de animal/potrero se conservan:
recortarlas a nombre/DIIO alteraria el contrato existente. Se excluye explicitamente
el seguimiento interno hitosPesaje y las proyecciones minimas se aplican a las
consultas internas que no constituyen la respuesta publica. Este bloque reduce
objetos en Node, no promete reducir por si solo los bytes JSON de cada listado.

## Reportes y Alertas

- Finanzas de cria: el acumulado historico recorre egresos con cursor de 100 y
  una proyeccion de seis campos. Conserva el predicado de inversion, conversion
  de moneda y suma JS original. No mantiene todos los historicos ni una segunda
  copia completa del periodo en RAM; del periodo obtiene solo los campos usados.
  Se eligio cursor/proyeccion para no reescribir reglas financieras en Mongo ni
  alterar el orden de la suma numerica. Historico conserva su alcance anterior,
  no se introduce un nuevo corte de fecha ni una nueva regla contable.
- Crecimiento: Mongo agrupa el ultimo pesaje por animal, con match, proyeccion,
  sort y group/first. Node recibe una fila por animal en vez de todo el historico.
  Conserva tipo, especie, organizacion y la consulta historica entre fincas del
  mismo animal. El detalle y evolucion del periodo se conservan completos.
- Alertas: Mongo filtra pendientes vencidas o con objetivo hasta siete dias,
  priorizando fechaLimite sobre fechaProgramada y conservando fechas civiles UTC
  frente a instantes en la zona de la organizacion. Las asignaciones futuras
  siguen reconciliandose por cursor minimo: no se pierden sus notificaciones,
  pero ya no se acumulan todas las tareas futuras en un array.

Se compararon contratos con consultas hidratadas anteriores sobre los mismos
datos MongoDB, y el resultado de crecimiento con la seleccion JS anterior.
Se incluyeron defaults ausentes, pesos legacy, campos privados, monedas,
aislamiento de fincas, historico fuera de periodo, fechas civiles y tres zonas.

## Trabajos Pesados

Un limitador compartido POR PROCESO cubre plantilla, preview y confirmacion de
importacion Excel, exportacion de pesajes y exportaciones de consolidado/cierres.
Adquiere el permiso antes de multer: las subidas en espera no se convierten aun
en buffers. Mantiene cupo hasta completar el controlador y la respuesta, incluso
si el cliente se desconecta durante un trabajo que sigue ejecutandose.

| Variable opcional del backend | Predeterminado |
| --- | --- |
| MAX_CONCURRENT_HEAVY_JOBS | 2 |
| HEAVY_JOB_QUEUE_TIMEOUT_MS | 15000 |
| MAX_QUEUED_HEAVY_JOBS | 20 |

Una cola llena o vencida responde 429 con codigo HEAVY_JOBS_BUSY, Retry-After y
mensaje claro. El plazo se verifica tambien al otorgar cupo, aunque el event loop
haya demorado el timer. Solicitudes en espera desconectadas se retiran. El permiso
se libera en finally ante exito, error o cancelacion del procesamiento.

No se requiere configurar variables para usar los defaults. No es una cola
distribuida: dos instancias tienen limites separados. Este control reduce picos,
pero no garantiza que cualquier archivo consuma menos de 512 MB; siguen vigentes
los limites de tamano/filas y validaciones de importaciones y exportaciones.

## Mediciones y Verificacion

Muestras locales sinteticas, NO mediciones ni facturas de produccion:

| Caso | Antes | Ahora |
| --- | --- | --- |
| Abrir/remontar repetidamente una foto de 5.347 bytes | Nueva descarga por montaje | Una descarga compartida; remontajes reutilizan memoria |
| Revalidar foto sin cambios | Lectura y stream R2 | 304, cero cuerpo y cero llamadas R2 |
| Pesaje sintetico sin populate, serializacion V8 | Documento hidratado: 564 bytes | POJO con defaults: 181 bytes; mismo JSON |
| Ultimos pesajes globales | Una fila por pesaje historico | Una fila por animal |
| Inversion historica | Todos los documentos simultaneamente | Cursor de 100 con seis campos |
| Tres archivos simultaneos, limite 2 | Sin cupo global compartido | Dos ejecutan, tercero espera; 429 si vence |

El dato V8 mide representacion serializada, no RSS ni RAM total de Render. Un 304
todavia transmite cabeceras. No se atribuyen los GB historicos a estas muestras.

- Backend npm test: 550 aprobadas, incluyendo 13 pruebas nuevas de esta fase.
- Frontend npm test: 125 aprobadas, incluyendo 14 pruebas nuevas de esta fase.
- Frontend npm run build: correcto, incluida generacion del service worker.
- Edge real: imagen renderizada, dos componentes comparten descarga/objectURL,
  desmontaje/remontaje no descarga, invalidacion revalida 304 sin stream, cambio
  de finca valida de nuevo y revocacion conserva el rechazo 401.
- No se usaron Atlas, fotos privadas reales ni envios de correo. R2 y Resend
  estan simulados en pruebas; MongoDB es temporal y enlazado solo a loopback.

## Despliegue

Desplegar API, frontend y servicio cron con el mismo commit. No requiere migracion,
indices nuevos, cambios al bucket R2 ni otro servicio de Render. Recargar pestanas
anteriores para obtener el JavaScript nuevo. Mantener el cron ya configurado.
Revisar durante 24-48 horas metrica HTTP, memoria y logs opt-in de la fase anterior
antes de cuantificar ahorro real o elevar concurrencia por encima de dos.

Referencias:
[Mongoose lean](https://mongoosejs.com/docs/8.x/docs/tutorials/lean.html),
[Express req.fresh](https://expressjs.com/en/4x/api.html#req.fresh).
