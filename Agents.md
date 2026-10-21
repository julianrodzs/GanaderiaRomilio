# PROMPT PARA CODEX: REMEDIACIÓN DEL MÓDULO DE TAREAS, CALENDARIO Y NOTIFICACIONES

Eres el Desarrollador Fullstack Senior. Basándote en el informe de auditoría `AUDIT_MODULO_TAREAS_NOTIFICACIONES.md`, tu objetivo es corregir las fallas críticas de seguridad, aislamiento entre fincas, integridad de tareas clínicas y el motor de notificaciones previo al lanzamiento a producción.

---

### 🛠️ FASE 1: SEGURIDAD, AISLAMIENTO Y REPARACIÓN DE NOTIFICACIONES (HALLAZGOS P1)

#### 1. Reparación Inmediata del Bug `[object Object]` en Notificaciones (Hallazgo TN-07)
- **Archivos:** `middleware/auth.js`, `tareaController.js`, `notificacion-service.js`, `tarea-notificacion-service.js`.
- **Problema:** Al crear notificaciones, el sistema recibe `req.usuario` como un objeto con propiedad `id` (o `_id`), pero los normalizadores lo convierten a string generando `"[object Object]"`, lo que provoca un error de casteo (`CastError`) en Mongoose y aborta la notificación en silencio.
- **Acción:**
  1. En `notificacion-service.js` y creadores de avisos, crear un normalizador de identificador que acepte de forma limpia `usuario.id || usuario._id || usuario`.
  2. Asegurar que el campo `actor` y `destinatario` siempre se persistan como ObjectIds válidos de MongoDB, permitiendo que las notificaciones de tareas asignadas, modificadas o completadas se guarden y entreguen con éxito.

#### 2. Aislamiento Estricto por Finca en Notificaciones y Correos (Hallazgo TN-08)
- **Archivos:** `Notificacion.js`, `notificacion-service.js` (`notificarPorRoles`), `alertasCorreo-service.js`.
- **Problema:** Los avisos a administradores/encargados y los correos de alertas agrupan a todos los usuarios de la organización sin filtrar por su acceso a la finca, enviando alertas de la Finca A a encargados que solo tienen acceso a la Finca B.
- **Acción:**
  1. Agregar el campo `fincaId: { type: ObjectId, ref: 'Finca', required: true }` al esquema `Notificacion.js`.
  2. En `notificarPorRoles`, filtrar a los destinatarios para que solo reciban la notificación aquellos usuarios que tengan **membresía activa con acceso a la finca específica** de la tarea.
  3. En `alertasCorreo-service.js` (cron job), agrupar y filtrar las tareas pendientes/vencidas por las fincas autorizadas de cada destinatario antes de enviar el correo.

#### 3. DTO Estricto y Protección de Tenant en Tareas (Hallazgo TN-01)
- **Archivos:** `tareaController.js` (`limpiarDatosTarea`, `crearTarea`, `actualizarTarea`).
- **Acción:**
  1. Forzar `organizacionId` y `fincaId` desde el contexto autenticado (`req.organizacionId`, `req.fincaId`). Ignorar y rechazar cualquier valor de tenant inyectado en el payload.
  2. Prohibir operadores de MongoDB (`$set`, etc.) en altas y ediciones.
  3. Validar que las entidades relacionadas (`animal`, `potrero`, `lote`) y el usuario `asignadoA` pertenezcan estrictamente a la finca activa y tengan membresía vigente.

#### 4. Bloqueo de Atajos en Tareas Clínicas e Integridad de Bitácora (Hallazgos TN-02 y TN-05)
- **Archivos:** `tareaController.js` (`updateTarea`, `completarTarea`).
- **Problema:** Actualizar una tarea por `PUT` permitía marcar como completadas tareas de Sanidad, IATF, Pesaje o Partos sin ejecutar el procedimiento médico/productivo real, e inventaba eventos falsos en la bitácora sin datos de peso o nacimiento.
- **Acción:**
  1. **Bloqueo de Atajos:** Si una tarea tiene origen especializado (`Sanidad`, `IATF`, `BandaPorcina`, `ProtocoloEngorde`), bloquear su finalización directa por `PUT` o `/api/tareas/:id/estado`. Exigir que se complete mediante su ejecutor clínico correspondiente (con sus dosis, semen o pesajes reales).
  2. **Cero Eventos Falsos:** No generar eventos de `Parto` o `Pesaje` en la bitácora a partir del simple clic en "Completar tarea" si no existe el registro de negocio real asociado (el ternero o la medición de peso en báscula).

