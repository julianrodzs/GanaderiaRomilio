# GanaderiaRomilio

Aplicacion web fullstack para administrar una finca ganadera orientada a cria, ahora preparada para manejar bovinos y porcinos sin duplicar el menu principal: inventario, reproduccion, camadas, sanidad, potreros, tareas, finanzas, compras, ventas, reportes, importacion Excel, conteo por drone y alertas por correo.

## Estado actual

La aplicacion ya cuenta con:

- Autenticacion con JWT.
- Roles `Administrador`, `Encargado` y `Consulta`.
- Recuperacion segura de contrasena por correo con token temporal.
- Administracion de usuarios.
- Inventario de animales con detalle, genealogia basica, datos productivos y bitacora.
- Selector interno de especie `Bovino` / `Porcino` en modulos animales.
- Inventario porcino con camadas.
- Potreros con area, estado, actividades recientes y rotaciones.
- Reproduccion/Gestacion bovina con parto estimado, parto real, destete y proximo celo estimado.
- Reproduccion porcina con inseminacion/monta, fechas calculadas y tareas automaticas.
- Plan Sanitario centralizado con alertas.
- Pesajes historicos por animal.
- Finanzas unificadas con movimientos financieros.
- Ventas formales de animales.
- Reportes de cria, productividad, finanzas, ventas, partos, vacas improductivas, crecimiento por pesajes, productos/insumos y porcinos/camadas.
- Tareas asignadas por usuario.
- Importacion Excel por modulos.
- Conteo por drone con backend Node y servicio IA separado en Python/FastAPI.
- PWA instalable con soporte offline inicial para trabajadores.
- Despliegue preparado para Vercel, Render y MongoDB Atlas.

## Estructura

```txt
GanaderiaRomilio/
  backend/       API Node.js + Express + MongoDB
  frontend/      React + Vite + PWA
  ia-service/    FastAPI + YOLO para conteo por drone
```

## Stack

- Frontend: React 19, Vite, vite-plugin-pwa
- Backend: Node.js, Express, Mongoose, bcrypt, multer, xlsx
- Base de datos: MongoDB Atlas
- Correos: Resend
- IA drone: FastAPI, YOLO, ultralytics, OpenCV
- Despliegue: Vercel para frontend, Render para backend

## Desarrollo local

Backend:

```bash
cd backend
npm install
npm run dev
```

Por defecto corre en:

```txt
http://localhost:4000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Por defecto corre en:

```txt
http://localhost:5173
```

Servicio IA:

```bash
cd ia-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

El modelo YOLO debe ir en:

```txt
ia-service/models/best.pt
```

## Variables de entorno

Backend: copiar `backend/.env.example` a `backend/.env`.

Variables principales:

```env
PORT=4000
MONGODB_URI=
FRONTEND_URL=http://localhost:5173
JWT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=Ganaderia Romilio <notificaciones@alertas.ganaderiaromilio.com>
EMAIL_PASSWORD_RESET_FROM=Ganaderia Romilio <notificaciones@alertas.ganaderiaromilio.com>
EMAIL_ADMIN=
EMAIL_TEST_TO=
EMAIL_ALERTS_ENABLED=true
EMAIL_ALERTS_INTERVAL_MS=
IA_SERVICE_URL=
```

Frontend: copiar `frontend/.env.example` a `frontend/.env`.

```env
VITE_API_URL=http://localhost:4000/api
```

## Modulos principales

### Seguridad y usuarios

- Login con JWT.
- Rutas privadas protegidas en backend.
- Roles preparados:
  - `Administrador`: acceso completo.
  - `Encargado`: acceso limitado, especialmente tareas y vistas operativas.
  - `Consulta`: rol preparado para solo lectura.
