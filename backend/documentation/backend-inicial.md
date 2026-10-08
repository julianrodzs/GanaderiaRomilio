# Documentacion tecnica actual - Backend GanaderiaRomilio

La arquitectura comercial de planes, limites y capacidades se documenta en `planes-saas.md`.

Los indices ICP e IEE y la configuracion de metas productivas se documentan en `indices-productivos.md`.

Las campañas y protocolos IATF se documentan en `iatf.md`.

Este documento describe el estado actual del backend Node/Express de GanaderiaRomilio.

Aunque el archivo conserva el nombre `backend-inicial.md`, el contenido corresponde al backend actual.

## Stack backend

- Node.js
- Express
- MongoDB Atlas
- Mongoose
- bcrypt
- multer
- xlsx
- Resend por HTTP API

## Archivos principales

```txt
backend/
  app.js
  index.js
  database.js
  controllers/
  middleware/
  models/
  routes/
  services/
  documentation/
```

## Arranque

```bash
cd backend
npm install
npm run dev
```

Produccion:

```bash
npm start
```

Puerto por defecto:

```txt
4000
```

## Variables de entorno

Ver `backend/.env.example`.

Variables principales:

```env
PORT=4000
MONGODB_URI=
FRONTEND_URL=
JWT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_PASSWORD_RESET_FROM=
EMAIL_ADMIN=
EMAIL_TEST_TO=
EMAIL_ALERTS_ENABLED=true
EMAIL_ALERTS_INTERVAL_MS=
IA_SERVICE_URL=
```

Notas:

- `FRONTEND_URL` se usa para CORS y enlaces de recuperacion.
- `JWT_SECRET` firma tokens de login.
- `RESEND_API_KEY` habilita envio real de correos.
- `EMAIL_TEST_TO` fuerza todos los correos a un unico destinatario de prueba.

## Seguridad

### Autenticacion

Middleware:

```txt
backend/middleware/auth.js
```

Exporta:

- `auth`
- `autorizarRoles(...roles)`
- `autorizarPermiso(permiso)`
- `generarToken`

El login usa JWT. La recuperacion de contrasena no usa JWT.

Validacion de sesion:

- Cada request autenticado valida la firma y expiracion del JWT.
- Luego consulta el usuario en base de datos.
- Si el usuario no existe, se rechaza la sesion.
- Si el usuario esta `Inactivo`, se rechaza la sesion aunque el token aun no haya vencido.
- El rol efectivo se toma desde la base de datos, no desde el rol guardado originalmente en el token.

### Roles

Roles actuales:

- `Administrador`
- `Encargado`
- `Trabajador`
- `Veterinario`
- `Contador`
- `Consulta`

Reglas generales:

- Administrador tiene acceso completo.
- Encargado gestiona la operacion diaria, pero no usuarios, importaciones, finanzas ni reportes financieros.
- Trabajador trabaja principalmente con tareas asignadas y consulta informacion basica de campo.
- Veterinario gestiona sanidad, reproduccion y pesajes, sin acceso financiero.
- Contador gestiona finanzas y consulta compras, ventas y reportes.
- Consulta es un rol de lectura/auditoria.

Fuente tecnica:

```txt
backend/config/permisosRoles.js
frontend/src/constants/permisosRoles.js
```

Tabla de permisos base:

| Modulo | Administrador | Encargado | Trabajador | Veterinario | Contador | Consulta |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Total | No | No | No | No | No |
| Tareas | Total | Total | Asignadas | Asignadas | Asignadas | Asignadas |
| Importar | Total | No | No | No | No | No |
| Inventario | Total | Crear/editar | Lectura | Lectura | No | Lectura |
| Pesajes | Total | Crear/editar | No | Crear/editar | No | Lectura |
| Potreros | Total | Crear/editar | Lectura | No | No | Lectura |
| Sanidad | Total | Crear/editar | No | Crear/editar | No | Lectura |
| Reproduccion | Total | Crear/editar | No | Crear/editar | No | Lectura |
| Compras | Total | Crear/editar/anular | No | No | Lectura | Lectura |
| Ventas | Total | Crear/editar/anular | No | No | Lectura | Lectura |
| Finanzas | Total | No | No | No | Crear/editar | No |
| Catalogos financieros | Total | No | No | No | No | No |
| Reportes | Total | No | No | No | Lectura | Lectura |
| Drone | Total | Operar/ver | No | No | No | No |
| Usuarios | Total | No | No | No | No | No |

Notas:

- El backend protege por permiso aunque el frontend oculte botones.
- En compras y ventas, `Contador` y `Consulta` pueden ver, pero no crear, editar, anular ni eliminar.
- En tareas, Trabajador, Veterinario y Contador pueden consultar y completar tareas asignadas. Consulta es estrictamente de solo lectura.
- Eliminar datos sensibles queda mas restringido que editar: en pesajes, sanidad, reproduccion, compras, ventas y drone solo `Administrador` elimina.
- `Consulta` no entra al modulo Finanzas, pero puede consumir resumenes financieros incluidos dentro de Reportes.

### Auditoria global

Modelo:

```txt
backend/models/Auditoria.js
```

Middleware:

```txt
backend/middleware/auditoria.js
```

La auditoria registra automaticamente requests de cambio:

- `POST`
- `PUT`
- `PATCH`
- `DELETE`

Campos principales:

- usuario, correo y rol.
- accion, modulo, metodo y ruta.
- recurso afectado cuando existe `:id`.
- estado: `Exitoso`, `Fallido` o `Denegado`.
- codigo de respuesta.
- IP y user agent.
- datos sanitizados de `body` y `query`.

Los campos sensibles se reemplazan por `[protegido]`, por ejemplo:

- `contrasena`
- `password`
- `token`
- `authorization`
- `resetPasswordToken`

Vista en frontend:

```txt
Usuarios > Auditoria
```

Solo `Administrador` puede consultar auditoria.

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/auditoria` | Lista eventos de auditoria |
| GET | `/api/auditoria/:id` | Detalle de evento |

Filtros disponibles:

- `fechaInicio`
- `fechaFin`
- `usuario`
- `modulo`
- `accion`
- `estado`
- `limite`

### Rate limit

Middleware:

```txt
backend/middleware/rateLimit.js
```

Reglas actuales:

| Flujo | Ventana | Maximo |
| --- | --- | --- |
| Login | 15 minutos | 5 intentos por IP/correo |
| Recuperacion/restablecimiento | 30 minutos | 3 solicitudes por IP/correo |

Si se supera el limite, el backend responde `429` con `Retry-After`.

### Recuperacion de contrasena

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| POST | `/api/auth/forgot-password` | Solicita enlace temporal |
| POST | `/api/auth/reset-password` | Actualiza contrasena usando token |

Flujo:

1. Usuario solicita recuperacion con correo.
2. Se responde siempre el mismo mensaje, exista o no el correo.
3. Si existe, se genera token con `crypto.randomBytes`.
4. Se guarda `sha256(token)` en `resetPasswordToken`.
5. Se guarda expiracion en `resetPasswordExpires`.
6. Se envia enlace `FRONTEND_URL/restablecer-contrasena/TOKEN`.
7. Al usar el token se encripta la contrasena con bcrypt.
8. El token se elimina.

Campos en `Usuario`:

- `resetPasswordToken`
- `resetPasswordExpires`
- `resetPasswordRequestedAt`
- `resetPasswordRequestIp`

## Rutas principales

### Auth

Base:

```txt
/api/auth
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| POST | `/forgot-password` | Solicita recuperacion |
| POST | `/reset-password` | Restablece contrasena |

### Usuarios

Base:

```txt
/api/usuarios
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| POST | `/login` | Login JWT |
| GET | `/perfil` | Perfil del usuario autenticado |
| GET | `/` | Lista usuarios |
| POST | `/` | Crea usuario |
| GET | `/:id` | Obtiene usuario |
| PUT | `/:id` | Actualiza usuario |
| PATCH | `/:id/estado` | Activa/Inactiva usuario |
| DELETE | `/:id` | Elimina usuario |

Las rutas administrativas de usuarios requieren rol `Administrador`.

### Auditoria

Base:

```txt
/api/auditoria
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista eventos de auditoria |
| GET | `/:id` | Detalle de evento |

Requiere rol `Administrador`.

### Animales

Base:

```txt
/api/animales
```

CRUD completo:

- `GET /`
- `POST /`
- `GET /:id`
- `PUT /:id`
- `DELETE /:id`

Campos relevantes:

- `especie`
- `identificadorFinca`
- `diio`
- `nombre`
- `sexo`
- `raza`
- `madreDiio`
- `padreDiio`
- `fechaNacimiento`
- `fechaDestete`
- `pesoNacimiento`
- `pesoDestete`
- `pesoActual`
- `pesoCompra`
- `pesoVenta`
- `precioCompraPorKg`
- `precioVentaPorKg`
- `montoCompra`
- `montoVenta`
- `fechaCompra`
- `fechaVenta`
- `fechaMuerte`
- `estado`
- `estadoSanitario`
- `potreroActual`

