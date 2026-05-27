# Agente Fullstack - GanaderiaRomilio

Actúa como programador fullstack senior para este proyecto de gestión ganadera.

## Proyecto actual
El proyecto ya existe y tiene esta estructura:

- backend/
  - controllers/
  - documentation/
  - middleware/
  - models/
  - node_modules/
  - routes/
  - server/
  - services/
  - .env
  - app.js
  - database.js
  - index.js
  - package.json
- frontend/

No recrees el proyecto desde cero. Trabaja sobre esta estructura.

## Stack
Backend:
- Node.js
- Express
- MongoDB
- Mongoose
- dotenv
- cors

Frontend:
- React + Vite
- CSS modular o Tailwind si ya está configurado
- Axios para consumir la API

## Objetivo
Construir una app para administrar una finca ganadera llamada GanaderiaRomilio.

Módulos principales:
- Dashboard
- Inventario de ganado
- Potreros
- Rotaciones
- Pesajes
- Sanidad
- Costos
- Futuro conteo de ganado con drone e IA

## Reglas importantes
- No borres archivos sin preguntar.
- No cambies toda la arquitectura sin justificarlo.
- Usa código limpio y modular.
- Mantén modelos, rutas y controladores separados.
- Usa nombres consistentes en español.
- Antes de modificar, explica brevemente el plan.
- Después de modificar, lista los archivos cambiados.
- Si algo falta, crea lo mínimo necesario y continúa.

## Backend esperado

Crear o completar estos modelos:

### Animal
Campos sugeridos:
- identificadorFinca
- diio
- nombre
- sexo
- raza
- fechaNacimiento
- pesoActual
- estado
- potreroActual
- fotoUrl
- observaciones

### Potrero
Campos sugeridos:
- codigo
- nombre
- capacidadMaxima
- ubicacion
- estado
- observaciones

### Pesaje
Campos sugeridos:
- animal
- fecha
- peso
- aumentoKg
- diasDesdeUltimoPesaje
- observaciones

### RegistroSanitario
Campos sugeridos:
- animal
- fecha
- tipo
- producto
- dosis
- viaAplicacion
- responsable
- proximaAplicacion
- observaciones

### Costo
Campos sugeridos:
- fecha
- categoria
- descripcion
- monto
- proveedor
- comprobante
- observaciones

### RotacionPotrero
Campos sugeridos:
- potrero
- lote
- fechaEntrada
- fechaSalida
- numeroAnimales
- estado
- observaciones

## Rutas esperadas

Crear CRUD para:
- /api/animales
- /api/potreros
- /api/pesajes
- /api/sanidad
- /api/costos
- /api/rotaciones

## Frontend esperado

Crear pantallas iniciales:
- Dashboard
- Inventario
- Potreros
- Costos

Usar una navegación inferior o lateral similar al prototipo:
- Dashboard
- Inventario
- Potreros
- Costos

## Diseño visual
Inspirarse en el prototipo Field & Flocks:
- Verde oscuro como color principal
- Fondo claro
- Tarjetas con bordes suaves
- Tablas limpias
- Botones verdes
- Estilo responsive para móvil y escritorio

## Prioridad inmediata

Primero revisa la estructura actual del backend y haz lo siguiente:

1. Verifica app.js, index.js y database.js.
2. Configura Express correctamente.
3. Conecta MongoDB usando .env.
4. Crea modelos principales.
5. Crea rutas y controladores para animales.
6. Prueba endpoint GET /api/animales.
7. Luego continúa con potreros.

No empieces con la IA del drone todavía.
Solo deja preparado un módulo futuro llamado conteoDrone.