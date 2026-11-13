Actúa como un Ingeniero Senior de Performance y Backend (Node.js/Express + React). En Render detectamos que el Static Site del frontend solo ha consumido 15 MB en el mes, pero el Web Service del backend (`GanaderiaRomilio`) ha consumido **4.4 GB de Outbound Bandwidth (HTTP Responses)** con un solo usuario en pruebas, y además mantiene un consumo constante de ~0.6 MB/hora durante toda la madrugada cuando queda una pestaña abierta.

Realiza una auditoría completa del backend y del frontend para encontrar y corregir esta fuga de ancho de banda:

### 1. Diagnóstico (infórmame qué encontraste)
1. Busca todos los `setInterval`, `setTimeout` recurrentes, listeners de `online`/`focus`, Service Workers o hooks `useEffect` en `frontend/src` que hagan llamadas periódicas a la API (ej. notificaciones, `/auth/me`, sincronización offline, alertas, dashboard, etc.).
2. Revisa qué endpoints del backend pueden estar devolviendo payloads grandes en cada llamada (por ejemplo: campos Base64 como `logo`, `foto`, `imagen`, historiales completos no paginados en `/animales`, `/fincas`, `/notificaciones`, `/auth/me`, o descargas completas para caché offline).
3. Verifica si `backend/server.js` (o `app.js`) tiene instalado y activo el middleware `compression` (gzip/brotli).

### 2. Correcciones obligatorias a implementar
1. **Compresión HTTP en el Backend (`compression`):**
   - Instala y configura `compression` en Express antes de todas las rutas para comprimir con Gzip todas las respuestas JSON/texto mayores a 1 KB.
2. **Frenar el consumo en segundo plano (Polling inteligente en Frontend):**
   - En cualquier polling periódico del frontend (notificaciones, sincronización offline, verificación de estado, etc.):
     - **No ejecutes peticiones si la pestaña está oculta** (`document.visibilityState === 'hidden'`).
     - Aumenta los intervalos excesivamente cortos a un tiempo razonable y evita recargar catálogos completos de animales/pesajes si no hubo cambios.
   - Revisa que no exista ningún `useEffect` con dependencias mal declaradas que provoque peticiones repetidas en bucle.
3. **Adelgazar respuestas pesadas (Proyección de campos y Base64):**
   - Asegúrate de que los endpoints que se consultan frecuentemente (`/auth/me`, `/notificaciones`, listados de `/animales`, sincronización offline) no envíen campos pesados innecesarios en cada llamada ni re-descarguen toda la base de datos si no ha cambiado.
   - Agrega cabeceras `ETag` / condicionales o verifica que Express mantenga `etag` activo para que las respuestas sin cambios devuelvan `304 Not Modified` (0 bytes de body) en lugar de enviar todo el JSON de nuevo.

### 3. Verificación
- Ejecuta las pruebas de backend y el build de frontend para asegurar que nada se rompa.
- Al finalizar, dame un resumen exacto de:
  1. Cuál era el endpoint o intervalo responsable de los 0.6 MB/hora en la madrugada y de los 4.4 GB acumulados.
  2. Cuánto pesaba antes vs. cuánto pesa ahora cada respuesta tras tus cambios.