Estados:

- `Activo`
- `Vendido`
- `Muerto`

Estados sanitarios:

- `Sano`
- `En observación`
- `Enfermo`
- `Recuperación`

`estado` describe la situación administrativa en inventario. `estadoSanitario` describe la condición de salud. La existencia de tratamiento activo se consulta en `TratamientoSanitario` y no se duplica como booleano persistido en `Animal`.

Especies:

- `Bovino`
- `Porcino`

La mayoria de endpoints de animales aceptan filtro:

```txt
GET /api/animales?especie=Bovino
GET /api/animales?especie=Porcino
GET /api/animales?estadoSanitario=Enfermo
GET /api/animales?conTratamientoActivo=true
```

Cambios sanitarios con bitácora:

```txt
PATCH /api/animales/:id/estado-sanitario
PATCH /api/animales/estado-sanitario
```

Ambas rutas requieren `estadoSanitario` y `motivo`. La ruta por lote también recibe `animales`. Toda actualización pasa por `estadoSanitario-service.js`, no modifica el estado general y crea un `EventoAnimal` por cambio real.

### Eventos de animal

Base:

```txt
/api/eventos-animal
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/animal/:animalId` | Historial de un animal |
| POST | `/` | Crea evento manual |
| PUT | `/:id` | Actualiza evento |
| DELETE | `/:id` | Elimina evento |

Modelo: `EventoAnimal`.

Tipos:

- Nacimiento
- Compra
- Venta
- Muerte
- Cambio de potrero
- Pesaje
- Sanidad
- Tratamiento
- Parto
- Destete
- Monta
- Diagnostico de gestacion
- Observacion

Origenes permitidos:

- `Inventario`
- `Potreros`
- `Pesajes`
- `Sanidad`
- `Reproduccion`
- `Finanzas`
- `Compras`
- `Ventas`
- `Camadas`
- `Tareas`
- `Manual`

Reglas actuales:

- La bitacora de animal se usa para animales individuales, bovinos o porcinos.
- Compra individual crea evento `Compra`.
- Venta individual crea evento `Venta`.
- Pesaje crea evento `Pesaje`.
- Registro reproductivo crea evento segun el caso: monta, parto, destete o diagnostico.
- Plan sanitario solo crea evento cuando se registra una aplicacion real, no cuando solo se programa el plan.
- Observaciones manuales se crean desde el detalle del animal.

### Eventos de camada

Base:

```txt
/api/eventos-camada
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/camada/:camadaId` | Historial de una camada |
| POST | `/` | Crea evento manual de camada |
| PUT | `/:id` | Actualiza evento |
| DELETE | `/:id` | Elimina evento |

Modelo: `EventoCamada`.

Tipos:

- Camada registrada
- Nacimiento
- Sanidad
- Tratamiento
- Destete
- Monta
- Venta
- Sacrificio
- Mortalidad
- Cambio de destino
- Cierre
- Cancelacion
- Observacion

Uso:

- La camada tiene bitacora propia porque muchas crias porcinas no estan individualizadas con DIIO.
- Registrar una camada crea evento en la madre y evento en la camada.
- Registrar destete real crea evento `Destete` en la camada.
- Cambiar destino de camada crea evento `Cambio de destino`.
- Cerrar o cancelar camada crea evento de cierre/cancelacion.
- Una venta agrupada por camada crea evento `Venta` en la camada.
- Las ventas por camada no crean eventos por animal, porque esas crias aun no existen como animales individuales.

### Potreros

Base:

```txt
/api/potreros
```

CRUD completo.

Campos:

- `codigo`
- `nombre`
- `area`
- `capacidadMaxima`
- `ubicacion`
- `ultimaAplicacionHerbicida`
- `ultimaChapia`
- `ultimaFertilizacion`
- `estado`
- `observaciones`
- `pastoPrincipal` (`CatalogoPasto`)
- `pastosSecundarios` (`CatalogoPasto[]`)
- `leguminosasAsociadas` (`CatalogoPasto[]`)
- `fechaEstablecimientoPasto`
- `diasDescansoObjetivo`
- `observacionCobertura`
- `descripcionCobertura` para importaciones pendientes de catalogar

`CatalogoPasto` es un catalogo central, no una lista del frontend. Separa `Pasto` de `Leguminosa/Forraje` y conserva nombre comun, nombre cientifico, especie base y cultivar. El comando idempotente `npm run seed:pastos` inicializa 34 pastos y 6 leguminosas/forrajes.

Cada cambio crea `HistorialCoberturaPotrero`. El periodo vigente tiene `fechaFin = null`; al cambiar, el anterior termina el dia previo al inicio del nuevo. Las modificaciones se centralizan en `potreroCobertura-service.js`; el CRUD normal de Potrero ignora campos de cobertura para impedir saltos de historial.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/pastos` | Catalogo activo; acepta `categoria` y `buscar` |
| GET | `/api/potreros/:id/cobertura` | Cobertura vigente e historial |
| POST | `/api/potreros/:id/cobertura` | Registra cobertura inicial |
| PUT | `/api/potreros/:id/cobertura` | Cierra la vigente y registra el cambio |

Estados:

- `Disponible`
- `Ocupado`
- `Descanso`
- `Mantenimiento`

### Rotaciones

Base:

```txt
/api/rotaciones
```

CRUD para movimientos de potrero.

Guarda:

- potrero.
- lote.
- fechaEntrada.
- fechaSalida.
- estado.
- observaciones.

Se usa para medir ocupacion y descanso.

Reglas de estado de potrero:

- Rotacion activa pone el potrero en `Ocupado`.
- Rotacion finalizada pone el potrero en `Descanso`.
- Rotaciones viejas quedan como historial.
- Solo se permite una rotacion activa por potrero.
- Si el potrero esta en `Mantenimiento`, ese estado tiene prioridad.

#### Rendimiento calculado

`RotacionPotrero` es la unica fuente para las metricas de rendimiento. `Potrero` no almacena dias ocupados, animal-dias, porcentajes ni promedios.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/potreros/rendimiento` | Comparativo de todos los potreros |
| GET | `/api/potreros/:id/rendimiento` | Rendimiento e historico mensual individual |
| GET | `/api/reportes/potreros/rendimiento` | Alias del comparativo para Reportes |
| GET | `/api/reportes/potreros/por-pasto` | Rendimiento historico por pasto o especie base |

Ambas rutas aceptan `fechaInicio` y `fechaFin` en formato `AAAA-MM-DD`; sin parametros usan el mes actual.

`potreroRendimiento-service.js` centraliza:

- recorte de rotaciones al periodo consultado.
- tratamiento de rotaciones activas, finalizadas y planificadas.
- minimo de un dia para rotaciones reales del mismo dia.
- tiempo ocupado, promedios, densidad de animales por hectarea durante el pastoreo, animal-dias y animal-dias por hectarea.
- descansos historicos y descanso actual.
- agrupacion mensual y comparativo por potrero.
- resolucion de la cobertura vigente durante cada tramo de una rotacion.
- compatibilidad con potreros legados: la cobertura actual se usa si no existe ningun historial; cuando existe, la primera cobertura puede comenzar en `fechaEstablecimientoPasto`, incluso si esa fecha se corrigió en una entrada posterior consecutiva del mismo pasto.
- agrupacion por cultivar o `especieBase`, con comparaciones entre potreros de la misma cobertura.
- descanso real, objetivo y diferencia.

El reporte por pasto acepta `agruparPor=pasto|especieBase`. Reporta hechos observados; no atribuye causalidad al pasto ni usa GMD como conclusion forrajera.

### Plan Sanitario

Base:

