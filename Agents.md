Actúa como un Arquitecto de Software Senior Full-Stack (Node.js/Express, Mongoose, React). Vamos a ejecutar la **Fase 1 de Optimización de Ancho de Banda y Memoria RAM (512 MB en Render)** basándonos en los hallazgos de tu diagnóstico.

**REGLA DE ORO DE COMPATIBILIDAD:**
NO cambies la forma ni el contrato de respuesta JSON de los endpoints de listado (`/api/animales`, `/api/pesajes`, `/api/finanzas`, `/api/tareas`) ni introduzcas paginación obligatoria que rompa los buscadores/filtros locales del frontend o el almacenamiento de `IndexedDB` del Modo Offline. Todas las optimizaciones deben ser 100% transparentes para la UI actual.

---

### 1. Eliminar las Descargas Repetidas de Fotos Privadas de Animales (Ancho de Banda de Render)

**Problema detectado:** `api.js (línea 100)` pide los archivos protegidos (`/api/archivos/r2/:id`) con `cache: 'no-store'` y `useArchivoProtegido.js (línea 7)` descarga el blob en cada montaje y lo revoca al desmontar, provocando descargas repetidas del archivo original desde Render en cada cambio de pantalla o modal.

**Implementa lo siguiente:**
1. En `frontend/src/hooks/useArchivoProtegido.js` (y `frontend/src/services/api.js`):
   - Implementa una **caché en memoria de sesión (LRU acotada, ej. máximo 150 entradas o ~50 MB)** indexada por `contexto (organización/finca/usuario) + url`, junto con **deduplicación de peticiones en vuelo** (si dos componentes piden la misma foto al mismo tiempo, comparten la misma promesa).
   - No revoques el `objectURL` al desmontar un componente individual si sigue en la caché de sesión; solo revócalo cuando una entrada sea expulsada del LRU, cuando se invalide explícitamente (al actualizar/eliminar la foto de un animal) o al cerrar sesión (`logout`).
   - En `api.js`, cambia `cache: 'no-store'` por una política que respete la caché privada del navegador o el `ETag` del backend cuando corresponda.
   - Expón un helper para limpiar/invalidar esta caché de blobs al cerrar sesión (`App.js` / `offlineStorage.js`) y cuando se cambie o elimine la foto de un animal.
2. En `backend/routes/archivoRoutes.js`:
   - Añade soporte de `ETag` (basado en el `_id` / `updatedAt` / `clave` / `tamano` de `ArchivoMultimedia`) y manejo de `If-None-Match` ANTES de descargar el stream desde Cloudflare R2: si el cliente envía un `If-None-Match` válido, responde inmediatamente `304 Not Modified` sin pedir el objeto a R2 ni transmitir bytes por Render.

---

### 2. Reducción de Consumo de RAM yTamaño de Respuestas en Consultas del Backend

1. **Lecturas con `.lean()` y proyecciones seguras en `.populate()`:**
   - **`backend/controllers/pesaje-controller.js` (líneas 19–24, 52–56, 132–154):**
     - Usa `.lean()` en las consultas de listado e historial de pesajes (manteniendo la estructura y transformaciones/`id` que espere el frontend).
     - En `.populate('animal')`, verifica primero todos los campos de `animal` que consumen el frontend y las exportaciones/reportes, y proyecta únicamente los campos necesarios (sin traer subdocumentos o metadatos innecesarios).
   - **`backend/controllers/movimientoFinanciero-controller.js` (línea 72):**
     - Usa `.lean()` en el listado de movimientos financieros y proyecta solo los campos necesarios en los `.populate()` de `animal` y `potrero`, conservando exactamente el formato de salida actual.
   - **`backend/controllers/tareaController.js` (línea 103):**
     - Usa `.lean()` en los listados de lectura de tareas (`listarTareas`, `misTareas`, etc.) manteniendo intacto el formato de respuesta.
   - **`backend/services/notificacion-service.js` (línea 136):**
     - Añade `.lean()` en la consulta de listado de notificaciones.

2. **Optimización de las 3 Consultas que Cargan Historiales Completos en RAM:**
   - **`backend/controllers/reporte-controller.js` (alrededor de la línea 671 — Finanzas de cría):**
     - Evita cargar en memoria simultáneamente todos los documentos históricos de `MovimientoFinanciero` más los del período. Calcula los acumulados/totales fuera del período mediante una agregación en MongoDB (`$match` + `$group`) o proyecciones mínimas `.select(...)` con `.lean()`, reduciendo drásticamente los objetos en RAM y conservando el resultado exacto del reporte.
   - **`backend/controllers/reporte-controller.js` (alrededor de la línea 1019 — Crecimiento de pesajes):**
     - Evita descargar todo el historial de pesajes de todos los animales a Node.js para encontrar el último pesaje en JavaScript. Utiliza una agregación en MongoDB (`$match` + `$sort` + `$group` con `$first`/`$last`) o consulta optimizada con proyección mínima para obtener únicamente los datos requeridos por animal.
   - **`backend/services/alertasCorreo-service.js` (líneas 49–55 y 113–120):**
     - Filtra directamente en la consulta de MongoDB las tareas pendientes cuya fecha de vencimiento entre dentro del horizonte de alerta (vencidas o próximas en los siguientes 7 días) y usa `.lean()`, en lugar de cargar todas las tareas futuras en memoria y descartarlas en JavaScript.

---

### 3. Control de Concurrencia Global para Importaciones y Exportaciones Pesadas (Protección de 512 MB RAM)

1. Crea una utilidad ligera en `backend/utils/` (o `backend/services/`) para controlar la concurrencia global en el proceso de Node.js de operaciones pesadas en memoria (**Importación de Excel** y **Exportaciones de Excel/PDF** en pesajes, consolidado multifinca y cierres):
   - Permite un máximo configurable por variable de entorno (por defecto `MAX_CONCURRENT_HEAVY_JOBS = 2`) ejecutándose al mismo tiempo.
   - Si llega una tercera operación simultánea, ponla en una cola de espera breve (hasta `15 segundos` por defecto); si no se libera un cupo en ese tiempo, responde con HTTP `429` (o `503`) y un mensaje claro: `"El servidor está procesando otros archivos pesados en este momento. Por favor intenta nuevamente en unos segundos."`
   - Asegúrate de liberar siempre el cupo en un bloque `finally`.

---

### 4. Verificación
1. Ejecuta la suite de pruebas del backend y añade tests unitarios/integración para:
   - Respuesta `304 Not Modified` en `GET /api/archivos/r2/:id` sin llamar a R2 cuando coincide el `ETag`.
   - Caché y deduplicación en `useArchivoProtegido`.
   - Resultados idénticos en los reportes optimizados (`Finanzas de cría` y `Crecimiento de pesajes`) y en `alertasCorreo-service`.
   - Funcionamiento del limitador de concurrencia de trabajos pesados.
2. Ejecuta el build del frontend para confirmar que no hay errores.