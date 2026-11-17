# Fase 2: retencion, archivos, correo y cierre de sesion

## Alcance

Implementado sin paginacion obligatoria ni cambios a los contratos de listado de
animales, pesajes, finanzas o tareas. No cambia planes, cuotas, horarios del cron,
proveedor de correo ni credenciales. Auditoria permanece sin TTL.

## Retencion

| Coleccion | Politica | Protecciones |
| --- | --- | --- |
| Notificacion | `expiraEn`: 90 dias despues de la lectura | TTL parcial solo `leida: true`; no leidas sin vencimiento. Repetir marcado individual no extiende el plazo. Marcado masivo solo modifica las no leidas del destinatario autorizado. |
| AlertaCorreo | TTL de 120 dias desde `updatedAt` | Cada envio renueva el registro: no caduca por su fecha de creacion mientras siga utilizandose para idempotencia. |
| ImportacionExcel | `purgarEn`: 7 dias despues de `expiraEn` | `expiraEn` sigue siendo el limite para confirmar (24 h por defecto). TTL parcial solo Pendiente, Con errores, Expirada o Fallida; nunca Procesando ni confirmadas. |
| Invitacion | `purgarEn`: 30 dias despues de `expiraEn` | TTL parcial solo Pendiente, Revocada o Expirada. Las aceptadas conservan su trazabilidad. |

Al confirmar una importacion se eliminan `registros` y `errores` crudos y su
`purgarEn`; permanecen hash, usuario, estado, fechas, hojas, advertencias, resumen y
resultado agregado. La deteccion de archivo ya importado y los identificadores
de importacion siguen funcionando. Al marcar una preview como expirada tambien
se eliminan sus datos crudos. La purga posterior borra el documento temporal.

MongoDB ejecuta TTL en segundo plano: la eliminacion no es instantanea ni define
la validez de invitaciones o previews. Los endpoints siguen verificando
`expiraEn` aunque el documento todavia exista.

## Aplicacion en produccion

En produccion `autoIndex` esta desactivado por defecto. Desplegar el codigo **no
activa estos indices**. Desde `backend`, con la conexion explicita al entorno
correcto y un respaldo verificado:

```powershell
npm run retencion:check
# Revisar candidatos y vencidos; no escribe ni crea indices.
npm run retencion:apply
```

`apply` completa plazos de registros anteriores por lotes de 100, compacta las
importaciones confirmadas y crea **solo los cuatro indices TTL nuevos**. Es
idempotente; no ejecuta `syncIndexes`, no elimina indices ajenos ni borra datos
de negocio. Si hay muchos temporales vencidos, ejecutarlo fuera de horas pico:
activar TTL habilita su eliminacion automatica. El borrado por TTL es irreversible
salvo restauracion de respaldo. Los conteos de vencidos en `check` corresponden a
fechas de purga ya guardadas; los candidatos sin fecha pueden quedar elegibles
despues del backfill. No se ha ejecutado este comando contra Atlas.

API y cron deben usar la misma version del codigo; un cron antiguo podria seguir
incluyendo cuentas operativas en sus destinatarios. No es necesario crear otro
cron ni cambiar el horario de Render.

## Apariencia / R2

- El reemplazo atomico de referencia devuelve la imagen anterior realmente
  sustituida, incluso ante dos subidas concurrentes.
- Despues de guardar la nueva referencia, se verifica propiedad de organizacion,
  uso publico permitido, prefijo de clave y ausencia de referencias en logo,
  dashboard y potreros de esa organizacion.
- Una imagen reutilizada entre dashboard y potreros no se elimina hasta perder
  su ultima referencia. Reutilizar dashboard usa comparacion de referencias para
  no volver a asociar una imagen que otra peticion acaba de reemplazar.
- La eliminacion R2 es best effort: un fallo genera warning con ID/codigo, no
  revierte la nueva imagen. La metadata queda activa para revision/reintento
  operativo; tras borrado exitoso se marca inactiva.
- No se ejecuta una limpieza retroactiva masiva de objetos anteriores a este
  despliegue. No afecta fotos privadas de animales ni imagenes del dron.
- Si el cambio de referencia falla, se intenta limpiar la nueva imagen huerfana.

## Politica de correos