```txt
/api/plan-sanitario
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista planes |
| POST | `/` | Crea plan |
| GET | `/alertas` | Vencidos y proximos |
| PUT | `/:id` | Actualiza plan |
| DELETE | `/:id` | Elimina plan |
| PATCH | `/:id/registrar-aplicacion` | Registra una aplicacion real |
| PATCH | `/:id/marcar-aplicado` | Alias compatible de registrar aplicacion |

Modelo: `PlanSanitario`.

Calcula:

- `proximaAplicacion`
- estado sanitario segun fecha:
  - vencido.
  - proximo.
  - vigente.

Puede aplicar por grupo o con animales especificos opcionales, salvo `Todo el ganado`.

#### Flujo recomendado de aplicacion sanitaria

El plan sanitario es recurrente y no debe quedar congelado como `Aplicado`.

Flujo:

1. Se crea un plan con `fechaAplicacion` inicial y frecuencia.
2. El modelo calcula `proximaAplicacion`.
3. El estado se calcula automaticamente desde `proximaAplicacion`:
   - `Vigente`
   - `Próximo`
   - `Vencido`
4. Cuando se realiza la aplicacion en campo, se usa:

```txt
PATCH /api/plan-sanitario/:id/registrar-aplicacion
```

Body:

```json
{
  "fechaAplicacion": "2026-08-10",
  "responsable": "Encargado de finca",
  "observaciones": "Aplicacion realizada sin incidentes"
}
```

5. El backend actualiza `fechaAplicacion`.
6. El modelo recalcula `proximaAplicacion`.
7. El estado vuelve a calcularse segun la nueva proxima fecha.
8. Se crea un documento `AplicacionSanitaria` con naturaleza `Plan sanitario`.
9. Desde esa aplicacion se crean eventos reales de bitacora para los animales afectados.

Reglas de bitacora sanitaria:

- Crear o editar un plan no crea bitacora.
- Registrar aplicacion crea primero `AplicacionSanitaria` y luego la bitacora.
- Si el plan tiene `animalDiio`, crea evento solo en ese animal.
- Si el plan es `Todo el ganado`, crea evento en todos los animales activos de la especie del plan.
- Si el plan usa un lote, cada aplicación resuelve las pertenencias activas del lote en ese momento. El plan no congela sus integrantes.
- Los animales `Muerto` o `Vendido` no reciben eventos de planes grupales.
- La fecha del evento es la fecha real de aplicacion.
- El titulo del evento es `Aplicación sanitaria` y su metadata conserva producto, dosis, via y naturaleza.
- El origen del evento es `Sanidad`.

Nota de compatibilidad:

- La ruta vieja `marcar-aplicado` sigue existiendo como alias.
- El estado `Aplicado` se mantiene en el enum por compatibilidad con datos viejos, pero el flujo nuevo recalcula el estado del plan despues de cada aplicacion.

### Aplicaciones Sanitarias

`AplicacionSanitaria` es la evidencia oficial de una aplicacion realmente realizada. La bitacora del animal se deriva de este modelo y no directamente de la creacion de un plan o tratamiento.

Naturalezas:

- `Plan sanitario`: referencia opcional a `PlanSanitario` y sin tratamiento.
- `Tratamiento`: requiere referencia a `TratamientoSanitario` y sin plan.
- `Aplicacion unica`: no tiene plan ni tratamiento.

Una aplicacion puede incluir varios animales en un solo documento. El servicio `aplicacionSanitaria-service.js` crea un `EventoAnimal` independiente para cada animal, todos con el ID de la aplicacion como `referenciaId`.

Plan, tratamiento y aplicación única pueden usar `lote`. La aplicación real siempre conserva tanto el lote de origen como el arreglo exacto de animales alcanzados. También crea `EventoLote` y agrega `loteId`/`loteCodigo` a la metadata de cada `EventoAnimal`.

Reglas temporales del alcance por lote:

- Plan sanitario: alcance dinámico. En cada aplicación toma los miembros activos del lote.
- Tratamiento: alcance congelado al crear el tratamiento. Si luego un animal cambia de lote, conserva su tratamiento y su historial.
- Aplicación única: alcance congelado al guardar la aplicación.
- Un animal que entra posteriormente al lote nunca recibe aplicaciones históricas.
- Un lote cerrado, de otra especie o sin integrantes activos no se acepta para una operación nueva.
- El responsable de cada aplicación se selecciona entre usuarios activos, con un rol compatible con Sanidad y acceso a la finca actual. La aplicación conserva la referencia al usuario y su nombre legible en el historial.

Las aplicaciones nuevas exigen seleccionar `responsableUsuario` desde los usuarios activos compatibles con Sanidad (`Administrador`, `Encargado` o `Veterinario`). El backend valida que pertenezca a la organización y finca actuales y conserva también el nombre en `responsable` para mostrarlo junto con registros históricos que solo tenían texto libre.

Base:

```txt
/api/aplicaciones-sanitarias
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Historial con filtros por fechas, animal, producto, naturaleza, responsable y especie |
| GET | `/:id` | Detalle de una aplicacion real |
| POST | `/unica` | Registra una aplicacion puntual sin recurrencia |

### Tratamientos Sanitarios

`TratamientoSanitario` representa un proceso finito motivado por enfermedad, lesion, recuperacion o manejo veterinario. Crear el tratamiento no crea bitacora. Solo registrar una dosis real crea `AplicacionSanitaria` y eventos individuales.

Estados:

- `Activo`
- `Completado`
- `Cancelado`

Reglas:

- Puede involucrar uno o varios animales activos de una misma especie.
- Puede crearse seleccionando un lote completo; el backend guarda una instantánea de sus miembros activos.
- La primera aplicacion es opcional al crear el tratamiento.
- La proxima fecha se calcula desde la ultima aplicacion real, no desde `fechaInicio`.
- Al alcanzar `cantidadAplicaciones`, se completa automaticamente, se guarda `fechaFin` y se limpia `proximaAplicacion`.
- Completar o cancelar manualmente conserva todas las aplicaciones historicas.
- Los animales no pueden cambiar despues de registrar la primera aplicacion.
- Al crear un tratamiento se puede cambiar el estado sanitario de todos los animales asociados; la sugerencia inicial es `Enfermo`.
- Completar el tratamiento no marca animales como sanos automaticamente. El usuario elige `Sano`, `Recuperación`, mantener `Enfermo` o no modificar.
- Cancelar un tratamiento nunca cambia el estado sanitario.
- Al crear un plan o tratamiento se requiere `asignadoA`, un usuario activo con rol `Administrador`, `Encargado` o `Veterinario`.
- `responsable` y `veterinario` siguen siendo textos de referencia para personas externas o datos historicos; las tareas y alertas usan `asignadoA`.

Base:

```txt
/api/tratamientos-sanitarios
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista y filtra tratamientos |
| GET | `/:id` | Detalle con sus aplicaciones reales |
| POST | `/` | Crea tratamiento; puede registrar la primera aplicacion |
| PUT | `/:id` | Edita datos clinicos y programacion |
| POST | `/:id/aplicaciones` | Registra una aplicacion real |
| PATCH | `/:id/completar` | Completa manualmente |
| PATCH | `/:id/cancelar` | Cancela sin borrar historial |

### Compatibilidad y migracion sanitaria

- `RegistroSanitario` se conserva sin borrarlo y queda como estructura legada/importada.
- Las aplicaciones nuevas usan `AplicacionSanitaria`.
- `backend/scripts/migrarAplicacionesPlanesSanitarios.js` revisa planes existentes con `fechaAplicacion`.
- Sin argumentos funciona en simulacion y no escribe datos.
- Para aplicar una migracion revisada se ejecuta con `--apply`.
- La migracion es idempotente y reutiliza los eventos sanitarios legados cuando existen para evitar duplicarlos.
- Los planes y tratamientos sincronizan tareas futuras; Tareas centraliza las alertas internas y los correos operativos.
- `npm run migrate:estado-sanitario:check` lista animales cuyo estado legado es `En tratamiento` sin escribir datos.
- `npm run migrate:estado-sanitario:activos` migra unicamente casos respaldados por un tratamiento activo a `estado = Activo` y `estadoSanitario = Enfermo`.
- Los casos sin tratamiento activo quedan expresamente pendientes de revision manual; el script no infiere si corresponden a observacion, enfermedad o recuperacion.

```bash
cd backend
npm run migrate:sanidad:check
npm run migrate:sanidad
```

### Reproduccion

Base:

```txt
/api/reproduccion
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista registros |
| POST | `/` | Crea registro |
| GET | `/:id` | Obtiene registro |
| GET | `/animal/:animalId` | Registros por animal |
| PUT | `/:id` | Actualiza registro |
| DELETE | `/:id` | Elimina registro |

Modelo: `RegistroReproductivo`.

Reglas:

- Si hay fecha monta y no hay parto estimado, suma 283 dias.
- Si hay parto real, calcula destete a 7 meses si falta.
- Calcula la revision de retorno a celo desde el parto real: inicia a los 60 dias posparto y, mientras no exista un dato real nuevo, avanza la proyeccion en intervalos de 21 dias.
- Calcula el destete bovino estimado a 7 meses del parto real. Al registrar el ternero desde el ciclo, esta fecha se copia a `Animal.fechaDesteteEstimada`; no se confunde con el destete realmente ejecutado.
- Al completar la tarea automatica `Destetar ternero`, se registra la fecha de finalizacion en `Animal.fechaDestete`, siempre que la tarea este vinculada a una cria de la madre del ciclo. La fecha real tambien puede corregirse manualmente desde la ficha del animal.
- Un ciclo bovino `Cerrado` con parto real conserva las tareas posparto de revisar celo y destetar el ternero. `Cancelado` y `No preñada` cancelan el seguimiento.
- Calcula estado reproductivo.
- Permite crear ternero desde parto y asociarlo a la madre.

