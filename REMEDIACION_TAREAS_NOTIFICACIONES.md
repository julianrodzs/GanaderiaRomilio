# Remediación de tareas, calendario y notificaciones

Fecha: 20 de octubre de 2026. Instrucciones: [Agents.md](Agents.md). Diagnóstico original: [AUDIT_MODULO_TAREAS_NOTIFICACIONES.md](AUDIT_MODULO_TAREAS_NOTIFICACIONES.md).

## Cambios implementados

| Hallazgo | Resultado en el código actual |
|---|---|
| TN-01 | DTO explícito: rechaza tenant, origen, campos internos, operadores MongoDB, rutas con punto y objetos en campos escalares. Contexto de alta impuesto por servidor. Animal, potrero y lote se consultan dentro del alcance vigente; responsable exige membresía activa y acceso a finca. El alta desde Lotes usa el mismo DTO. |
| TN-02 | PUT, `/estado` y `/completar` comparten validación de transiciones y bloqueo de Sanidad/IATF/bandas/engorde. Origen y categoría no son editables. La reprogramación especializada se realiza desde su módulo. |
| TN-03 | Autorización antes del replay; clave vinculada al actor, acción y contenido; rechaza replay de una tarea reabierta o reasignada a otro usuario. |
| TN-04 | Creación, edición, finalización, reapertura, comentarios y eliminación por el controlador usan `withTransaction`. Tarea, clave idempotente, efecto de destete y bitácora comparten sesión. PUT usa `save` con concurrencia optimista; hay comprobación adicional de versión del cliente. Los avisos se emiten tras confirmar la transacción. La entrega durable de todos los avisos sigue siendo un trabajo adicional, detallado abajo. |
| TN-05 | Completar una tarea produce Observacion, sin inventar Parto, Pesaje, Venta, Monta o aplicación clínica. Solo se registra Destete cuando esa operación modificó realmente el animal asociado al ciclo. |
| TN-06 | Se impide borrar físicamente tareas vinculadas/especializadas y tareas completadas. Reapertura formal solo para gestores y tareas sin origen. Se bloquea cambiar relaciones de una tarea vinculada. |
| TN-07 | Normalizador común de ObjectId, `_id`, `id` y cadena; rechaza objetos arbitrarios. El actor de auth ya se persiste sin `[object Object]`. |
| TN-08 | Notificacion requiere finca; lectura/contador/marcado se limitan a la finca activa. Reparto por rol y creación directa validan acceso del destinatario. Correos separados por administrador y fincas autorizadas, con deduplicación por destinatario. |
| TN-09 | Guards de plan vigente en todas las mutaciones de tareas/notificaciones y tarea desde lote. Cron de alertas selecciona planes Activo/Prueba y valida feature antes de generar avisos. |
| TN-10 | Reglas comunes: una cancelada no puede completarse directamente; un trabajador no reabre tareas terminales. La reapertura de una manual exige gestor y acción explícita. |
| TN-11 | Offline transmite `creadoEn` como `fechaEjecucionReal`; backend valida fecha con zona, no futura ni anterior a creación. Conserva `fechaCompletada`, `fechaRecepcionCompletado` y procedencia offline por separado. Bitácora usa fecha de campo. |
| TN-12 | Fechas civiles almacenadas a medianoche UTC conservan su día al mostrarse; los demás instantes usan la zona de organización. Vencimiento usa límite o programada tanto en lista como cron. Reprogramación de agenda desplaza también el límite. Ver límite histórico abajo. |
| TN-13 | Versiones de asignación permiten un nuevo aviso al reasignar, también en A→B→A mediante `save`. Recordatorios usan fecha absoluta para no conservar texto relativo obsoleto. |
| TN-14 | Se aíslan errores por organización y por destinatario de correo operativo; timeout de proveedor de 30 segundos. Métrica distingue correos enviados y alertas incluidas. No se garantiza entrega exactamente una vez ante caída entre proveedor y registro local. |
| TN-15 | Escape HTML compartido en títulos/nombres de alertas y saludo de resúmenes. |
| TN-16 | Centro paginado en grupos de 25; errores de lectura visibles; la campana se refresca tras mutaciones y sigue haciendo polling de 45 segundos. |
| TN-17 | Finalización/sincronización actualiza todas las variantes de caché de tareas. No se usa fallback ante 401/403. Se comprueba contexto antes del envío. Reintento de conflicto exige revisar y confirmar la versión actual desde la interfaz. Queda por validar comportamiento real de varias pestañas/dispositivos. |
| TN-18 | Avisos añadidos a bancos forrajeros, creación de campañas IATF tras commit, tareas de bandas/engorde y comentarios. Cron reconcilia asignaciones pendientes aunque estén fuera de los próximos siete días, con deduplicación. |

La interfaz de edición envía únicamente campos editables que cambiaron, conserva versión y limita acciones que el backend ya no permite. El detalle usa la respuesta actualizada tras cambiar estado o completar, evitando reutilizar una versión anterior.

