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
- CRUD inicial para costos.
- CRUD inicial para rotaciones.
- Servicio base para recuperacion de contrasena por correo.
- Middleware inicial para autenticacion con JWT.
- Modulo reservado para futuro conteo de ganado con drone e IA.

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
- `/api/costos`
- `/api/rotaciones`
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

Endpoint:

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/conteo-drone` | Muestra el estado del modulo futuro |

Este modulo queda reservado para una fase futura. No contiene logica de IA todavia.

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