#### Ciclos reproductivos

Cada registro reproductivo funciona como ciclo.

Campos de control:

- `asignadoA`: responsable activo del seguimiento y de las tareas automaticas.
- `estadoCiclo`: `Activo`, `Cerrado`, `Cancelado`, `No preñada`.
- `fechaCierre`.
- `motivoCierre`.
- `activoParaAlertas`.
- `tareasGeneradas`.

Reglas:

- Solo un ciclo activo por animal.
- Crear un ciclo requiere seleccionar un `Administrador`, `Encargado` o `Veterinario` activo; el creador se conserva por separado y no se vuelve responsable implicitamente.
- Solo ciclos con `estadoCiclo: Activo` y `activoParaAlertas: true` generan alertas.
- Al cerrar, cancelar o marcar como no preñada se cancelan tareas automaticas pendientes.
- Los ciclos historicos no se borran.

Endpoints adicionales:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| PATCH | `/:id/cerrar-ciclo` | Cierra ciclo |
| PATCH | `/:id/cancelar-ciclo` | Cancela ciclo |
| PATCH | `/:id/no-prenada` | Marca ciclo como no preñada |

#### Reproduccion porcina

El mismo modelo `RegistroReproductivo` soporta porcinos usando `especie: Porcino`.

Campos porcinos:

- `fechaInseminacion`.
- `destinoCrias`.
- `cantidadCriasEstimada`.
- `diasDestetePorcino`.
- `diasCeloPostDestetePorcino`.
- `fechaRevisionCelo`.
- `fechaInicioVentanaParto`.
- `fechaFinVentanaParto`.
- `fechaDesparasitacionAntesParto`.
- `fechaAlimentoLactancia`.
- `fechaNuevaInseminacion`.
- `fechaRevisionCeloPosterior`.

Configuracion:

```txt
backend/config/reproduccionPorcinaConfig.js
```

Reglas base:

- revisar celo post inseminacion: 21 dias.
- gestacion: 118 dias.
- margen de parto: 3 dias.
- desparasitar antes del parto: 30 dias antes.
- alimento lactancia: 15 dias antes.
- destete post parto: 31 dias.
- nueva monta post destete: 5 dias.
- revision de celo posterior: 21 dias.

Al crear o actualizar un registro porcino se generan tareas automaticas para la chancha mediante:

```txt
backend/services/reproduccionPorcina-service.js
```

Las tareas de crias ya no se generan desde el parto estimado; se generan desde `Camada`.

### Camadas porcinas

Base:

```txt
/api/camadas
```

Modelo: `Camada`.

Campos:

- `madre`
- `registroReproductivo`
- `codigoCamada`
- `fechaNacimiento`
- `fechaDesteteEstimada`
- `fechaDesteteReal`
- `nacidosTotales`
- `nacidosVivos`
- `nacidosMuertos`
- `momias`
- `destetados`
- `muertosPreDestete`
- `criasParaFinca`
- `criasParaVenta`
- `criasParaEngorde`
- `destino`
- `estado`
- `pesoPromedioNacimiento`
- `pesoPromedioDestete`
- `pesoTotalDestete`
- `tareasGeneradas`
- `observaciones`

Estados:

- `Activa`
- `Destetada`
- `Vendida`
- `Cerrada`
- `Cancelada`

Destinos:

- `Se quedan`
- `Se venden`
- `Engorde`
- `Mixto`
- `No definido`

Uso de destino mixto:

- `criasParaFinca` indica cuantas crias se quedan para reemplazo o crecimiento de finca.
- `criasParaVenta` indica cuantas crias se planea vender.
- `criasParaEngorde` indica cuantas crias pasan a manejo de engorde.
- En `Mixto`, estas cantidades definen que tareas automaticas se crean.
- Si una camada mixta no tiene cantidades, se mantiene compatibilidad y se generan tareas amplias de finca, venta y engorde.

Permisos:

- `Administrador`, `Encargado` y `Veterinario` pueden crear, editar, destetar, cerrar y cancelar camadas.
- `Administrador` puede eliminar camadas.
- `Consulta` puede ver camadas.
- `Trabajador` y `Contador` no ven camadas por defecto.

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista camadas |
| POST | `/` | Crea camada |
| GET | `/madre/:madreId` | Camadas de una madre |
| GET | `/:id` | Detalle de camada |
| PUT | `/:id` | Actualiza camada |
| PATCH | `/:id/destete` | Registra destete real |
| PATCH | `/:id/cerrar` | Cierra camada |
| PATCH | `/:id/cancelar` | Cancela camada |
| DELETE | `/:id` | Elimina camada |

Permisos:

- `Administrador` crea, edita, desteta, cierra, cancela y elimina.
- `Administrador` y `Encargado` pueden listar/ver.

Servicio:

```txt
backend/services/camada-service.js
```

Responsabilidades:

- generar codigo automatico `CAM-YYYY-###`.
- calcular fechas desde nacimiento.
- sincronizar tareas automaticas por camada.
- cancelar tareas automaticas al cerrar/cancelar/eliminar.
- completar tareas de destete al registrar destete real.
- registrar evento en bitacora de la madre.

Tareas generadas desde camada:

- hierro a crias.
- vitaminizar/desparasitar crias.
- destetar camada.
- desparasitar en destete.
- vitamina con selenio.
- nueva inseminacion/monta de la madre.
- revisar celo posterior de la madre.
- alimento inicio/desarrollo/engorde segun destino.
- circovirus porcino segun destino.
- primera monta si las crias se quedan.
- venta estimada si se venden.
- sacrificio si son de engorde.

### Pesajes

Base:

```txt
/api/pesajes
```

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista pesajes |
| GET | `/:id` | Obtiene pesaje |
| GET | `/animal/:animalId` | Pesajes de un animal |
| POST | `/` | Crea pesaje |
| PUT | `/:id` | Actualiza pesaje |
| DELETE | `/:id` | Elimina pesaje |

Reglas:

- Peso debe ser mayor a cero.
- Al crear pesaje se actualiza `Animal.pesoActual`.
- Al crear pesaje se crea `EventoAnimal` tipo `Pesaje`.

### Finanzas

Base:

```txt
/api/finanzas
```

Modelo principal: `MovimientoFinanciero`.

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista movimientos |
| POST | `/` | Crea movimiento |
| GET | `/resumen` | Resumen financiero |
| GET | `/destinos-resumen` | Resumen por destino de uso |
| GET | `/revision-datos` | Revision de movimientos incompletos |
| GET | `/tipo/:tipoMovimiento` | Filtra por tipo |
| PUT | `/:id` | Actualiza movimiento |
| DELETE | `/:id` | Elimina movimiento |

Tipos:

- `Planilla`
- `Inversion`
- `Compra`
- `Venta de animales`
- `Compra de animales`

Naturaleza:

- `Ingreso`
- `Egreso`

#### Estandarizacion financiera desde fase 1

- Los campos originales se conservan para trazabilidad:
  - `categoria`
  - `unidad`
  - `descripcion`
  - `observaciones`
- Se agregaron campos derivados para unidades, consumos y compatibilidad:
  - `categoriaNormalizada` (legado sincronizado con `categoria`)
  - `unidadNormalizada`
  - `factorUnidad`
  - `cantidadFisica`
  - `precioUnitarioFisico`
- Se agregaron campos operativos para compras de productos:
  - `producto`
  - `cantidad`
  - `precioUnitario`
- Se agregaron campos para planilla:
  - `periodoInicio`
  - `periodoFin`
  - `tipoTrabajo`
  - `cantidadPersonas`
  - `diasTrabajados`
  - `horasTrabajadas`
  - `costoUnitario`
- Se agregaron campos para inversiones:
  - `tipoInversion`
  - `activoAsociado`
  - `destinoUso`
  - `depreciable`
  - `vidaUtilMeses`
  - `fechaInicioUso`
  - `valorResidual`
  - `depreciacionMensual`
  - `estadoActivo`

Servicio principal:

```txt
backend/services/normalizacionFinanciera-service.js
```

Catalogos financieros:

```txt
backend/config/catalogosFinancieros.js
frontend/src/constants/catalogosFinancieros.js
backend/models/CatalogoFinanciero.js
```

Los catalogos base siguen en codigo como valores iniciales, pero las categorias financieras y los destinos de uso ya son administrables desde Finanzas.

El backend sincroniza los valores base hacia `CatalogoFinanciero` solo cuando no existe ningun catalogo de ese tipo. Esto evita que una opcion base renombrada o desactivada se vuelva a crear automaticamente.

Modelo `CatalogoFinanciero`:

```js
tipo: 'categoria' | 'destinoUso'
nombre: String
nombreNormalizado: String
activo: Boolean
protegido: Boolean
descripcion: String
timestamps
```

Indice:

