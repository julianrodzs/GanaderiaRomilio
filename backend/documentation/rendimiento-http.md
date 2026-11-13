# Rendimiento HTTP y consumo de ancho de banda

Fecha: 2026-11-13. Alcance: revision de timers, efectos, respuestas frecuentes,
compresion y revalidacion HTTP. No se consultaron datos ni logs de produccion.

## Diagnostico

Las capturas muestran 15 MB mensuales para el Static Site y 4,67 GB para el backend.
El frontend sirve los archivos de la interfaz; las respuestas JSON de la API se
contabilizan en el backend, aunque las solicite esa interfaz. Por eso las cifras
no tienen por que coincidir. CPU casi inactiva y memoria estable no indican
saturacion durante ese intervalo.

Hallazgos comprobados en el codigo anterior:

| Componente | Antes | Ahora |
| --- | --- | --- |
| Campana | Cada 45 s: `GET /api/notificaciones?limit=8` y `GET /api/notificaciones/no-leidas/count`, incluso oculta | Cada 120 s solo el contador; lista al abrirla y mientras permanezca abierta |
| Retorno a la ventana | Campana por focus; plan por focus y visibility sin coordinar | Comprobacion de visibilidad/red; peticiones en curso compartidas; antiguedad minima |
| PlanContext | Recreaba `tieneFeature` y `puedeUsarEspecie` en cada cambio de estado; cargando podia desmontar FeatureGate | Referencias estables hasta cambiar las capacidades reales; refresco con datos previos no desmonta los modulos |
| Dashboard | Dependia de `tieneFeature`: un refresco del plan podia repetir sus 7-10 consultas | No recarga por un refresco identico ni por cambios de cuotas; carga solo estando en Dashboard y con plan consultado |
| Inventario para dashboard | Ficha completa con padres, foto, potrero y enriquecimiento sanitario | `GET /api/animales?vista=dashboard`: ID, estado, especie, sexo, nacimiento y categoria |
| Cola offline | Revision cada 60 s y al recuperar red; NO descargaba toda la base | Revision cada 120 s visible y online; reconexion inmediata visible; conserva reintentos y sincronizacion manual |
| JSON frecuente | Fetch `no-store`; sin middleware compression | Revalidacion `no-cache`, ETag y compresion negociada desde 1.024 bytes |

La campana hacia aproximadamente 160 peticiones/hora por pestana, sin contar
focus y acciones. Ahora son aproximadamente 30/hora visible con campana cerrada,
y cero consultas periodicas ocultas. Al ocultar no se inician nuevas peticiones;
las que ya estaban en curso pueden terminar. El navegador puede espaciar timers,
por lo que estas son frecuencias nominales, no una reconstruccion de Render.

Este polling explica un mecanismo real compatible con el consumo nocturno.
NO permite atribuir exactamente los 0,6 MB/h ni los 4,67 GB historicos: faltan
logs por ruta, tamanos, cantidad de pestanas y desglose de trafico. Los 0,6 MB/h
constantes durante 30 dias sumarian unos 432 MB, no 4,67 GB. Las cargas activas,
exportaciones, respuestas voluminosas o trafico iniciado por el servicio requieren
medicion adicional; no se han presentado esas posibilidades como causas probadas.

## Lo que no era una fuga

- App revisa cada 60 s la expiracion del JWT localmente: no llama a la API.
- Tareas tiene un debounce de busqueda, no polling recurrente.
- Otros timeouts revocan URLs de archivos o desplazan el scroll, sin red.
- El service worker precarga recursos del frontend. No tiene runtimeCaching de
  la API ni un timer de descarga del inventario.
- Inventario y tareas guardan en IndexedDB las cargas que el usuario consulta.
  El sincronizador envia solo operaciones pendientes y mantiene su backoff.
- Animal guarda referencias a ArchivoMultimedia, no Base64. Finca guarda
  referencias para sus imagenes. No se encontraron fotos Base64 en estos modelos.
- El perfil se consulta al validar la sesion, no cada minuto. No se recortaron
  datos necesarios de membresia, fincas ni permisos.
- El centro de notificaciones ya pagina; la campana ahora solicita `resumen=true`,
  que conserva titulo, mensaje, lectura y navegacion, sin actor ni metadata.

## Compresion y cache segura

`middleware/rendimientoHttp.js` se instala antes de las rutas. Compression aplica
gzip/deflate/Brotli segun Accept-Encoding y tipos MIME; no recomprime imagenes
ya comprimidas ni respuestas menores al umbral conocido. Respeta no-transform.

Express mantiene ETag debil. Animales, pesajes, potreros, notificaciones, plan/actual
y usuarios/perfil usan `Cache-Control: private, no-cache` y `Vary: Authorization,
X-Finca-Id` (ademas de las variaciones CORS y de compresion). Fetch usa `no-cache`
para estas lecturas: el navegador valida SIEMPRE con el backend y reconstruye el
JSON cuando recibe 304. No se usa un cache compartido de respuestas autenticadas.