- Recuperacion de contrasena:
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`
  - Token aleatorio con `crypto.randomBytes`.
  - En base de datos solo se guarda el hash del token.
  - Expira en 30 minutos.
  - Se invalida tras el primer uso.

### Especies

La aplicacion mantiene el menu principal limpio y usa un selector interno de especie donde aplica:

- `Bovino`
- `Porcino`

La especie por defecto es `Bovino`. Los modulos que usan selector son:

- Inventario
- Pesajes
- Sanidad
- Reproduccion
- Compras
- Ventas
- Reportes

En porcinos, el identificador visual se presenta como DIIO o identificador interno segun la pantalla.

### Inventario

Administra animales con:

- DIIO e identificador de finca.
- especie.
- sexo, raza, estado.
- madre y padre por DIIO.
- fecha nacimiento, compra, venta, muerte y destete.
- peso nacimiento, peso destete, peso actual, peso compra y peso venta.
- precios por kilo de compra/venta.
- detalle con bitacora e historial de pesajes.

En porcinos, Inventario permite alternar entre:

- Lista de animales porcinos.
- Camadas porcinas.

### Bitacora animal

`EventoAnimal` centraliza eventos historicos del animal:

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

Los modulos crean eventos automaticamente cuando aplica.

### Potreros y rotaciones

Potreros incluyen:

- codigo, nombre, area, capacidad, ubicacion.
- ultima aplicacion de herbicida.
- ultima chapia.
- ultima fertilizacion.
- estado.

Rotaciones guardan historico de entrada/salida, dias de ocupacion y descanso.

### Reproduccion/Gestacion bovina

Gestiona registros reproductivos por animal:

- fecha monta.
- parto estimado.
- parto real.
- proximo celo estimado.
- fecha destete.
- estado calculado.

El proximo celo se estima desde el ultimo parto:

```txt
fechaPartoReal + 60 dias
luego ciclos de 21 dias hasta encontrar el siguiente celo futuro
```

Tambien permite crear terneros desde un parto y relacionarlos con la madre.

### Reproduccion porcina

Para porcinos, el mismo modulo de Reproduccion permite registrar inseminacion/monta de una chancha.

Campos principales:

- animal.
- especie `Porcino`.
- fecha de inseminacion/monta.
- destino de crias:
  - `Se quedan`
  - `Se venden`
  - `Engorde`
  - `No definido`
- cantidad estimada de crias.
- observaciones.

Fechas calculadas desde la inseminacion:

- revisar celo: +21 dias.
- parto estimado: +118 dias.
- ventana de parto: parto estimado +/- 3 dias.
- desparasitar antes del parto: parto estimado -30 dias.
- alimento de lactancia: parto estimado -15 dias.
- destete estimado: parto +31 dias.
- nueva inseminacion/monta: destete +21 dias.
- revisar celo posterior: nueva inseminacion +21 dias.

Al crear o actualizar un ciclo porcino se generan tareas automaticas para la chancha. Las tareas de crias ahora nacen desde la camada, no desde el parto estimado, para que dependan de nacimientos reales.

### Camadas porcinas

Modelo `Camada`.

Se puede crear desde:

- Reproduccion, al registrar parto o parto estimado de una chancha.
- Inventario, en la vista de porcinos > camadas.

Campos principales:

- madre.
- registro reproductivo relacionado.
- codigo de camada.
- fecha nacimiento.
- fecha destete estimada y real.
- nacidos totales.
- nacidos vivos.
- nacidos muertos.
- momias.
- destetados.
- muertos pre-destete.
- destino.
- estado.
- pesos promedio de nacimiento/destete.
- tareas generadas.

Estados:

- `Activa`
- `Destetada`
- `Vendida`
- `Cerrada`
- `Cancelada`

Cuando se crea una camada, se generan tareas automaticas segun destino:

- base: hierro, vitaminizar/desparasitar, destete, desparasitar en destete, vitamina con selenio, nueva inseminacion de la madre y revision de celo posterior.
- `Se quedan`: alimento inicio, desarrollo, engorde, circovirus y primera monta.
- `Se venden`: venta estimada.
- `Engorde`: alimento inicio, desarrollo, engorde y sacrificio.
- `Mixto`: combina reglas de crias que se quedan y se venden.

Al registrar destete real:

- la camada pasa a `Destetada`.
- se completan tareas automaticas relacionadas con destete.
- se recalculan tareas posteriores usando la fecha real de destete.

### Sanidad

Modulo principal: `PlanSanitario`.

Permite planes por grupo o animales especificos:

- grupo de ganado.
- actividad.
- producto, marca, dosis.
- fecha aplicacion.
- frecuencia.
- proxima aplicacion calculada.
- estado calculado: vigente, proximo, vencido o aplicado.

El modelo `RegistroSanitario` se mantiene por compatibilidad.

### Pesajes historicos

Cada pesaje es un registro independiente:

- animal.
- fecha.
- peso.
- observaciones.

Al crear pesaje:

- actualiza `pesoActual` en Animal.
- crea evento de bitacora.

### Finanzas

Modelo principal: `MovimientoFinanciero`.

Unifica:

- planillas.
- inversiones.
- compras.
- ventas de animales.
- compras de animales.

Permite clasificar por naturaleza:

- `Ingreso`
- `Egreso`

El modelo `Costo` queda por compatibilidad.

### Compras de animales

Modulo formal para compras:

- fecha de compra.
- proveedor.
- varios animales por compra.
- identificador provisional o DIIO.
- peso compra y precio por kg.
- subtotal por animal.
- total por compra.
- comprobante.
- estado: pendiente, confirmada o anulada.

Al confirmar compra:

- crea animales nuevos en inventario.
- registra peso y precio de compra.
- deja el animal activo.
- crea evento en bitacora.
- crea movimiento financiero de egreso.

### Ventas de animales

Modulo formal para ventas:

- fecha de venta.
- comprador.
- varios animales por venta.
- peso venta y precio por kg.
- subtotal por animal.
- total por venta.
- comprobante.
- estado: pendiente, confirmada o anulada.

Al confirmar venta:

- actualiza estado del animal a `Vendido`.
- guarda fecha, peso y precio de venta.
- crea evento en bitacora.
- crea movimiento financiero de ingreso.

### Reportes

Incluye:

- resumen general de finca.
- IPG: Indice de Productividad Ganadera.
- finanzas de cria.
- sustentabilidad de cria.
- partos por vaca y ano.
- vacas improductivas.
- crecimiento por pesajes.
- ventas por mes.
- ventas por origen.
- rotacion de inventario vendido.
- productos e insumos.
- reporte de camadas porcinas.
- reporte reproductivo porcino.
- reporte de tareas por camada.
- reporte economico por camada.

### Tareas

Permite asignar tareas a usuarios:

- titulo, descripcion, tipo.
- responsable.
- prioridad.
- estado.
- fecha programada y limite.
- relacion opcional con potrero o animal.
- comentarios y evidencia.

Administrador puede gestionar todas. Encargado ve y actualiza sus tareas.

Las tareas automaticas de reproduccion/camadas usan:

- `moduloOrigen: Reproduccion`
- `referenciaId`: id del registro reproductivo o camada.
- `creadoAutomaticamente: true`
- `especie: Porcino`
- `categoriaAutomatica`
- `claveAutomatica`

Esto permite actualizarlas o cancelarlas sin tocar tareas manuales.

### Importacion Excel

El importador actual trabaja por modulos:

- Inventario
- Potreros
- Pesajes
- Finanzas
- Rotaciones

Reglas:

- El usuario elige que modulos procesar.
- El Excel puede tener varias hojas o ser especifico de un modulo.
- Los campos opcionales vacios no borran datos existentes.
- Inventario se detecta por hojas que contengan `INVENTARIO` en el nombre o por hojas con encabezados minimos `DIIO` y `Sexo`.
- Animales sin DIIO se omiten.
- Animales sin sexo se omiten.
- DIIO repetido dentro del mismo Excel se omite despues de la primera aparicion.
- Potreros sin codigo/nombre se omiten.
- Finanzas sin datos minimos se omite.
- Si un animal ya existe por DIIO o identificador de finca, se actualizan solo campos con valor.
- Si un animal no existe, se crea.
- Se guarda historial en `ImportacionExcel`.

#### Inventario Excel

El importador de inventario ya no depende de la hoja antigua de control de peso. El formato principal esperado es una tabla de inventario con encabezados.

Deteccion de hoja:

- Nombre de hoja que incluya `INVENTARIO`.
- O cualquier hoja que tenga columnas reconocibles para `DIIO` y `Sexo`.

Campos minimos por fila:

- `DIIO`.
- `Sexo`.

Columnas aceptadas:

| Campo en Animal | Nombres de columna aceptados |
| --- | --- |
| `diio` | `DIIO`, `Arete`, `Numero DIIO`, `Número DIIO` |
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
| observacion de importacion | `Estado`, `Status` |

Notas:

- `ID de finca` se interpreta como nombre o alias del animal.
- La columna generica `Nombre` del formato oficial se ignora para evitar confundirla con el nombre del propietario, criador u operador.
- `Status` no cambia automaticamente el estado del animal; se guarda como observacion para revision manual.
- La fecha de baja no cambia el estado automaticamente por ahora; se revisa manualmente.
- En la vista previa se reportan animales listos, omitidos sin DIIO, omitidos sin sexo y duplicados dentro del Excel.

### Drone

Backend Node recibe imagen, potrero y cantidad esperada.

Servicio IA separado:

```txt
POST /detectar-vacas
```

Devuelve:

- cantidad detectada.
- confianza promedio.
- detecciones.
- imagen procesada.

## Correos y alertas

El backend usa Resend.

Alertas actuales:

- Sanidad proxima.
- Sanidad vencida.
- Proximo celo estimado.
- Parto estimado proximo.
- Destete proximo.

Destinatarios:

- Si `EMAIL_TEST_TO` existe, se envia solo a ese correo.
- Si no, se envia a usuarios con rol `Administrador`.
- Si no hay administradores, usa `EMAIL_ADMIN`.

## PWA y modo movil

El frontend esta configurado como PWA:

- manifest.
- service worker.
- cache basico.
- instalable desde navegador.
- soporte offline inicial.
- IndexedDB para datos de trabajadores:
  - tareas.
  - inventario basico.
  - gestacion.
  - potreros.
  - cambios pendientes.

## Despliegue

Frontend en Vercel:

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Variable: `VITE_API_URL=https://TU_BACKEND.onrender.com/api`

Backend en Render:

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Variables: ver `backend/.env.example`

Guias:

- `DEPLOY_VERCEL.md`
- `DEPLOY_RENDER.md`

## Seguridad

No subir secretos al repositorio:

- `.env`
- `backend/.env`
- `frontend/.env`
- llaves de Resend.
- URI real de MongoDB.

La recuperacion de contrasena no usa JWT. El login si usa JWT.

## Verificacion rapida

Frontend:

```bash
cd frontend
npm run build
```

Backend:

```bash
cd backend
node -e "require('./app'); console.log('backend ok')"
```

## Documentacion adicional

- Backend: `backend/documentation/backend-inicial.md`
- Reportes: `backend/documentation/reportes.md`
- IA drone: `ia-service/README.md`
- Despliegue Vercel: `DEPLOY_VERCEL.md`
- Despliegue Render: `DEPLOY_RENDER.md`