```js
{ tipo: 1, nombreNormalizado: 1 } unique
```

Este indice evita duplicados aunque el usuario escriba con diferencias de mayusculas, espacios o acentos.

Catalogos editables:

- categorias financieras.
- destinos de uso.

Catalogos base aun no administrables:

- tipos de movimiento.
- naturalezas.
- unidades.
- tipos de trabajo.
- tipos de inversion.
- estados de activo.
- metodos de pago.
- monedas.

Endpoint de consulta:

```txt
GET /api/finanzas/catalogos
```

Endpoints administrativos:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/finanzas/catalogos/admin` | Lista categorias y destinos con estado y usos |
| POST | `/api/finanzas/catalogos` | Crea una categoria o destino |
| PUT | `/api/finanzas/catalogos/:id` | Renombra o actualiza un catalogo |
| PATCH | `/api/finanzas/catalogos/:id/desactivar` | Desactiva un catalogo para nuevos movimientos |
| PATCH | `/api/finanzas/catalogos/:id/activar` | Reactiva un catalogo |
| DELETE | `/api/finanzas/catalogos/:id` | Elimina solo si no tiene movimientos asociados |

Reglas de seguridad de datos:

- Si un catalogo tiene movimientos asociados, no se elimina; se desactiva.
- Al renombrar, el usuario decide si tambien actualiza los movimientos historicos.
- Los valores inactivos no aparecen para movimientos nuevos, pero los registros viejos conservan trazabilidad.

Conteo de usos:

- Para categorias, el backend cuenta movimientos donde `categoria` coincida con el nombre del catalogo.
- Para destinos, cuenta movimientos donde `destinoUso` coincida.

Acciones disponibles desde frontend:

- `Agregar`: crea un nuevo valor activo.
- `Renombrar`: cambia el nombre del catalogo. Si tiene usos, pregunta si actualiza tambien los movimientos existentes.
- `Desactivar`: oculta el valor para nuevos movimientos, sin tocar movimientos historicos.
- `Activar`: vuelve a mostrar un valor inactivo.
- `Eliminar`: solo se permite si `usos = 0`.

Flujo recomendado:

```txt
Si el valor esta mal escrito y ya fue usado:
  Renombrar + actualizar movimientos existentes.

Si el valor ya no se quiere usar pero existe historial:
  Desactivar.

Si el valor fue creado por error y nunca se uso:
  Eliminar.
```

El formulario de movimientos financieros usa estos catalogos de dos formas:

- `categoria` y `destinoUso` se eligen desde lista cerrada para evitar variaciones de escritura.
- los demas campos de texto libre se convierten a mayusculas desde la interfaz.

El backend se mantiene flexible para no romper importaciones historicas o movimientos ya existentes.

Responsabilidades:

- sincronizar `categoriaNormalizada` con `categoria` como campo legado, sin inferir por producto o descripcion.
- normalizar unidades fisicas.
- calcular cantidades fisicas para reportes de consumo.
- calcular `precioUnitarioFisico` cuando existen `monto`, `cantidad` y `unidad`.

Ejemplos:

```txt
cantidad=1, unidad=70 L
unidadNormalizada=L
factorUnidad=70
cantidadFisica=70
precioUnitarioFisico=monto / 70
```

```txt
cantidad=3, unidad=2 KG
unidadNormalizada=KG
factorUnidad=2
cantidadFisica=6
precioUnitarioFisico=monto / 6
```

```txt
categoria=Combustible
categoriaNormalizada=Combustible
```

La normalizacion se ejecuta:

- al crear un movimiento financiero.
- al editar un movimiento financiero.
- al importar finanzas desde Excel.
- al crear movimientos automaticos desde compras de animales.
- al crear movimientos automaticos desde ventas de animales.

La categoria oficial de negocio es `categoria`, elegida desde el catalogo financiero. `categoriaNormalizada` se mantiene por compatibilidad y debe tener el mismo valor.

Categorias financieras iniciales:

- `Alimentación`
- `Sanidad`
- `Combustible`
- `Mano de obra`
- `Potreros`
- `Infraestructura`
- `Herramientas`
- `Maquinaria`
- `Mantenimiento`
- `Ganado`
- `Porcinos`
- `Ventas`
- `Compras de animales`
- `Otros`

Unidades normalizadas iniciales:

- `L`
- `KG`
- `G`
- `ML`
- `UNIDAD`
- `SACO`
- `GALON`
- `M`
- `DOSIS`

#### Reportes financieros y de productos derivados

Los reportes de productos e insumos usan:

- `categoria`
- `destinoUso`
- `unidadNormalizada`
- `factorUnidad`
- `cantidadFisica`

El reporte de destinos usa `destinoUso` si existe. Si viene vacio, clasifica como `Otro`; no infiere destino desde producto o descripcion.

La pantalla de Finanzas tambien muestra:

- resumen por destino de uso del periodo visible.
- revision de movimientos sin destino, con categoria `General`/`Otros`, compras sin producto y compras sin cantidad o unidad.

Estos indicadores son de limpieza operativa: ayudan a detectar que registros conviene corregir antes de sacar reportes mas formales.

La pantalla de Reportes tambien consume datos financieros para:

- `Gastos por categoria`: agrupa por `categoria`.
- `Gastos por mes`: usa solo movimientos con `naturaleza = Egreso` y respeta el rango general `fechaInicio` / `fechaFin`.
- `Destino de uso`: usa `GET /api/finanzas/destinos-resumen` y respeta el rango general `fechaInicio` / `fechaFin`.

El rango especial de partos (`partosFechaInicio` / `partosFechaFin`) no debe afectar estos reportes financieros.

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/reportes/productos/resumen` | Resumen general de productos |
| GET | `/api/reportes/productos/por-producto` | Cantidad y monto por producto |
| GET | `/api/reportes/productos/por-categoria` | Cantidad y monto por categoria |
| GET | `/api/reportes/productos/combustibles` | Litros, monto y promedio por litro |
| GET | `/api/reportes/productos/precio-promedio` | Precio promedio mensual por producto |
| GET | `/api/reportes/productos/proveedores` | Compras agrupadas por proveedor |
| GET | `/api/reportes/productos/destinos` | Uso estimado por destino |
| GET | `/api/reportes/productos/top` | Productos mas usados o registrados |

#### Pendiente por estandarizar en Finanzas

- Validar con el cliente el catalogo definitivo de categorias, unidades, tipos de trabajo, tipos de inversion y destinos de uso.
- Mantener `categoriaNormalizada` solo como campo legado sincronizado con `categoria`.
- Migrar movimientos viejos que quedaron sin `producto`, `cantidad`, `unidadNormalizada`, `cantidadFisica` o `precioUnitarioFisico`.
- Revisar movimientos importados como `General` para reclasificarlos manualmente o con reglas nuevas.
- Asociar gastos porcinos directamente a camada cuando aplique, no solo por texto.
- Asociar gastos bovinos a animal, potrero o tarea cuando aplique.
- Definir reglas de impuestos, descuentos y ajustes en compras/ventas para reportes contables mas formales.
- Separar mejor inversiones capitalizables de gasto operativo en interfaz y reportes.
- Agregar exportacion de finanzas/reportes a Excel o PDF.
- Definir si `GALON` debe convertirse a litros o mantenerse como unidad separada.
- Estandarizar monedas y tipo de cambio si se mezclan `CRC` y `USD`.

### Compras de animales

Base:

```txt
/api/compras
```

Modelo: `CompraAnimal`.

El formulario solicita un único `DIIO` por animal; `identificadorFinca` se completa internamente con ese valor para conservar compatibilidad. Cada detalle guarda `sexo` y `objetivoProductivo`, y al crear la compra puede generarse opcionalmente un lote rápido indicando únicamente nombre y objetivo. En ese flujo todos los animales deben compartir el mismo objetivo, el código del lote se genera automáticamente y `loteAsignado` impide asignar la compra más de una vez. La configuración restante se completa después desde Inventario > Lotes.

Funciones:

- registrar compra de uno o varios animales.
- separar compras por `especie`: `Bovino` o `Porcino`.
- calcular subtotal por animal.
- calcular monto calculado, monto final editable, ajuste, monto total y peso total.
- crear animales nuevos en inventario al confirmar compra.
- guardar `fechaCompra`, `pesoCompra`, `pesoActual`, `precioCompraPorKg`, `montoCompra`, `proveedorCompra` y `compraId`.
- crear evento de bitacora tipo `Compra`.
- crear movimiento financiero de egreso tipo `Compra de animales`.
- el movimiento financiero incluye `producto`, `cantidad`, `unidad`, `precioUnitario`, `referenciaId` y `referenciaModelo`.
- para porcinos, el producto financiero queda como `Porcinos comprados`.
- para bovinos, el producto financiero queda como `Bovinos comprados`.
- anular o eliminar compras siempre que los animales no hayan sido vendidos o marcados como muertos despues.

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista compras |
| GET | `/resumen` | Resumen de compras |
| GET | `/:id` | Detalle |
| POST | `/` | Crea compra |
| PUT | `/:id` | Actualiza compra |
| PATCH | `/:id/anular` | Anula compra |
| DELETE | `/:id` | Elimina compra |

