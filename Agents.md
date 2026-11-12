Actúa como un Arquitecto de Software Senior Full-Stack (Node.js, Express, Mongoose, React). Vamos a incorporar **Categorías / Tipos de Pesaje (`tipoPesaje`)** desde el **Plan Esencial** para ambas especies (**Bovino** y **Porcino**), conectando automáticamente el **Peso al Destete** con la ficha del animal en Inventario, su Bitácora y los Reportes existentes.

Antes de modificar archivos, inspecciona los modelos y servicios actuales de `Pesaje`, `Animal` (Inventario), `Bitacora` (o historial/eventos del animal) y `Reportes` (tanto en `backend/` como en `frontend/`).

---

### 1. Categorías de Pesaje (`tipoPesaje`) en el Modelo y API (Desde Plan Esencial)

1. **Modelo de Pesaje (`Pesaje`):**
   - Añade el campo `tipoPesaje` con los siguientes valores permitidos (enum):
     - `'REGULAR'` (Control / Regular — **valor por defecto** para retrocompatibilidad con los pesajes ya existentes)
     - `'NACIMIENTO'` (Peso al nacimiento)
     - `'DESTETE'` (Peso al destete)
     - `'ENTRADA_ENGORDE'` (Entrada a engorde / ceba)
     - `'SALIDA_VENTA'` (Salida / Pre-venta)
   - Añade un índice compuesto que incluya `{ organizacionId, fincaId, tipoPesaje, fecha }` para agilizar las consultas y reportes.
   - Asegura que esta funcionalidad esté disponible desde el **Plan Esencial** (`ESENCIAL`, `GESTION`, `PRO`, `PREMIUM`) sin bloqueos de plan.

2. **Ficha del Animal en `Inventario` (`Animal`):**
   - Verifica qué campos existen actualmente para nacimiento y destete en el modelo `Animal` (ej. `pesoNacimiento`, `pesoDestete`, `fechaDestete`, `edadDesteteDias`). Si falta alguno de estos campos (`pesoDestete`, `fechaDestete`, `edadDesteteDias`), agrégalo al esquema de `Animal` soportando tanto **Bovinos** como **Porcinos**.

---

### 2. Conexión Automática con Inventario y Bitácora al Registrar / Editar / Eliminar un Pesaje

1. **Cuando se crea o edita un pesaje con `tipoPesaje: 'DESTETE'`:**
   - **Sincronización con la Ficha del Animal (`Inventario`):**
     - Actualiza en el documento del animal (`Animal`):
       - `pesoDestete = pesaje.peso` (en kg).
       - `fechaDestete = pesaje.fecha`.
       - `edadDesteteDias`: si el animal tiene `fechaNacimiento`, calcula los días transcurridos entre `fechaNacimiento` y `pesaje.fecha` (si no tiene `fechaNacimiento` o es inválida, déjalo en `null`).
     - Actualiza también `pesoActual` (y fecha de último pesaje) si este pesaje es el más reciente del animal.
     - Si el sistema recalcula la categoría/etapa productiva del animal al destetarse, ejecuta la actualización correspondiente sin romper la categoría si ya estaba en una etapa posterior.
     - **Unicidad lógica de destete por animal:** si el animal ya tenía otro registro de `Pesaje` anterior marcado como `'DESTETE'`, actualiza ese registro o asegúrate de que la ficha refleje el pesaje de destete vigente (o muestra/maneja la actualización limpiamente para no duplicar destetes incoherentes).
   - **Registro automático en la `Bitácora` del animal:**
     - Crea (o actualiza si se edita el pesaje) el evento correspondiente en la Bitácora / Historial del animal indicando claramente el hito de **Destete**:
       - Incluye fecha, peso al destete (kg), edad al destete en días (si tiene `fechaNacimiento`) y ganancia diaria de peso pre-destete (GDP desde nacimiento hasta destete, si cuenta con `pesoNacimiento` y `fechaNacimiento`).
       - Vincula el evento al `pesajeId` para trazabilidad y para evitar eventos huérfanos o duplicados si se edita o elimina el pesaje.

2. **Cuando se crea o edita un pesaje con `tipoPesaje: 'NACIMIENTO'`:**
   - Si el animal no tenía `pesoNacimiento` en su ficha (o se actualiza el pesaje de nacimiento), sincroniza `pesoNacimiento` en el documento `Animal`.

