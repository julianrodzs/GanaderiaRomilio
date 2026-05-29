# Documentacion inicial del backend

## Proyecto

GanaderiaRomilio es una API REST para administrar informacion basica de una finca ganadera.

Por ahora el backend incluye:

- Configuracion de Express.
- Conexion a MongoDB con Mongoose.
- Modelos principales de la finca.
- CRUD inicial para animales.
- CRUD inicial para potreros.
- CRUD inicial para pesajes.
- CRUD inicial para sanidad.
- Modulo central de Plan Sanitario.
- CRUD inicial para costos.
- CRUD inicial para rotaciones.
- Servicio base para recuperacion de contrasena por correo.
- Middleware inicial para autenticacion con JWT.
- Modulo de importacion de Excel con vista previa sin insertar datos.
- Modulo de Conteo Drone con servicio IA simulado.

## Stack

- Node.js
- Express
- MongoDB
- Mongoose
- dotenv
- cors

## Archivos principales

### `app.js`

Configura la aplicacion Express:

- Puerto desde `process.env.PORT` o `4000`.
- Middleware `cors`.
- Middleware `express.json`.
- Rutas principales de la API.

Rutas registradas actualmente:

- `/api/usuarios`
- `/api/animales`
- `/api/potreros`
- `/api/pesajes`
- `/api/sanidad`
- `/api/plan-sanitario`
- `/api/costos`
- `/api/rotaciones`
- `/api/importar`
- `/api/conteo-drone`

### `index.js`

Es el punto de entrada del backend.

Responsabilidades:

- Cargar variables de entorno con `dotenv`.
- Conectar a MongoDB.
- Iniciar el servidor Express.

### `database.js`

Centraliza la conexion a MongoDB.

Usa la variable:

```env
MONGODB_URI=mongodb://localhost/dataganado
```

Si no existe `MONGODB_URI`, usa como respaldo:

```txt
mongodb://localhost/dataganado
```

## Ejecutar el backend

Desde la carpeta `backend`:

```bash
npm run dev
```

O directamente:

```bash
node index.js
```

La API queda disponible por defecto en:

```txt
http://localhost:4000
```

## Endpoints disponibles

### Usuarios y recuperacion de contrasena

Base:

```txt
/api/usuarios
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/usuarios` | Lista usuarios |
| POST | `/api/usuarios` | Crea un usuario |
| POST | `/api/usuarios/recuperar-contrasena` | Solicita recuperacion de contrasena |
| POST | `/api/usuarios/restablecer-contrasena` | Restablece contrasena usando token |
| GET | `/api/usuarios/:id` | Obtiene un usuario por ID |
| PUT | `/api/usuarios/:id` | Actualiza un usuario |
| DELETE | `/api/usuarios/:id` | Elimina un usuario |

Body para solicitar recuperacion:

```json
{
  "correo": "admin@ganaderiaromilio.com"
}
```

Body para restablecer contrasena:

```json
{
  "token": "token-recibido",
  "contrasena": "nueva-contrasena"
}
```

### Animales

Base:

```txt
/api/animales
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/animales` | Lista todos los animales |
| POST | `/api/animales` | Crea un animal |
| GET | `/api/animales/:id` | Obtiene un animal por ID |
| PUT | `/api/animales/:id` | Actualiza un animal |
| DELETE | `/api/animales/:id` | Elimina un animal |

Ejemplo de body para crear un animal:

```json
{
  "identificadorFinca": "ROM-001",
  "diio": "123456789",
  "nombre": "Lucera",
  "sexo": "Hembra",
  "raza": "Brahman",
  "fechaNacimiento": "2024-03-10",
  "pesoActual": 320,
  "estado": "Activo",
  "observaciones": "Animal registrado inicialmente"
}
```

Valores permitidos para `sexo`:

- `Macho`
- `Hembra`

Valores permitidos para `estado`:

- `Activo`
- `Vendido`
- `Muerto`
- `En tratamiento`

### Potreros

Base:

```txt
/api/potreros
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/potreros` | Lista todos los potreros |
| POST | `/api/potreros` | Crea un potrero |
| GET | `/api/potreros/:id` | Obtiene un potrero por ID |
| PUT | `/api/potreros/:id` | Actualiza un potrero |
| DELETE | `/api/potreros/:id` | Elimina un potrero |

Ejemplo de body para crear un potrero:

```json
{
  "codigo": "POT-001",
  "nombre": "Potrero Principal",
  "capacidadMaxima": 25,
  "ubicacion": "Sector norte",
  "estado": "Disponible",
  "observaciones": "Potrero listo para rotacion"
}
```

Valores permitidos para `estado`:

- `Disponible`
- `Ocupado`
- `Descanso`
- `Mantenimiento`

### Conteo Drone

Base:

```txt
/api/conteo-drone
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/conteo-drone` | Lista conteos por drone |
| POST | `/api/conteo-drone/procesar` | Sube imagen y genera conteo simulado |
| GET | `/api/conteo-drone/:id` | Obtiene un conteo por ID |
| DELETE | `/api/conteo-drone/:id` | Elimina un conteo |

El `POST /procesar` usa `multipart/form-data`.

Campos:

- `imagen`: archivo de imagen.
- `potrero`: ID del potrero.
- `cantidadEsperada`: numero esperado en el potrero.
- `observaciones`: opcional.

Por ahora la IA esta simulada en:

```txt
backend/services/iaConteoService.js
```

La funcion queda lista para reemplazarse por una llamada HTTP a un servicio Python + FastAPI con YOLO.

Riesgos actuales:

- La cantidad detectada es simulada; no debe usarse para decisiones reales.
- No hay validacion de calidad de imagen, altura de vuelo, escala ni angulo.
- La imagen procesada usa la misma URL que la original porque aun no hay cajas reales dibujadas.
- No se borran archivos fisicos al eliminar un registro.
- Falta autenticacion/autorizacion sobre carga y consulta de imagenes.
- El rendimiento y almacenamiento pueden crecer rapido si se suben imagenes grandes.
- El modelo futuro YOLO puede requerir calibracion local para ganado, potreros, sombras y oclusiones.

### Pesajes

Base:

```txt
/api/pesajes
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/pesajes` | Lista todos los pesajes |
| POST | `/api/pesajes` | Crea un pesaje |
| GET | `/api/pesajes/:id` | Obtiene un pesaje por ID |
| PUT | `/api/pesajes/:id` | Actualiza un pesaje |
| DELETE | `/api/pesajes/:id` | Elimina un pesaje |

### Sanidad

Base:

```txt
/api/sanidad
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/sanidad` | Lista registros sanitarios |
| POST | `/api/sanidad` | Crea un registro sanitario |
| GET | `/api/sanidad/:id` | Obtiene un registro sanitario por ID |
| PUT | `/api/sanidad/:id` | Actualiza un registro sanitario |
| DELETE | `/api/sanidad/:id` | Elimina un registro sanitario |

### Plan Sanitario

Base:

```txt
/api/plan-sanitario
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/plan-sanitario` | Lista planes sanitarios |
| POST | `/api/plan-sanitario` | Crea un plan sanitario |
| GET | `/api/plan-sanitario/alertas` | Lista planes vencidos y proximos |
| PUT | `/api/plan-sanitario/:id` | Actualiza un plan sanitario |
| DELETE | `/api/plan-sanitario/:id` | Elimina un plan sanitario |
| PATCH | `/api/plan-sanitario/:id/marcar-aplicado` | Marca un plan como aplicado |

Ejemplo de body:

```json
{
  "grupoGanado": "Todo el ganado",
  "actividad": "Desparasitacion interna",
  "producto": "Bimectin 3.5%",
  "marca": "Bimectin",
  "dosis": "1 cc",
  "criterioPeso": "Por cada 50 kg",
  "fechaAplicacion": "2026-05-28",
  "frecuenciaCantidad": 3,
  "frecuenciaUnidad": "meses",
  "responsable": "Administrador",
  "observaciones": "Plan general de desparasitacion"
}
```

Notas:

- `proximaAplicacion` se calcula automaticamente.
- `estado` se calcula como `Vencido`, `Próximo` o `Vigente`.
- `RegistroSanitario` queda disponible por compatibilidad, pero el modulo principal es `PlanSanitario`.

### Costos

Base:

```txt
/api/costos
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/costos` | Lista todos los costos |
| POST | `/api/costos` | Crea un costo |
| GET | `/api/costos/:id` | Obtiene un costo por ID |
| PUT | `/api/costos/:id` | Actualiza un costo |
| DELETE | `/api/costos/:id` | Elimina un costo |

### Rotaciones

Base:

```txt
/api/rotaciones
```

