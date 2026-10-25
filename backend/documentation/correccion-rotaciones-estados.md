# Correccion de estados y edicion de rotaciones

Revision: 25 de octubre de 2026. Motivo: reporte del cliente sobre rotaciones activas en la finca principal y cambios a Planificada.

## Hallazgos reproducidos

1. El formulario de edicion copiaba todo el documento de la API y lo reenviaba. Incluia `_id`, `organizacionId`, `fincaId`, timestamps y dias calculados. El DTO de seguridad los rechaza con `400 CAMPO_PROTEGIDO`, por lo que no se guardaba el estado seleccionado.
2. La creacion sin estado siempre aplicaba `Activa`, aunque la entrada estuviera en el futuro o ya existiera una salida historica. El formulario tambien preseleccionaba Activa y la API no validaba esas contradicciones.
3. El listado permitia abrir la edicion/eliminacion de rotaciones de lotes, aunque la API las protege y exige administrarlas mediante el flujo del lote.

El barrido de controladores, servicios, cron e importaciones no encontro un proceso que active todas las rotaciones en bloque. Los fallos anteriores explican estados incorrectos al registrar y problemas al corregirlos; no prueban por si solos que los registros del cliente hayan cambiado simultaneamente. No se consulto ni modifico su base real durante esta correccion.

## Cambios

- `FormularioRotacion` usa un objeto compuesto exclusivamente por los campos editables. Se mantiene la proteccion tenant del backend.
- Si se crea sin estado, la API propone Planificada para entrada futura, Finalizada para salida ya ocurrida y Activa para ingreso actual/pasado sin salida.
- Un estado explicitamente Planificada se conserva, aunque su fecha programada ya haya pasado. No hay activacion automatica por consultar el listado o por llegar a la fecha.
- La API rechaza Activa con entrada futura (`ROTACION_FUTURA_NO_ACTIVA`) y Activa con salida ya ocurrida (`ROTACION_CON_SALIDA_NO_ACTIVA`).
- El formulario refleja estas restricciones y usa el dia civil de la zona horaria de la organizacion. No utiliza el dia UTC del servidor para decidir si la entrada es futura.
- Las acciones de editar/eliminar rotaciones vinculadas a lotes aparecen deshabilitadas con su motivo; el backend conserva el bloqueo del flujo protegido.
- No se hizo una migracion ni una reclasificacion masiva de rotaciones existentes.

## Verificacion

- `npm test` en backend: **354/354 PASS**.
- `npm run build` en frontend: PASS.
- Nuevas pruebas reproducen el payload anterior rechazado, guardan el payload corregido y verifican que solo cambia la rotacion seleccionada, no las demas.
- Se comprueban la proteccion de lotes, rollback si falla la sincronizacion del potrero, fechas futuras y salidas historicas, incluidos los limites del dia civil en Costa Rica.

Para atribuir el episodio concreto de la finca principal, revisar su auditoria de altas/ediciones de `/api/rotaciones` y movimientos de lotes, junto con `createdAt`, `updatedAt`, fechas y estado persistido. Cualquier correccion de sus datos debe basarse en los ingresos/salidas reales, sin convertir automaticamente todas las rotaciones a un mismo estado.
