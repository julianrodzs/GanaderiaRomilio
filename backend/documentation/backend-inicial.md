# Documentacion tecnica actual - Backend GanaderiaRomilio

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
- `generarToken`

El login usa JWT. La recuperacion de contrasena no usa JWT.

### Roles

Roles actuales:

- `Administrador`
- `Encargado`
- `Consulta`

Regla general actual:

- Administrador tiene acceso completo.
- Encargado tiene acceso limitado a tareas y vistas operativas.
- Consulta queda preparado para lectura.

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

Las rutas administrativas requieren rol `Administrador`.

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
- `potreroActual`

Estados:

- `Activo`
- `Vendido`
- `Muerto`
- `En tratamiento`

Especies:

- `Bovino`
- `Porcino`

La mayoria de endpoints de animales aceptan filtro:

```txt
GET /api/animales?especie=Bovino
GET /api/animales?especie=Porcino
```

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
| PATCH | `/:id/marcar-aplicado` | Marca como aplicado |

Modelo: `PlanSanitario`.

Calcula:

- `proximaAplicacion`
- estado sanitario segun fecha:
  - vencido.
  - proximo.
  - vigente.

Puede aplicar por grupo o con animales especificos opcionales, salvo `Todo el ganado`.

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
- Calcula proximo celo estimado desde parto real:
  - parto + 60 dias.
  - ciclos de 21 dias.
  - no muestra celos pasados.
- Calcula estado reproductivo.
- Permite crear ternero desde parto y asociarlo a la madre.

#### Ciclos reproductivos

Cada registro reproductivo funciona como ciclo.

Campos de control:

- `estadoCiclo`: `Activo`, `Cerrado`, `Cancelado`, `No preñada`.
- `fechaCierre`.
- `motivoCierre`.
- `activoParaAlertas`.
- `tareasGeneradas`.

Reglas:

- Solo un ciclo activo por animal.
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
- nueva monta post destete: 21 dias.
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
- Se agregaron campos derivados para reportes y filtros:
  - `categoriaNormalizada`
  - `unidadNormalizada`
  - `factorUnidad`
  - `cantidadFisica`
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

Responsabilidades:

- inferir `categoriaNormalizada` desde `categoria`, `producto`, `descripcion` y `tipoMovimiento`.
- normalizar unidades fisicas.
- calcular cantidades fisicas para reportes de consumo.

Ejemplos:

```txt
cantidad=1, unidad=70 L
unidadNormalizada=L
factorUnidad=70
cantidadFisica=70
```

```txt
cantidad=3, unidad=2 KG
unidadNormalizada=KG
factorUnidad=2
cantidadFisica=6
```

```txt
producto=GASOLINA REGULAR
categoriaNormalizada=Combustible
```

La normalizacion se ejecuta:

- al crear un movimiento financiero.
- al editar un movimiento financiero.
- al importar finanzas desde Excel.
- al crear movimientos automaticos desde compras de animales.
- al crear movimientos automaticos desde ventas de animales.

Si una categoria no se puede inferir, queda como `Otros` o conserva la categoria escrita segun el caso.

Categorias normalizadas iniciales:

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

Los reportes de productos e insumos usan los campos normalizados:

- `categoriaNormalizada`
- `unidadNormalizada`
- `factorUnidad`
- `cantidadFisica`

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

- Definir catalogos cerrados para `categoriaNormalizada`, `tipoTrabajo`, `tipoInversion`, `unidadNormalizada` y `destinoUso`.
- Decidir si el usuario podra elegir categoria normalizada manualmente o si siempre sera inferida.
- Crear mantenimiento de catalogos desde frontend, para no depender de listas quemadas en codigo.
- Migrar movimientos viejos que quedaron sin `producto`, `cantidad`, `unidadNormalizada` o `cantidadFisica`.
- Revisar movimientos importados como `General` para reclasificarlos manualmente o con reglas nuevas.
- Asociar gastos porcinos directamente a camada cuando aplique, no solo por texto.
- Asociar gastos bovinos a animal, potrero o tarea cuando aplique.
- Definir reglas de impuestos, descuentos y ajustes en compras/ventas para reportes contables mas formales.
- Separar mejor inversiones capitalizables de gasto operativo en interfaz y reportes.
- Implementar control opcional de comprobantes/facturas por proveedor.
- Agregar exportacion de finanzas/reportes a Excel o PDF.
- Definir si `GALON` debe convertirse a litros o mantenerse como unidad separada.
- Estandarizar monedas y tipo de cambio si se mezclan `CRC` y `USD`.

### Compras de animales

Base:

```txt
/api/compras
```

Modelo: `CompraAnimal`.

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
- calcular monto total y peso total.
- impedir vender animales ya vendidos o muertos.
- impedir mezclar bovinos y porcinos dentro de una misma venta.
- actualizar animal al confirmar venta.
- crear evento de bitacora.
- crear movimiento financiero.
- el movimiento financiero incluye `producto`, `cantidad`, `unidad`, `precioUnitario`, `referenciaId` y `referenciaModelo`.
- para porcinos, el producto financiero queda como `Porcinos vendidos`.
- para bovinos, el producto financiero queda como `Bovinos vendidos`.
- revertir movimiento financiero al anular.

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

- Administrador gestiona todas.
- Encargado ve sus tareas.
- Encargado puede pasar sus tareas a `En proceso` o `Completada`.
- Encargado no elimina ni reasigna.

Campos automaticos usados por reproduccion/camadas:

- `moduloOrigen`
- `referenciaId`
- `creadoAutomaticamente`
- `especie`
- `categoriaAutomatica`
- `claveAutomatica`

Reglas automaticas:

- Las tareas automaticas pendientes pueden actualizarse si cambia la fecha base.
- Las tareas automaticas completadas se conservan como historial.
- Las tareas automaticas pendientes se cancelan si se cierra/cancela el ciclo o camada.
- Las tareas manuales no se modifican por servicios automaticos.

### Importacion Excel

Base:

```txt
/api/importar
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| POST | `/excel` | Vista previa sin insertar |
| POST | `/excel/confirmar` | Inserta datos enviados |
| POST | `/excel/importar` | Importacion directa con reporte |

Campo multipart:

```txt
archivo
```

Campo opcional:

```txt
modulos=["inventario","potreros","pesajes","finanzas","rotaciones"]
```

Reglas actuales:

- Procesa solo modulos seleccionados.
- No sobrescribe datos con celdas vacias.
- Si existe animal/potrero, actualiza solo campos con valor.
- Inventario se detecta por hojas que contengan `INVENTARIO` en el nombre o por hojas con encabezados minimos `DIIO` y `Sexo`.
- Animal sin DIIO se omite.
- Animal sin sexo se omite.
- DIIO repetido dentro del mismo Excel se omite despues de la primera aparicion.
- Potrero sin codigo/nombre se omite.
- Movimiento financiero sin campos minimos se omite.
- Si un animal no existe por DIIO o identificador de finca, se crea.
- Si un animal ya existe por DIIO o identificador de finca, se actualiza con campos nuevos no vacios.
- Registra historial en `ImportacionExcel`.

#### Inventario generico

El importador principal de inventario usa encabezados y reemplaza el flujo viejo amarrado a `CONTROL DE PESO`.

Una hoja se procesa como inventario cuando:

- el nombre de la hoja contiene `INVENTARIO`, o
- la hoja trae encabezados reconocibles para `DIIO` y `Sexo`.

Campos minimos:

- `DIIO`
- `Sexo`

Nombres de columnas aceptados:

| Campo destino | Encabezados aceptados |
| --- | --- |
| `diio` | `DIIO`, `Arete`, `Numero DIIO`, `Número DIIO` |
| `identificadorFinca` | Se llena internamente con el mismo DIIO para cumplir el modelo |
| `nombre` | `ID de finca`, `ID Finca`, `Nombre animal`, `Alias` |
| `sexo` | `Sexo`, `Genero`, `Género` |
| `fechaNacimiento` | `Fecha de Nacimiento`, `Fecha Nacimiento`, `Nacimiento`, `Fecha de Nac.`, `F. Nacimiento`, `Fecha de` |
| `raza` | `Raza` |
| `madreDiio` | `Madre DIIO`, `DIIO Madre` |
| `padreDiio` | `Padre DIIO`, `DIIO Padre` |
| `fechaCompra` | `Fecha Compra`, `Fecha de Compra` |
| `fechaVenta` | `Fecha Venta`, `Fecha de Venta` |
| `fechaMuerte` | `Fecha Muerte`, `Fecha de Muerte` |
| `fechaDestete` | `Fecha Destete`, `Fecha de Destete` |
| `pesoNacimiento` | `Peso Nacimiento`, `Peso al Nacer` |
| `pesoDestete` | `Peso Destete`, `Peso al Destete` |
| `pesoActual` | `Peso Actual`, `Peso` |
| `pesoCompra` | `Peso Compra`, `Peso de Compra` |
| `precioCompraPorKg` | `Precio Compra Kg`, `Precio Compra por Kg`, `Precio de Compra por kilo` |
| `precioVentaPorKg` | `Precio Venta Kg`, `Precio Venta por Kg`, `Precio de venta por kilo` |
| `montoCompra` | `Monto Compra`, `Total compra` |
| `montoVenta` | `Monto Venta`, `Total venta` |
| observacion | `Estado`, `Status` |

Reglas especificas:

- `ID de finca` se usa como `nombre` del animal.
- La columna `Nombre` se ignora en inventario porque en el Excel oficial puede representar propietario, criador u operador.
- `Status` se conserva en `observaciones`; no cambia automaticamente el estado del animal.
- `Baja` se deja para revision manual; no cambia automaticamente el estado del animal.
- La vista previa devuelve advertencias con conteos de animales listos, omitidos sin DIIO, omitidos sin sexo y duplicados dentro del Excel.

Modelo `ImportacionExcel` guarda:

- archivo.
- modulos solicitados.
- hojas detectadas.
- resumen detectado.
- resultado.
- advertencias.
- usuario.

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

Endpoints porcinos:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/porcinos/camadas` | Reporte productivo de camadas |
| GET | `/porcinos/reproduccion` | Reporte reproductivo porcino por madre |
| GET | `/porcinos/tareas-camadas` | Reporte de actividades/tareas por camada |
| GET | `/porcinos/economia-camadas` | Reporte economico por camada |

Indicador IPG:

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

## Servicios internos

### `correoElectronico-service.js`

Responsable de:

- enviar correos via Resend.
- correos a administradores.
- correos de recuperacion de contrasena.

### `alertasCorreo-service.js`

Revisa y envia alertas:

- sanidad proxima.
- sanidad vencida.
- tareas automaticas de reproduccion proximas, vencidas o criticas.

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

## Compatibilidades mantenidas

- `RegistroSanitario` no se elimina, aunque el modulo principal es `PlanSanitario`.
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