### Ventas de animales

Base:

```txt
/api/ventas
```

Modelo: `VentaAnimal`.

Funciones:

- registrar venta de uno o varios animales.
- separar ventas por `especie`: `Bovino` o `Porcino`.
- calcular subtotal por animal.
- calcular `montoCalculado`, `montoFinal`, `montoTotal`, `ajusteMonto` y peso total.
- permitir `montoFinal` general para ventas con ajustes, impuestos, redondeos u otros cargos.
- impedir vender animales ya vendidos o muertos.
- impedir mezclar bovinos y porcinos dentro de una misma venta.
- actualizar animal al confirmar venta.
- crear evento de bitacora.
- crear movimiento financiero.
- el movimiento financiero usa `montoTotal` oficial e incluye `producto`, `cantidad`, `unidad`, `precioUnitario`, `referenciaId` y `referenciaModelo`.
- para porcinos, el producto financiero queda como `Porcinos vendidos`.
- para bovinos, el producto financiero queda como `Bovinos vendidos`.
- revertir movimiento financiero al anular.

Regla de monto:

- `montoCalculado`: suma de peso por precio/kg en animales o camadas.
- `montoFinal`: monto oficial editable de la venta.
- `montoTotal`: usa `montoFinal` si existe; si no, usa `montoCalculado`.
- `ajusteMonto`: diferencia entre `montoTotal` y `montoCalculado`.
- Cuando existe ajuste, el monto se distribuye proporcionalmente para actualizar `montoVenta` y bitacora de animales.

Frontend:

- La venta usa selector de especie.
- Al agregar animales, ya no se muestra una lista completa grande.
- Se usa buscador por:
  - DIIO completo.
  - ultimos 4 digitos del DIIO.
  - identificador provisional.
  - nombre.
- El buscador respeta la especie seleccionada y omite vendidos, muertos o ya agregados.

Reportes de ventas disponibles desde resumen:

- total vendido.
- total kg vendidos.
- precio promedio kg.
- ventas por mes.
- ventas por origen.
- rotacion de inventario vendido.

### Tareas

Base:

```txt
/api/tareas
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista tareas segun rol/filtros |
| GET | `/mis-tareas` | Tareas del usuario autenticado |
| GET | `/:id` | Detalle |
| POST | `/` | Crea tarea |
| PUT | `/:id` | Actualiza tarea |
| PATCH | `/:id/estado` | Cambia estado |
| PATCH | `/:id/completar` | Completa tarea |
| POST | `/:id/comentarios` | Agrega comentario |
| DELETE | `/:id` | Elimina tarea |

Reglas:

- `Administrador` y `Encargado` gestionan todas las tareas.
- `Trabajador`, `Veterinario`, `Contador` y `Consulta` ven sus tareas asignadas.
- Los usuarios sin gestion pueden pasar sus tareas asignadas a `Pendiente`, `En proceso` o `Completada`.
- Los usuarios sin gestion no eliminan ni reasignan tareas.
- Una tarea puede asignarse a cualquier usuario operativo activo (`Administrador`, `Encargado`, `Trabajador`, `Veterinario` o `Contador`), nunca a `Consulta` ni a un usuario inactivo.
- Solo `Administrador` y `Encargado` pueden cambiar manualmente `asignadoA` desde Tareas.
- Una reasignacion manual establece `asignacionModificadaManualmente: true`; las sincronizaciones de Sanidad, Reproduccion y Camadas conservan esa decision.
- Si la asignacion no fue modificada manualmente, un cambio de responsable en el registro de origen se propaga a sus tareas pendientes.

Campos automaticos usados por reproduccion/camadas:

- `moduloOrigen`
- `referenciaId`
- `creadoAutomaticamente`
- `especie`
- `categoriaAutomatica`
- `claveAutomatica`
- `generaBitacora`
- `tipoEventoBitacora`
- `asignacionModificadaManualmente`

Usuarios asignables:

```txt
GET /api/usuarios/asignables?modulo=Sanidad
GET /api/usuarios/asignables?modulo=Reproduccion
GET /api/usuarios/asignables?modulo=Tareas
```

El endpoint exige autenticacion y permiso de gestion del modulo. Devuelve solo nombre, apellido, correo, rol y estado de usuarios activos compatibles, sin exponer la administracion completa de usuarios.

En cualquier selector usado para asignar una tarea o responsabilidad operativa, cada opción se presenta como `Nombre · Rol`. El rol es el de la membresía activa del usuario en la organización actual. Esta presentación se centraliza en el frontend y aplica a Tareas, Sanidad, Reproducción y responsables operativos de Potreros.

Reglas automaticas:

- Las tareas automaticas pendientes pueden actualizarse si cambia la fecha base.
- Las tareas automaticas completadas se conservan como historial.
- Las tareas automaticas pendientes se cancelan si se cierra/cancela el ciclo o camada.
- Las tareas manuales no se modifican por servicios automaticos.
- Solo tareas importantes generan bitacora al completarse.
- Si una tarea historica se revierte de `Completada` a otro estado, se elimina el evento generado desde esa tarea.

Tareas que generan bitacora:

- sanidad.
- tratamiento.
- destete.
- parto o revision de parto.
- celo/monta/inseminacion.
- venta.
- sacrificio.
- pesaje.

Tareas que normalmente no generan bitacora:

- alimento inicio.
- alimento desarrollo.
- alimento engorde.
- alimento lactancia.
- limpiezas o revisiones operativas menores.

### Importacion Excel

Base:

```txt
/api/importar
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/plantilla` | Descarga la plantilla versionada con catalogos activos |
| POST | `/excel` | Valida el archivo y crea un lote pendiente |
| POST | `/excel/confirmar` | Confirma un lote validado por ID |

Campo multipart:

```txt
archivo
```

Hojas de datos exactas:

- `POTREROS`
- `INVENTARIO`
- `FINANZAS`
- `PESAJES` opcional

`INVENTARIO` admite `OBJETIVO_PRODUCTIVO` y `ETAPA_PRODUCTIVA`. Para bovinos también admite `RAZA`, `RAZA_PRINCIPAL`, `RAZA_SECUNDARIA`, `DESCRIPCION_RACIAL`, `GRADO_RACIAL`, `VARIEDAD_RACIAL` y `COMPOSICION_RACIAL`. `RAZA` conserva la descripción histórica y los campos estructurados alimentan reportes. `MADRE_DIIO` y `PADRE_DIIO` se resuelven después de importar todos los animales y se conservan si todavía no existe el progenitor. `PESAJES` admite `ETAPA_PRODUCTIVA` como fotografia de la fase porcina en la fecha del pesaje. El importador no deduce etapas por rangos de peso.

El importador no contiene detectores de hojas antiguas ni mapeos especificos por cliente. `ROTACIONES` y Sanidad se administran en sus modulos.

`POTREROS` admite `PASTO_PRINCIPAL`, `FECHA_ESTABLECIMIENTO_PASTO`, `DIAS_DESCANSO_OBJETIVO` y `OBSERVACION_COBERTURA`. Tambien reconoce los encabezados alternativos `PASTO` y `TIPO_PASTO`. La coincidencia con `CatalogoPasto` ignora mayusculas y tildes; `Brachiaria brizantha` resuelve a la entrada generica Brizantha. Un nombre sin coincidencia no se pierde: se guarda en `descripcionCobertura` y la vista previa genera una advertencia.

La vista previa valida el libro completo y persiste en `ImportacionExcel`:

- version y hash del archivo.
- usuario propietario del lote.
- estado `Pendiente`, `Con errores`, `Confirmada` o `Confirmada con errores`.
- hojas, resumen, registros normalizados, errores y advertencias.

Confirmacion:

```json
{
  "importacionId": "...",
  "modo": "crear_actualizar"
}
```

Modos admitidos:

- `crear_actualizar`: crea y actualiza campos no vacios de animales, potreros y pesajes.
- `solo_crear`: omite animales, potreros y pesajes existentes.

Finanzas siempre crea movimientos desde las filas validadas; la proteccion contra doble carga se realiza por lote confirmado y hash de archivo.

Modelo `ImportacionExcel` guarda:

- archivo.
- version y hash.
- estado y modo.
- hojas detectadas.
- registros validados.
- errores y advertencias.
- resumen detectado.
- resultado.
- usuario.
- fecha de confirmacion.

### Reportes

Base:

```txt
/api/reportes
```

Reportes principales:

- resumen general.
- productividad de cria.
- finanzas de cria.
- sustentabilidad de cria.
- vacas improductivas.
- crecimiento por pesajes.
- partos por vaca y ano.
- productos e insumos.
- camadas porcinas.
- reproduccion porcina.
- tareas por camada.
- economia por camada.
- peso real al destete bovino y porcino.
- comparacion avanzada del destete a una edad comun.

Endpoints de destete:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/destete/peso` | Pesos reales, cobertura y detalle; disponible en todos los planes |
| GET | `/destete/peso/analitica` | Equivalente bovino a 205 dias y porcino a 21 dias; requiere analitica productiva |

