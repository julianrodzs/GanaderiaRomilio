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

Naturaleza:

- `Ingreso`
- `Egreso`

### Ventas de animales

Base:

```txt
/api/ventas
```

Modelo: `VentaAnimal`.

Funciones:

- registrar venta de uno o varios animales.
- calcular subtotal por animal.
- calcular monto total y peso total.
- impedir vender animales ya vendidos o muertos.
- actualizar animal al confirmar venta.
- crear evento de bitacora.
- crear movimiento financiero.
- revertir movimiento financiero al anular.

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
- Animal sin DIIO se omite.
- Potrero sin codigo/nombre se omite.
- Movimiento financiero sin campos minimos se omite.
- Registra historial en `ImportacionExcel`.

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
- proximo celo.
- parto estimado.
- destete proximo.

Frecuencia configurable por:

```env
EMAIL_ALERTS_INTERVAL_MS=
```

### `eventoAnimal-service.js`

Crea eventos de bitacora desde modulos.

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
- `Pesaje`
- `MovimientoFinanciero`
- `Costo`
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