3. **Cuando se cambia el `tipoPesaje` de `'DESTETE'` a otro tipo o se elimina ese pesaje:**
   - Revisa si existe otro pesaje con `tipoPesaje: 'DESTETE'` para ese animal; si no existe ninguno creado desde pesajes y el destete provenía de ese pesaje, limpia o recalcula `pesoDestete`, `fechaDestete` y `edadDesteteDias` en la ficha del animal y actualiza/elimina el evento asociado en la Bitácora.

---

### 3. Formulario de Pesajes y Ficha del Animal en Frontend

1. **Formulario de Crear / Editar Pesaje (Individual y Lote/Masivo si aplica):**
   - Agrega el selector **"Tipo de pesaje"** con etiquetas legibles en español:
     - `Control / Regular` (`REGULAR`)
     - `Peso al nacimiento` (`NACIMIENTO`)
     - `Peso al destete` (`DESTETE`)
     - `Entrada a engorde / ceba` (`ENTRADA_ENGORDE`)
     - `Salida / Pre-venta` (`SALIDA_VENTA`)
   - Cuando el usuario seleccione **`Peso al destete`**, muestra una breve nota informativa en el formulario: *"Actualizará automáticamente el peso y fecha de destete en la ficha del animal y registrará el evento en su bitácora."*
2. **Listado de Pesajes y Ficha del Animal:**
   - Muestra un badge estilizado con el tipo de pesaje (`Regular`, `Nacimiento`, `Destete`, `Entrada a engorde`, `Salida / Venta`) en la tabla de pesajes y en el historial de pesajes dentro de la ficha del animal.
   - En la ficha del animal (tanto para **Bovinos** como para **Porcinos**), muestra los datos de destete (`Peso al destete`, `Fecha de destete`, `Edad al destete`) cuando estén registrados.

---

### 4. Ajuste de los Reportes Existentes (Destete para Ambas Especies + Filtro por Tipo de Pesaje)

**Importante:** Ya contamos con reportes de destete y de pesajes en el módulo de `Reportes`. **No crees una pantalla duplicada desde cero**; adapta los reportes existentes bajo estas reglas:

1. **Reporte de Destete existente (se mantiene en su sección aparte actual):**
   - Haz que el reporte de destete funcione para **ambas especies (`Bovino` y `Porcino`)** respetando el filtro de especie activo en `Reportes`.
   - Alimenta este reporte basándose en los pesajes con `tipoPesaje: 'DESTETE'` (manteniendo retrocompatibilidad con animales que ya tuvieran `pesoDestete` cargado en su ficha de `Animal` antes de este cambio, sin duplicar al mismo animal).
2. **Reporte General de Pesajes:**
   - Añade un **filtro por Tipo de Pesaje (`tipoPesaje`)**:
     - `Todos (excepto Destete)` o `Todos`
     - `Control / Regular`
     - `Peso al nacimiento`
     - `Entrada a engorde / ceba`
     - `Salida / Pre-venta`
     - `Peso al destete`
   - Mantén el bloque/reporte especializado de **Destete** por separado tal como ya está estructurado hoy en `Reportes`, mientras que en el reporte general de pesajes el usuario puede filtrar por cualquiera de las categorías de pesaje (y ver la columna de `Tipo de pesaje` formateada con badges limpios, nunca el enum crudo como `ENTRADA_ENGORDE`).
   - Incluye la columna `Tipo de pesaje` con formato legible en las exportaciones a Excel/PDF del reporte de pesajes.

---

### 5. Pruebas y Verificación
1. Agrega o actualiza pruebas en el backend verificando:
   - Creación de pesaje con `tipoPesaje: 'DESTETE'` en un **Bovino** y en un **Porcino** (en una organización con plan `ESENCIAL`), comprobando que se actualizan `pesoDestete`, `fechaDestete` y `edadDesteteDias` en `Animal` y se crea el registro en `Bitácora`.
   - Edición y eliminación de un pesaje de destete manteniendo la consistencia en la ficha del animal.
   - Filtrado por `tipoPesaje` en el endpoint de pesajes/reportes y funcionamiento del reporte de destete para ambas especies.
2. Verifica que el build de `frontend` y los tests de `backend` pasen sin errores.