Endpoints:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/rotaciones` | Lista todas las rotaciones |
| POST | `/api/rotaciones` | Crea una rotacion |
| GET | `/api/rotaciones/:id` | Obtiene una rotacion por ID |
| PUT | `/api/rotaciones/:id` | Actualiza una rotacion |
| DELETE | `/api/rotaciones/:id` | Elimina una rotacion |

### Importacion de Excel

Base:

```txt
/api/importar
```

Endpoint:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| POST | `/api/importar/excel` | Sube un `.xlsx` y devuelve vista previa sin insertar |
| POST | `/api/importar/excel/confirmar` | Inserta en MongoDB los registros validados de la vista previa |
| POST | `/api/importar/excel/importar` | Sube un `.xlsx` e importa directamente los datos validos |

El request debe enviarse como `multipart/form-data`.

Campo del archivo:

```txt
archivo
```

Ejemplo en Postman o Insomnia:

- Method: `POST`
- URL: `http://localhost:4000/api/importar/excel`
- Body: `form-data`
- Key: `archivo`
- Type: `File`
- Value: archivo `.xlsx`

Respuesta esperada de la vista previa:

```json
{
  "mensaje": "Vista previa generada. No se inserto ningun dato en la base de datos.",
  "resumen": {
    "Animal": 59,
    "Potrero": 14,
    "Pesaje": 22,
    "RegistroSanitario": 0,
    "Costo": 0,
    "RotacionPotrero": 6
  },
  "hojasDetectadas": [],
  "preview": {},
  "registros": {},
  "advertencias": []
}
```

Mapeo actual del archivo del cliente:

- `CONTROL DE PESO,`: animales con DIIO y pesajes relacionados.
- `ROTACIÓN POTREROS`: potreros inferidos y rotaciones.

Notas importantes:

- `POST /api/importar/excel` no inserta nada en MongoDB.
- `POST /api/importar/excel/confirmar` inserta datos enviados en `registros`.
- `POST /api/importar/excel/importar` procesa el archivo e inserta directamente sin vista previa.
- Animal evita duplicados por `identificadorFinca`.
- Potrero evita duplicados por `codigo`.
- Los pesajes resuelven el animal usando `diio`.
- Las rotaciones resuelven el potrero usando `codigo`.
- Por ahora se omiten costos, planillas, inversion, sanidad y la hoja de peso que no trae DIIO.

## Autenticacion

Existe un middleware inicial en:

```txt
backend/middleware/auth.js
```

Uso esperado en rutas protegidas:

```js
const { auth } = require('../middleware/auth');

router.get('/privado', auth, controlador);
```

El cliente debe enviar:

```txt
Authorization: Bearer <token>
```

Variable requerida:

```env
JWT_SECRET=valor-secreto
```

Por ahora el middleware verifica tokens JWT firmados con HS256 usando `crypto`. Falta crear el login formal que emita los tokens.

## Correo electronico

Existe un servicio inicial en:

```txt
backend/services/correoElectronico-service.js
```

Responsabilidades actuales:

- Crear token de recuperacion de contrasena.
- Preparar enlace de recuperacion usando `FRONTEND_URL`.
- En desarrollo imprime el correo preparado en consola.

Pendiente para envio real:

- Configurar proveedor SMTP o servicio externo.
- Instalar y conectar una libreria de envio como `nodemailer`, si se decide usar SMTP.

## Modelos actuales

### Animal

Campos principales:

- `identificadorFinca`
- `diio`
- `nombre`
- `sexo`
- `raza`
- `fechaNacimiento`
- `pesoActual`
- `estado`
- `potreroActual`
- `fotoUrl`
- `observaciones`

### Potrero

Campos principales:

- `codigo`
- `nombre`
- `capacidadMaxima`
- `ubicacion`
- `estado`
- `observaciones`

### Pesaje

Campos principales:

- `animal`
- `fecha`
- `peso`
- `aumentoKg`
- `diasDesdeUltimoPesaje`
- `observaciones`

### RegistroSanitario

Campos principales:

- `animal`
- `fecha`
- `tipo`
- `producto`
- `dosis`
- `viaAplicacion`
- `responsable`
- `proximaAplicacion`
- `observaciones`

### Costo

Campos principales:

- `fecha`
- `categoria`
- `descripcion`
- `monto`
- `proveedor`
- `comprobante`
- `observaciones`

### RotacionPotrero

Campos principales:

- `potrero`
- `lote`
- `fechaEntrada`
- `fechaSalida`
- `numeroAnimales`
- `estado`
- `observaciones`

## Prueba realizada

Se probo el endpoint:

```txt
GET /api/animales
```

Resultado:

```txt
STATUS 200
[]
```

Esto indica que la ruta esta funcionando y que la coleccion de animales esta vacia por ahora.

## Pendiente recomendado

- Crear login formal y emision de tokens JWT.
- Proteger rutas privadas con `auth`.
- Agregar hashing de contrasenas antes de guardar usuarios.
- Configurar envio real de correos.
- Conectar el frontend React con Axios.
- Crear pantallas iniciales: Dashboard, Inventario, Potreros y Costos.