Las cuentas creadas con contrasena temporal y `sinAccesoCorreo: true` guardan esa
marca en Usuario. Alertas, resumenes, renovaciones y destinatarios administrativos
automaticos usan `estado: Activo` y `sinAccesoCorreo != true` al poblar usuarios.
No se infiere la marca de cuentas anteriores por tener contrasena temporal: ese
campo tambien puede corresponder a usuarios legitimos en alta asistida. Las
cuentas operativas anteriores deben revisarse explicitamente, no migrarse a ciegas.

`correo-validacion-service` utiliza `validator.isEmail`, reutilizado por Usuario
y por la entrada central a Resend. Rechaza dominios vacios, errores de sintaxis,
saltos de linea y multiples direcciones dentro de una cadena. No hace pruebas DNS
ni garantiza propiedad o existencia del buzon. La cuenta operativa sigue
necesitando un identificador con sintaxis de correo valida para iniciar sesion.

Si algun destinatario es invalido se rechaza el lote completo con
`{ enviado: false, modo: 'correo_invalido' }`: warning sin direcciones ni tokens,
cero llamadas al transporte, cero reintentos de proveedor y sin marcar envio ni
consumir cuota de correo. No se silencian fallos reales del proveedor. Las
direcciones de prueba tambien pasan por la validacion. El destinatario tecnico
`EMAIL_ADMIN` sigue siendo configuracion del operador, no un usuario de finca.

## Logout y datos del navegador

El helper `sesionLimpieza.mjs` elimina caches `ganaderiaApariencia:*` del dispositivo
y acciones `ganaderiaAccion*`, paginacion y preferencias de reportes de
`sessionStorage`. No usa `clear()` ni elimina claves de otros productos. Limpieza
de IndexedDB y confirmacion antes de descartar cambios pendientes se conservan.

El evento nativo `storage` notifica a otras pestanas del mismo origen al eliminar
`ganaderiaSesion` o limpiar localStorage. Cada pestana desmonta la sesion, limpia
sus acciones y caches y elimina datos offline del usuario saliente. No se repite
una eliminacion de la sesion compartida desde cada pestana; un evento viejo no
desconecta una nueva sesion iniciada entretanto.

`ganaderiaSesionLimpiada` invalida la cache de blobs y AparienciaContext en la misma
pestana. El contexto de apariencia invalida peticiones en vuelo por generacion y
sesion, tambien al desmontarse: una respuesta tardia nunca vuelve a escribir
apariencia despues del logout. Se conserva la lectura de apariencia offline de
una sesion valida.

## Invitacion publica

`GET /api/invitaciones/contexto`: limite distribuido por IP de 30 solicitudes en
15 minutos, independiente de login y aceptacion. Usa RateLimitSeguridad existente
(TTL propio), devuelve 429 y Retry-After al agotar el limite antes de consultar
Invitacion. Ante fallo del almacen del limitador, mantiene el 503 fail-closed.

## Verificacion

Resultado local: **560/560** pruebas backend y **130/130** frontend; build Vite/PWA
correcto. Regresion en Edge de cache privada, ETag, cambio de finca, revocacion y
polling tambien correcta. `git diff --check` sin errores de whitespace.

- `backend/tests/higiene-fase2-integracion.test.js`: replica set efimero en
  loopback, TTL real acelerado solo en el servidor de pruebas; marcado,
  aislamiento, migracion de retencion, confirmacion HTTP, R2 simulado, exclusion
  de correo en los tres motores, sintaxis, persistencia de cuenta operativa y
  rate limit HTTP. No usa .env, Atlas, Resend ni R2 reales.
- `frontend/tests/sesionLimpieza.test.mjs`: limpieza selectiva, storage entre
  contextos, eventos viejos, almacen bloqueado, provider real compilado con hooks
  controlados, respuestas tardias, cache offline y desmontaje.
- La fixture de downgrade en suscripciones se mantiene vigente relativamente a
  la ejecucion para no confundir cambio de plan con su antigua fecha vencida.

Fuentes tecnicas:
- [TTL de MongoDB, comportamiento y precauciones](https://www.mongodb.com/docs/manual/core/index-ttl/).
- [validator.js, validacion isEmail](https://github.com/validatorjs/validator.js).