Endpoints porcinos:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/porcinos/camadas` | Reporte productivo de camadas |
| GET | `/porcinos/reproduccion` | Reporte reproductivo porcino por madre |
| GET | `/porcinos/tareas-camadas` | Reporte de actividades/tareas por camada |
| GET | `/porcinos/economia-camadas` | Reporte economico por camada |

Indicador interno de cria bovina:

```txt
IPG = natalidad * 0.40
    + destete * 0.25
    + gestacion * 0.20
    + supervivencia * 0.15
```

Clasificacion:

- 0 a 59: Deficiente
- 60 a 74: Regular
- 75 a 84: Bueno
- 85 a 94: Muy bueno
- 95 a 100: Excelente

Este indicador nunca mezcla porcinos. Para `especie=Porcino`, `/reportes/productividad` devuelve el ICRP junto con nacidos vivos por camada, destetados por camada y supervivencia predestete usando solo camadas cuyo destete ya fue cerrado. El ICRP pondera esos tres componentes con 30%, 45% y 25%, respectivamente, contra metas internas configurables. Las camadas activas no se contabilizan como perdidas.

### Conteo por drone

Base:

```txt
/api/conteo-drone
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/` | Lista conteos |
| POST | `/procesar` | Procesa imagen |
| GET | `/:id` | Detalle |
| DELETE | `/:id` | Elimina registro |

`POST /procesar` recibe:

- imagen con multer.
- potrero.
- cantidadEsperada.

Se comunica con servicio IA si esta configurado.

El conteo por dron conserva su almacenamiento operativo propio. Compras, ventas, finanzas y tareas no aceptan comprobantes ni evidencias adjuntas. Los planes PRO y PREMIUM pueden asociar una fotografia principal a un bovino o porcino mediante `ArchivoMultimedia` en Cloudflare R2; el DTO general de Animal no acepta esa referencia y obliga a usar `POST /api/animales/:id/foto`. La lectura y eliminacion se conservan tras un downgrade, mientras la carga o reemplazo exige `fotosAnimales`. La importacion Excel conserva su carga de `.xlsx`, pero el archivo se procesa en memoria y no se trata como imagen operativa.

Limpieza de campos legados:

```bash
npm run migrate:archivos-obsoletos:check
npm run migrate:archivos-obsoletos
```

El primer comando solo informa cantidades. El segundo elimina de los documentos los campos antiguos de comprobantes, fotos y evidencia, sin borrar documentos ni tocar las imagenes de dron.

## Servicios internos

### `correoElectronico-service.js`

Responsable de:

- enviar correos via Resend.
- correos a administradores.
- correos de recuperacion de contrasena.

### `alertasCorreo-service.js`

Revisa tareas pendientes y centraliza alertas operativas:

- crea notificaciones internas de tareas proximas o vencidas con `dedupKey`.
- envia correos operativos compatibles mediante Resend cuando estan habilitados.
- clasifica tareas originadas en Sanidad y Reproduccion para producir textos adecuados.

Sanidad y Reproduccion no envian correos directamente. Generan o sincronizan tareas y este servicio procesa sus fechas.

Frecuencia configurable por:

```env
EMAIL_ALERTS_INTERVAL_MS=
```

### `eventoAnimal-service.js`

Crea eventos de bitacora desde modulos.

### `reproduccion-service.js`

Centraliza cierre/cancelacion de ciclos reproductivos y reglas para que solo un ciclo activo genere alertas y tareas.

### `reproduccionBovina-service.js`

Genera y sincroniza tareas automaticas desde registros reproductivos bovinos:

- revisar parto estimado.
- revisar proximo celo estimado.
- revisar destete.

Estas tareas son la fuente para correos reproductivos.

### `reproduccionPorcina-service.js`

Genera y sincroniza tareas automaticas desde registros reproductivos porcinos.

### `camada-service.js`

Genera codigo de camada, calcula fechas desde nacimiento, sincroniza tareas automaticas por camada, cancela tareas pendientes y registra eventos de camada.

### `iaConteoService.js`

Simula o conecta con el servicio IA.

Variable esperada:

```env
IA_SERVICE_URL=
```

## Modelos principales

- `Usuario`
- `Animal`
- `EventoAnimal`
- `Potrero`
- `RotacionPotrero`
- `PlanSanitario`
- `TratamientoSanitario`
- `AplicacionSanitaria`
- `RegistroSanitario`
- `RegistroReproductivo`
- `Camada`
- `Pesaje`
- `MovimientoFinanciero`
- `Costo`
- `CompraAnimal`
- `VentaAnimal`
- `Tarea`
- `ConteoDrone`
- `AlertaCorreo`
- `ImportacionExcel`
- `Notificacion`

## Centro de alertas interno

### Modelo `Notificacion`

Cada documento pertenece a un unico usuario para mantener lectura independiente:

- `destinatario`: usuario que recibe la alerta.
- `actor`: usuario que produjo la accion; puede ser `null` para procesos automaticos.
- `naturaleza`: `Operativa` o `Informativa`.
- `tipo`, `titulo`, `mensaje`.
- `moduloOrigen`, `entidadTipo`, `entidadId`, `url`.
- `leida`, `fechaLectura`.
- `dedupKey`: evita duplicados de procesos periodicos.
- `metadata`: contexto extensible.

La notificacion incluye `organizacionId` mediante el plugin multiempresa. El destinatario debe tener una membresia activa en esa misma organizacion.

### Endpoints

| Metodo | Ruta | Funcion |
| --- | --- | --- |
| GET | `/api/notificaciones` | Lista solo las notificaciones del JWT |
| GET | `/api/notificaciones/no-leidas/count` | Cuenta solo las no leidas propias |
| PATCH | `/api/notificaciones/:id/leida` | Marca una notificacion propia |
| PATCH | `/api/notificaciones/marcar-todas-leidas` | Marca todas las propias |

Filtros GET: `leida`, `naturaleza`, `tipo`, `moduloOrigen`, `page`, `limit`.

### Reglas por rol

| Actor | Destinatarios informativos |
| --- | --- |
| Trabajador | Encargado y Administrador |
| Veterinario | Encargado y Administrador |
| Encargado | Administrador |
| Contador | Administrador, como rol financiero equivalente al consultor operativo |
| Administrador | No escala su propia actividad |
| Consulta | No genera actividad; es solo lectura |

Las tareas asignadas, proximas y vencidas se entregan al responsable independientemente de la jerarquia anterior.

### Fuentes

- Tareas: asignacion, modificacion, finalizacion, proximidad y vencimiento.
- Sanidad: tratamiento, aplicacion real y cambio de estado sanitario.
- Pesajes: alta y modificacion.
- Reproduccion: nuevo ciclo, modificacion, parto, cierre, cancelacion y no preñada.
- Finanzas: alta, modificacion y eliminacion de movimientos por actores que escalan actividad.

Las notificaciones informativas nunca envian correo. Las operativas nacen de tareas y conservan compatibilidad con el correo actual.

### Entrega

La entrega actual usa persistencia MongoDB, carga inicial, recarga al recuperar foco y sondeo de 45 segundos. `notificacion-service.js` expone `configurarEmisorTiempoReal()` y `emitirNotificacionTiempoReal()` como punto de extension para Socket.IO autenticado en el futuro; no se agrego infraestructura WebSocket innecesaria en este sprint.

### Sincronizacion sanitaria existente

```bash
npm run migrate:tareas-sanidad:check
npm run migrate:tareas-sanidad
```

La simulacion cuenta planes y tratamientos candidatos. La aplicacion sincroniza tareas futuras sin borrar historial sanitario.

## Base SaaS por organizacion

La aplicacion usa tres conceptos separados:

- `Organizacion`: cliente propietario de los datos y futuro titular de la suscripcion.
- `Finca`: unidad productiva perteneciente a una organizacion.
- `Membresia`: relacion entre un `Usuario` global y una organizacion, con rol y estado propios.

El rol efectivo se obtiene siempre de `Membresia`. Los campos `rol` y `estado` de `Usuario` se conservan temporalmente por compatibilidad; `Usuario.estado` tambien permite bloquear una identidad en toda la plataforma.

### Aislamiento de datos

Todos los modelos operativos contienen `organizacionId`. El plugin `models/plugins/organizacion-plugin.js` aplica el filtro automaticamente en consultas, conteos, actualizaciones, eliminaciones, agregaciones y nuevas escrituras.

El contexto se establece en `auth` despues de validar simultaneamente:

1. usuario global activo;
2. membresia activa;
3. organizacion activa.

Las consultas a modelos operativos sin contexto fallan de forma cerrada y devuelven cero documentos. Los procesos internos que recorren varias organizaciones deben ejecutar cada una con `ejecutarConOrganizacion`.

Los identificadores de negocio ahora son unicos dentro de la organizacion, no en toda la plataforma. Esto aplica a DIIO, identificador de finca, codigo de potrero, codigo de camada, catalogos y claves automaticas.

### Organizacion inicial

La migracion crea la organizacion `Ganaderia Romilio`, una finca con codigo `PRINCIPAL`, una membresia principal para cada usuario existente y `organizacionId` en todos los documentos historicos.

Los documentos operativos tambien reciben `fincaId`. Esto incluye inventario, potreros, pesajes, sanidad, reproduccion, camadas, tareas, compras, ventas, finanzas, rotaciones, drone, importaciones y bitacoras. Auditorias, membresias, notificaciones, catalogos y configuraciones permanecen a nivel de organizacion.

La finca contiene `lineasProductivas`, una lista sin especies repetidas:

```js
[
  { especie: 'Bovino', objetivos: ['REPRODUCCION', 'ENGORDE'], activa: true },
  { especie: 'Porcino', objetivos: ['Reproduccion', 'Engorde'], activa: true }
]
```

Los valores persistidos son canónicos: `ENGORDE`, `REPRODUCCION`, `REEMPLAZO`, `OTRO` y `SIN_DEFINIR`. Las etiquetas acentuadas pertenecen solamente a la interfaz.

### Objetivos productivos y categorías de animales

`objetivoProductivo` expresa para qué se conserva el animal en la finca; `categoria` describe su grupo por sexo y edad. Para la finca inicial se aplicó la siguiente normalización:

En Inventario, la señal **Edad reproductiva** se calcula para ambos sexos. Los umbrales operativos son 24 meses para hembras bovinas, 12 meses para machos bovinos, 7 meses para hembras porcinas y 8 meses para machos porcinos. La interfaz muestra `Lista/Listo`, `No lista/No listo` o `Sin fecha`. Esta señal indica únicamente cumplimiento de edad y no reemplaza condición corporal, examen andrológico ni evaluación veterinaria.

- Las hembras bovinas destinadas a producir descendencia: objetivo `REPRODUCCION`.
- Machos activos con categoría calculada `Toro`: objetivo `Reproducción`.
- Machos vendidos o muertos: no se modifican.
- Menores de 12 meses: `Ternero`.
- De 12 a 23 meses: `Novilla` o `Novillo` según sexo.
- Desde 24 meses: `Vaca` o `Toro` según sexo.

La categoría es un dato derivable de especie, `fechaNacimiento` y sexo. Se persiste por compatibilidad con filtros e índices, pero el servicio de inventario la calcula y valida de forma centralizada. `objetivoProductivo` no es redundante: animales de igual edad y sexo pueden tener objetivos distintos.

Las consultas de inventario devuelven siempre la categoría calculada a la fecha actual. Además, el trabajo programado diario sincroniza el valor persistido cuando un animal cruza un umbral de edad, para mantener consistentes los filtros y reportes que consultan MongoDB directamente.

Reglas vigentes:

- Bovinos menores de 12 meses: `Ternero` o `Ternera`.
- Bovinos de 12 a 23 meses: `Novillo` o `Novilla`.
- Bovinos desde 24 meses: `Toro` o `Vaca`.
- Porcinos menores de 3 meses: `Lechón` o `Lechona`.
- Porcinos de 3 a 6 meses: `Cerdo joven` o `Cerda joven`.
- Porcinos desde 7 meses: `Cerdo adulto` o `Chancha`.

`Engorde`, `Reemplazo` y `Reproducción` pertenecen a `objetivoProductivo`; `Verraco` dejó de utilizarse como categoría porque describe una función reproductiva. Si falta una fecha válida, la aplicación no inventa la categoría y conserva los datos históricos para revisión.

### Normalización de Cría y Reproducción

`Cría` ya no es un valor de `Animal.objetivoProductivo` ni de `Lote.proposito`. Cuando describe un animal destinado a producir descendencia se almacena `REPRODUCCION`; el término cría se conserva para descendencia, camadas, indicadores y sistemas productivos donde mantiene su significado real.

Antes de ejecutar la migración en producción se debe crear un snapshot de MongoDB. Comandos:

```bash
npm run migrate:cria-reproduccion:check
npm run migrate:cria-reproduccion
```

El primer comando no escribe datos. El segundo normaliza todos los tenants y comprueba totales generales y por especie; no crea eventos en la bitácora productiva.

Los terneros registrados desde un parto conservan `categoria` según edad y sexo, usan `SIN_DEFINIR` como objetivo inicial salvo decisión explícita y enlazan `madre` con el animal interno del ciclo reproductivo. `madreDiio` se conserva como referencia legible, pero no convierte a la madre en externa. En formularios genealógicos, una coincidencia única por DIIO o identificador puede recuperarse como relación interna al guardar.

Los registros históricos que solo conservan `madreDiio` se pueden revisar y enlazar sin inferencias mediante:

```bash
npm run migrate:madres-internas:check
npm run migrate:madres-internas
```

La herramienta exige una única hembra coincidente dentro de la misma organización, finca y especie. Las coincidencias ambiguas o inexistentes se reportan y no se modifican.

La migración es idempotente y puede revisarse antes de aplicarse:

```bash
npm run migrate:objetivos-bovinos:check
npm run migrate:objetivos-bovinos
```

El contexto autenticado incluye una finca activa. El frontend la envía en `X-Finca-Id`; el middleware comprueba en cada solicitud que pertenezca a la organización, esté activa y sea accesible para la membresía. Si el encabezado no está presente se utiliza la finca principal. Los modelos operativos asignan ese `fincaId` al crear documentos y filtran lecturas, actualizaciones, eliminaciones y agregaciones por organización y finca.

Los procesos internos que necesitan atravesar fincas deben omitir únicamente el filtro de finca y conservar obligatoriamente el de organización. El reporte Premium multi-finca sigue esta regla y además restringe los IDs consultados a la lista autorizada de la membresía.

Endpoints de configuracion:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/fincas` | Lista las fincas autorizadas e identifica la activa y la principal |
| POST | `/api/fincas` | Crea una finca dentro del límite del plan |
| PUT | `/api/fincas/:id` | Actualiza los datos generales de una finca |
| PATCH | `/api/fincas/:id/estado` | Activa o desactiva una finca |
| PATCH | `/api/fincas/:id/principal` | Define la finca principal de la organización |
| PATCH | `/api/fincas/:id/lineas-productivas` | Actualiza especies y objetivos; requiere administrador |