## Archivos principales

- [Controlador de tareas](backend/controllers/tareaController.js) y [validaciones compartidas](backend/services/tarea-integridad-service.js).
- [Notificaciones](backend/services/notificacion-service.js), [emisores de tareas](backend/services/tarea-notificacion-service.js) y [modelo](backend/models/Notificacion.js).
- [Alertas por correo](backend/services/alertasCorreo-service.js) y [resúmenes](backend/services/resumenEmail-service.js).
- [Tareas React](frontend/src/pages/Tareas.js), [centro](frontend/src/pages/CentroNotificaciones.js), [sincronizador](frontend/src/services/offlineSync.js), [caché](frontend/src/services/offlineStorage.js) y [fechas de tareas](frontend/src/utils/fechasTareas.mjs).
- [Regresiones backend](backend/tests/tareas-notificaciones-remediacion.test.js) y [regresiones frontend](frontend/tests/tareasOffline.test.mjs).

## Verificación

La suite backend previa tenía 254 pruebas. Se agregaron casos para DTOs, roles, replay, transacciones, fecha offline, destinatarios por finca, HTML, planes suspendidos/cancelados, borrado y migración. Las pruebas de transacción usan un doble que solo confirma escrituras al finalizar; comprueban propagación de sesión y rollback del flujo, pero **no sustituyen una prueba contra MongoDB replica set**.

Comandos de aceptación:

```powershell
cd backend
npm.cmd test
cd ../frontend
npm.cmd run test:tareas
npm.cmd run test:lunar
npm.cmd run build
```

Resultados finales: **272/272 pruebas backend**, **4/4 de tareas/offline**, **6/6 lunares** y **build de producción correcto**, incluida generación del service worker PWA. Se añadieron 18 pruebas backend y 4 frontend.

La primera compilación encontró una restricción del entorno aislado al resolver carpetas de esbuild. La repetición con permisos de ejecución ampliados compiló correctamente. Vite conserva una advertencia de tamaño del bundle principal; no es un fallo de compilación.

## Datos existentes y despliegue

No se ejecutaron migraciones ni escrituras en producción y no se enviaron correos reales. Se conservaron los cambios locales previos de otros módulos.

1. **MongoDB debe soportar transacciones** (replica set o servicio equivalente). No se introdujo un fallback que guarde parcialmente cuando las transacciones fallen.
2. **Notificaciones antiguas sin finca:** quedan fuera de las consultas de la nueva versión. Está preparado [migrarFincasNotificaciones.js](backend/scripts/migrarFincasNotificaciones.js), en modo revisión por defecto. Exige `MONGODB_URI` explícita, verifica entidad/organización/finca y no asigna la finca principal por defecto. Si la entidad cambió después del aviso, o no existe evidencia suficiente, deja ese aviso pendiente de revisión manual. Tampoco elimina avisos duplicados.
3. Revisar primero el resultado del script en el entorno de despliegue. Solo `--apply` escribe. El script no se ejecutó durante este trabajo:

```powershell
cd backend
node scripts/migrarFincasNotificaciones.js
# Tras revisar el resultado y preparar el despliegue:
node scripts/migrarFincasNotificaciones.js --apply
```

4. Verificar la creación de los índices nuevos del modelo en el despliegue según la configuración de MongoDB. Las consultas aíslan la finca independientemente de que el índice esté construido.
5. Las nuevas validaciones no reparan automáticamente datos históricos: eventos de Parto/Pesaje creados previamente desde Tareas, relaciones ajenas y fechas de campo antiguas requieren conciliación con evidencia real.

## Límites y trabajo posterior

- Los correos aún se registran después de que el proveedor los acepte. Una caída entre ambos pasos puede repetir una entrega. Falta una cola durable de entregas con identidad estable y renovación del bloqueo de cron para procesos largos. Se mantiene el bloqueo existente de 30 minutos y no se promete entrega exactamente una vez.
- Los avisos de modificación/finalización se emiten después del commit mediante la envoltura segura. Las asignaciones pendientes se reconcilian en cron; no existe todavía una cola durable para todos los tipos de avisos.
- Los datos históricos no distinguen explícitamente fecha civil e instante a medianoche UTC. Se preservó la convención de fechas civiles de los generadores actuales. Un protocolo que intencionalmente haya usado exactamente medianoche UTC requiere revisión para desambiguar; no se reescribieron fechas de protocolos automáticamente.
- Sin prueba real de navegador, varias pestañas, dispositivos o proveedor de correo. Las pruebas de sincronización ejecutan el módulo real con adaptadores de red/almacenamiento sustituidos. Antes de producción, verificar un recorrido completo con dos usuarios/fincas y pérdida/recuperación de conexión.
- La pantalla ya permite revisar un conflicto antes de reintentar; no sobrescribe automáticamente la versión del servidor. Los casos clínicos continúan requiriendo conexión y su ejecutor especializado.