#### 5. Autorización en Replay, Transacciones y Máquina de Estados (Hallazgos TN-03, TN-04, TN-06 y TN-10)
- **Archivos:** `tareaController.js`, `Tarea.js`.
- **Acción:**
  1. **Autorización previa a Idempotencia:** Al procesar un reintento con clave de idempotencia (`operacionesIdempotentes`), verificar **primero** que el usuario solicitante tenga permisos y acceso actual a la tarea antes de responder con los datos de la tarea.
  2. **Transaccionalidad:** Envolver la finalización de la tarea, los efectos en entidades y la emisión de bitácora en una sesión atómica de MongoDB (`withTransaction`).
  3. **Máquina de Estados Coherente:** Alinear `/estado` y `/completar`: prohibir que un trabajador pase una tarea `Cancelada` a `Completada` sin una reapertura formal.
  4. **Protección contra Borrado:** Prohibir el borrado físico (`DELETE`) de tareas vinculadas a protocolos activos de IATF o sanidad; exigir su cancelación lógica.

#### 6. Validación de Suscripción Vigente en Rutas (Hallazgo TN-09)
- **Archivos:** `tareaRoutes.js`, `notificacionRoutes.js`.
- **Acción:**
  1. Aplicar el middleware `asegurarPlanVigente` a todas las mutaciones de tareas (`POST`, `PUT`, `PATCH`, `DELETE`).
  2. Denegar con `403 Forbidden` cualquier creación o modificación de tareas si la suscripción de la organización está en estado `Suspendido` o `Cancelado`.

---

### 🎨 FASE 2: TRAZABILIDAD OFFLINE, ZONA HORARIA Y CORREOS (HALLAZGOS P2)

#### 1. Preservación de la Fecha Real en Sincronización Offline (Hallazgo TN-11)
- **Archivos:** `offlineSync.js`, `tareaController.js` (`completarTarea`).
- **Problema:** Cuando el vaquero completa una tarea en el potrero a las 07:00 AM sin internet y sincroniza a las 02:00 PM con Wi-Fi, el servidor le estampa las 02:00 PM (`new Date()`).
- **Acción:**
  1. En `offlineSync.js`, enviar en el payload la fecha original de ejecución en campo (`fechaEjecucionReal: operacion.creadoEn`).
  2. En el backend, si se recibe `fechaEjecucionReal` válida, asignarla a `fechaCompletada` de la tarea y al evento de bitácora, guardando la fecha de recepción del servidor únicamente como metadato de sincronización.

#### 2. Normalización de Fechas Civiles en Costa Rica (Hallazgo TN-12)
- **Archivos:** `Tareas.js` (frontend), `tareaController.js`, `alertasCorreo-service.js`.
- **Acción:**
  1. Normalizar las fechas de vencimiento y programación para que la medianoche UTC no reste un día en la zona horaria de Costa Rica (UTC-6).
  2. Asegurar que el cálculo de tareas vencidas use la zona horaria oficial de la organización (`Organizacion.zonaHoraria`).

#### 3. Sanitización de HTML en Correos Salientes (Hallazgo TN-15)
- **Archivos:** `alertasCorreo-service.js`, `resumenEmail-service.js`.
- **Acción:**
  1. Escapar cualquier carácter especial (`<`, `>`, `&`, `"`, `'`) en los títulos de tareas, nombres de lotes y observaciones antes de interpolarlos en la plantilla HTML de correo para Resend.

#### 4. Paginación en Centro de Notificaciones (Hallazgo TN-16)
- **Archivos:** `CentroNotificaciones.js` (frontend), `notificacionRoutes.js`.
- **Acción:**
  1. Implementar paginación o botón "Cargar más" en el Centro de Notificaciones para permitir consultar avisos anteriores a los primeros 100 registros.

---

### 🧪 CRITERIOS DE ACEPTACIÓN:
- Al asignar una tarea a un usuario, la notificación in-app se crea con éxito y suma al contador de la campana sin errores de casteo (`[object Object]`).
- Los encargados de la Finca A no reciben notificaciones ni correos de tareas de la Finca B.
- No es posible completar tareas clínicas por PUT directo para saltarse vacunas o pesajes.
- Completar una tarea en modo offline a las 07:00 AM conserva las 07:00 AM como `fechaCompletada` tras sincronizar.
- Los títulos de tareas con caracteres especiales no rompen el diseño del correo HTML.
- Un usuario con plan suspendido recibe `403` al intentar crear o editar tareas por API.
- Ejecutar `npm test` en backend y validar que las 254+ pruebas pasen al 100%.
- Ejecutar `npm run test:lunar` y `npm run build` en frontend para certificar compilación limpia.