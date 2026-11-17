Actúa como un Arquitecto de Software Senior Full-Stack (Node.js/Express, Mongoose, React). Ahora que la Fase 1 (Fotos privadas y Memoria RAM) quedó completada y verificada, vamos a implementar la **Fase 2: Higiene de Base de Datos (TTL/Retención), Limpieza de R2 en Apariencia, Protección de Correos y Cierre de Sesión Completo**.

Mantén el mismo rigor técnico, sin romper contratos de API ni flujos existentes.

---

### 1. Retención y Limpieza Automática en MongoDB (Evitar crecimiento infinito en Atlas)

1. **`Notificacion` (`backend/models/Notificacion.js`):**
   - Queremos que las notificaciones **ya leídas** (`leida: true`) no se acumulen para siempre.
   - Añade un campo `expiraEn` (Date) que se fije automáticamente (p. ej. a **90 días** en el futuro) cuando una notificación se marca como `leida: true` (tanto en marcado individual como masivo), con un índice TTL `{ expiraEn: 1 }, { expireAfterSeconds: 0 }`. Las notificaciones no leídas mantienen `expiraEn: null` (no expiran).
2. **`AlertaCorreo` (`backend/models/AlertaCorreo.js`):**
   - Añade retención automática mediante TTL (p. ej. **120 días** después de `createdAt` o `enviadoEn`) para no acumular registros históricos de avisos indefinidamente, conservando sobradamente la ventana necesaria de idempotencia.
3. **`ImportacionExcel` (`backend/models/ImportacionExcel.js`):**
   - Las importaciones en vista previa o expiradas guardan `filas`, `errores` y `resultados` pesados.
   - Configura limpieza automática (TTL sobre `expiraEn` para previsualizaciones no confirmadas/expiradas tras p. ej. **7 días**, o al confirmar/expirar limpia los arreglos pesados de filas crudas dejando solo el resumen de auditoría de la importación confirmada).
4. **`Invitacion` (`backend/models/Invitacion.js`):**
   - Asegúrate de que las invitaciones no aceptadas y ya vencidas se limpien automáticamente tras un período prudente posterior a `expiraEn` (p. ej. 30 días después de vencer) o mediante un índice TTL específico de purga.
5. **Nota sobre `Auditoria`:**
   - **NO** pongas TTL destructivo automático en `Auditoria` (para preservar la trazabilidad legal/operativa inmutable).

---

### 2. Limpieza de Archivos Huérfanos en Cloudflare R2 (`apariencia-service.js`)

1. En `backend/services/apariencia-service.js` (líneas 109–149):
   - Cuando se reemplace o restaure el logo de la organización o la imagen de una finca, elimina de Cloudflare R2 el objeto anterior (si existía y pertenecía a esa organización) de forma segura (en modo best-effort: si la eliminación en R2 falla, registra el warning pero no abortes el guardado del nuevo logo).

---

### 3. Política de Correo y Exclusión de Cuentas `sinAccesoCorreo`

1. En `backend/controllers/usuario-controller.js` (alrededor de las líneas 269–285) y modelo `Usuario`:
   - Cuando se cree un usuario con `sinAccesoCorreo: true` (cuenta operativa con contraseña temporal sin correo real verificable), persiste explícitamente un indicador en el usuario/membresía (ej. `sinAccesoCorreo: true` o `correoVerificado: false` / exclusión de envíos automáticos).
   - En `alertasCorreo-service.js`, `resumenEmail-service.js` y `suscripcionesProgramadas-service.js`, excluye siempre de los envíos automáticos a cualquier usuario marcado con `sinAccesoCorreo: true`.
2. En `backend/services/correoElectronico-service.js` (y modelo `Usuario`):
   - Añade una validación central de formato de correo electrónico (sintaxis estándar y rechazo de dominios vacíos o cadenas malformadas) antes de intentar enviar al proveedor (Resend), registrando un aviso claro sin consumir llamadas ni reintentos contra la API de correo si la dirección es sintácticamente inválida.

---

### 4. Cierre de Sesión (`logout`) Completo y Rate Limit en Contexto de Invitación

1. **Limpieza de datos secundarios al cerrar o expirar sesión (`frontend/`):**
   - En el flujo de cierre de sesión manual y por expiración (`App.js`, `AparienciaContext.js`, `offlineStorage.js`):
     - Limpia las claves de caché de apariencia `ganaderiaApariencia:*` en `localStorage` correspondientes a la sesión saliente.
     - Limpia las acciones pendientes en `sessionStorage` que contengan identificadores de animales, lotes o fincas de la sesión anterior (`Lotes.js`, etc.).
     - Asegúrate de que el evento de cierre de sesión en una pestaña notifique a las demás pestañas abiertas (vía evento `storage` o `BroadcastChannel`) para desmontar la sesión y limpiar las cachés en memoria (`archivoProtegidoCache`, contextos).
2. **Rate Limit en `GET /api/invitaciones/contexto` (`backend/routes/invitacionRoutes.js`):**
   - Aplica un limitador de velocidad por IP (usando `rateLimit.js`) a la ruta pública `GET /api/invitaciones/contexto` para proteger la consulta a MongoDB frente a escaneos automatizados.

---

### 5. Verificación
1. Ejecuta todos los tests de backend y frontend, añadiendo pruebas para:
   - Asignación de `expiraEn` al marcar notificaciones como leídas y limpieza de payloads pesados en `ImportacionExcel`.
   - Eliminación del objeto anterior en R2 al reemplazar/restaurar logo o imagen de finca.
   - Exclusión de usuarios con `sinAccesoCorreo: true` y rechazo de emails con formato inválido antes de llamar al transporte.
   - Limpieza de `localStorage` (`ganaderiaApariencia:*`), `sessionStorage` y sincronización entre pestañas en `logout`.
   - Rate limit en `GET /api/invitaciones/contexto`.
2. Verifica que `npm run build` en frontend pase sin errores.