La membresía define el alcance mediante `accesoTodasFincas` o el arreglo `fincas`. El administrador puede modificar ese alcance desde Usuarios. Gestión y Pro conservan reportes por finca activa; Premium habilita `GET /api/reportes/multi-finca` para comparación y consolidación autorizada entre fincas.

Comandos idempotentes:

```bash
npm run migrate:saas:check
npm run migrate:saas
npm run verify:saas
npm run verify:saas:api
```

`migrate:saas:check` no modifica datos. `migrate:saas` conserva los documentos, completa solo `organizacionId` y `fincaId` ausentes y puede ejecutarse nuevamente sin duplicar organizacion, finca ni membresias.

### Archivos

Los adjuntos nuevos se guardan bajo `uploads/<organizacionId>/<categoria>` y se descargan mediante `/api/archivos/:categoria/:archivo`, que exige autenticacion. Ya no se publica todo `uploads` como directorio estatico.

La organizacion inicial mantiene una lectura protegida de rutas legadas. La migracion solo reescribe una URL antigua cuando encuentra fisicamente el archivo, evitando referencias rotas.

Este almacenamiento por disco es una fase de compatibilidad. Antes de escalar horizontalmente debe sustituirse por almacenamiento de objetos privado.

## Compatibilidades mantenidas

- `RegistroSanitario` no se elimina; las aplicaciones nuevas se registran en `AplicacionSanitaria`.
- `Costo` no se elimina, aunque el modulo principal es `MovimientoFinanciero`.
- Endpoints viejos de recuperacion bajo `/api/usuarios` siguen disponibles como compatibilidad:
  - `/api/usuarios/recuperar-contrasena`
  - `/api/usuarios/restablecer-contrasena`

## Verificacion

Cargar backend:

```bash
cd backend
node -e "require('./app'); console.log('backend ok')"
```

Ejecutar servidor:

```bash
npm run dev
```

## Despliegue

Render:

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Variables reales se configuran en Render, no en GitHub.