Autenticacion, vigencia, rol y aislamiento siguen ejecutandose ANTES de decidir
el 304. Los errores JSON pasan a no-store. Una revocacion devuelve 401/403, nunca
datos autorizados previamente. Las pruebas incluyen cambio de finca y usuario
inactivo. ETag reduce transferencia, no evita por si solo las consultas a MongoDB.
Por eso se corrigieron tambien los disparadores de peticiones.

## Mediciones reproducibles, no datos de produccion

| Respuesta de prueba | Antes, JSON sin comprimir | Despues |
| --- | ---: | ---: |
| Inventario completo sintetico de 120 animales | 108.491 bytes | 3.237 bytes gzip |
| Datos de esos animales para Dashboard | 108.491 bytes | 594 bytes gzip, proyeccion reducida |
| Notificacion sintetica con metadata de 12.000 caracteres, HTTP + Mongo real local | 12.666 bytes | 332 bytes JSON de resumen |
| Lectura repetida con ETag coincidente | Cuerpo completo en cada descarga | 0 bytes de cuerpo, HTTP 304 |
| Campana cerrada en segundo plano | 80 listas y 80 contadores/hora nominal | 0 solicitudes periodicas |

Los fixtures son sinteticos y sus campos estan definidos en los tests. No son
los tamanos de la finca principal. El ejemplo de notificacion prueba una metadata
voluminosa deliberada; no afirma que todas las notificaciones pesen 12 KB.
Un 304 conserva cabeceras, por lo que no significa cero bytes de trafico total.
Render tambien admite compresion Brotli en su infraestructura: no se debe asumir
que toda respuesta anterior de produccion viajaba sin comprimir ni extrapolar
el ahorro local como porcentaje de la factura.

## Despliegue y comprobacion en Render

1. Desplegar backend con package.json y package-lock.json; instalar dependencias
   normalmente. Desplegar tambien el frontend. No requiere migracion ni indices.
2. Recargar la app para recibir el JavaScript nuevo. Las pestanas con la version
   anterior pueden seguir consultando hasta recargarse/cerrarse.
3. En DevTools > Network, observar notificaciones: solo count cada dos minutos
   con la campana cerrada. Al ocultar la pestana deben cesar sus peticiones.
4. Comprobar Content-Encoding en respuestas grandes y 304 al repetir una lectura
   sin cambios. Una mutacion debe entregar la nueva representacion con 200.
5. Si se necesita atribuir el consumo, agregar temporalmente en el backend de
   Render `PERFORMANCE_HTTP_LOGS=true`. No es una variable requerida para operar.
6. Observar un periodo comparable de 24-48 h y despues quitar esa variable o
   ponerla en false. No requiere pagar otro servicio ni modificar el cron.

Ejemplo de registro opt-in:

```json
{"tipo":"http-performance","metodo":"GET","ruta":"/api/animales/","estado":200,"bytesBody":3237,"codificacion":"gzip","duracionMs":35}
```

El logger mide cuerpos escritos por Node despues de compression, no cabeceras,
TLS, preflights respondidos antes del middleware, ni trafico saliente hacia
MongoDB/R2/Resend. El proxy de Render puede transformar el transporte. Sumar por
ruta bytesBody y cantidad permite localizar respuestas repetidas; no sustituye
la facturacion de Render. Usa plantillas de rutas: omite IDs, query, JWT, correos,
cabeceras y cuerpos de clientes. Esta desactivado por defecto.

## Verificacion

- Backend: `npm test`: 531 pruebas aprobadas, incluyendo HTTP, compresion,
  integracion Mongo local, ETag, revocacion y resumen de notificaciones.
- Frontend: `npm test`: 103 pruebas aprobadas, incluyendo ocho horas simuladas
  ocultas, desconexion/reconexion y exclusividad de peticion.
- Frontend: `npm run build`: compilacion de produccion y PWA correctas.
- `node frontend/tests/rendimiento.navegador.mjs`: Edge real con React, Express y
  API sintetica loopback. Comprueba 304, datos nuevos tras mutacion, cambio de
  finca sin filtracion, revocacion 401, plan sin recarga del consumidor y lista
  de campana bajo demanda. La visibilidad se simula mediante eventos; el paso
  del tiempo largo se comprueba con reloj virtual en las pruebas unitarias.
- En Windows las integraciones aceptan `CIERRE_MONGOD` apuntando a un mongod
  local portatil. No se utiliza MONGODB_URI ni Atlas para estas pruebas.

Referencias oficiales:

- [Compression de Express](https://expressjs.com/en/resources/middleware/compression/)
- [ETag en Express](https://expressjs.com/en/4x/api.html#app.settings.table)
- [Metricas de Render](https://render.com/docs/service-metrics)
- [Ancho de banda saliente de Render](https://render.com/docs/outbound-bandwidth)
- [Capacidades de Web Services](https://render.com/docs/web-services)
