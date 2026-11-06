# Resumen ejecutivo Premium

## Que recibe el productor

1. Tareas: supervision de fincas autorizadas para Administrador/Encargado y conteos personales separados. Otros roles solo reciben sus tareas. Las vencidas son un subconjunto de pendientes/en proceso; no se suman dos veces. Cinco urgentes como maximo, ordenadas por vencimiento, con finca, DIIO/lote y responsable con nombre y rol empresarial vigente.
2. Radar: partos estimados y tareas IATF/TE para hoy y los seis dias siguientes. Hasta cinco hembras identificadas. El retiro de carne cuenta animales activos bloqueados al instante del corte, segun la misma fecha final usada para validar ventas. Se respetan los permisos de Sanidad/Reproduccion; Contador no recibe datos clinicos o reproductivos.
3. Inventario: foto actual, altas/bajas y variacion por especie. Se omiten especies sin activos ni movimientos. Gestaciones confirmadas activas deduplicadas por hembra y animales activos con pertenencia vigente a lotes de ENGORDE activos. No se infiere gestacion por tener una tarea.
4. Finanzas: solo Administrador/Contador, con el permiso revisado al procesar el destinatario. CRC siempre; USD solo con actividad. Ingresos, egresos, flujo neto y Top 3 por naturaleza/moneda, con porcentaje sobre su propio total. Se prefieren categorias normalizadas, con respaldo al nombre original si la normalizada es Otros/vacia. Se excluyen partidas fuera de consolidacion, anuladas y transferencias internas. Flujo de caja no es utilidad contable.
5. Comparativo: solo cuando hay dos o mas fincas activas autorizadas. Las columnas tambien dependen del contenido activado y los permisos; nunca se introduce una columna financiera a un rol operativo.

HTML inline, texto plano humano, valores escapados y enlace HTTPS a FRONTEND_URL. El correo no incorpora fotos privadas ni informacion de otras organizaciones. Es una vista de supervision, no un reporte contable ni un diagnostico veterinario.

## Ventanas y fuentes

- Diario: intervalo movil de 24 horas anteriores al corte. Semanal: 168 horas. Se muestra inicio, fin y zona de la organizacion (America/Costa_Rica por defecto). Las consultas de hechos usan inicio incluido y fin excluido.
- Nacimientos/compras/ventas/muertes se obtienen de fechas de Animal, no del conteo de EventoAnimal: importar o crear una compra puede generar eventos redundantes. Un animal comprado no se considera nacimiento propio solo por tener fecha de nacimiento.
- Las fechas historicas de Animal y Finanzas sin hora se conservan como estan almacenadas; no se inventa una hora de nacimiento/venta. El correo expresa el intervalo de consulta, no la hora real del hecho. Para supervision por dias calendario existe la vista de Reportes; el correo mantiene la ventana movil existente.
- La finca de un movimiento del animal se resuelve mediante HistorialFincaAnimal a la fecha del hecho; si no existe historia, se usa su finca registrada. Los traslados se cuentan desde TrasladoFinca, no sus eventos duplicados de salida/entrada. Entre fincas incluidas, entradas y salidas se compensan en el neto consolidado.
- Las tareas y estimaciones conservan el contrato civil existente: medianoche UTC representa una fecha de calendario, no la tarde anterior de Costa Rica. El vencimiento es por dia, por eso una tarea de hoy no esta vencida a las 06:00.
- El retiro es una foto al corte, no un evento proyectado a siete dias. Las cifras productivas/financieras no se suman entre monedas ni especies incompatibles.

## Activacion y operacion

- Solo PREMIUM activo o en prueba y organizaciones activas. Cuenta > Configuracion > Notificaciones y resumen permite Diario/Semanal/Desactivado y elegir contenido, incluido Radar. El valor Desactivado se mantiene: este despliegue no suscribe usuarios automaticamente.
- Render: mismo commit en API/cron, command npm run job:alertas, schedule `0 12 * * *`. Tres fases aisladas: categorias, alertas, resumenes. No se requiere otro cron pagado. Mantener CRON_MODE=external en API y cron para no duplicar programadores.
- CRON_INCLUDE_SUMMARIES ausente/true: incluir resumenes. false: desactivar esa fase. Si quedo false de un despliegue anterior, quitarlo o cambiarlo.
- El cron diario ignora horaPreferida, pero conserva el dia semanal local y ultimoPeriodo. Las preferencias ocultan la hora en modo externo. El standalone npm run job:resumenes-email y el modo interno continuo respetan la hora; CRON_RESUMEN_IGNORE_HOUR=true permite omitirla explicitamente.
- FRONTEND_URL valido y credenciales/remitente Resend deben estar tambien en el servicio cron. EMAIL_ALERTS_ENABLED=false solo afecta alertas operativas, no las preferencias de resumen.
- Los destinatarios se recorren con cursor (lotes de 100). Conteos y agrupaciones se calculan en MongoDB; se hidratan solo cinco tareas y cinco hembras por destinatario. No se cargan todos los animales/tareas en Node. Todavia se calcula un resumen por destinatario; para organizaciones muy grandes puede evaluarse cache por combinacion de fincas/rol/contenido sin mezclar permisos.
- Un fallo de destinatario no corta a los otros. Cualquier error no recuperado queda en resumenes.errores, organizacionesConError y TrabajoProgramado; salida CLI 1 / HTTP 500. Se conserva el conteo real de mensajes aceptados aunque falle la persistencia posterior.

## Duplicados y limites

El lease evita concurrencia normal, ultimoPeriodo evita reenviar periodos guardados y solo se marca despues de aceptar el proveedor. Se envia tambien Idempotency-Key por organizacion/usuario/periodo. Resend conserva estas claves 24 horas; si se repite una clave con contenido distinto puede responder conflicto, que se registra como error y no se oculta. No se promete entrega exactamente una vez ante fallos de proveedor/DB ni se reintenta a ciegas. Fuente: https://resend.com/docs/dashboard/emails/idempotency-keys

No hay migracion destructiva ni nuevos indices requeridos por este resumen. La agenda incremental de categorias del sprint anterior sigue igual.

## Verificacion local

tests/resumen-ejecutivo-integracion.test.js usa mongod temporal en loopback y sustituye Resend. Cubre inventario, permisos de cuatro roles, tareas globales/personales, fincas no autorizadas/otro tenant, radar, engorde, traslados historicos, HTML/texto/CTA y ejecucion repetida del cron. Nunca lee .env ni usa Atlas.

Resultado del 2026-11-05: backend npm test 435/435 PASS (11 pruebas nuevas del resumen con MongoDB real); frontend npm test 60/60 PASS y npm run build salida 0. Smoke integrado: 16/16 pasos y 9/9 comprobaciones PASS, MongoDB 8.0.5 temporal y 75 modelos. La fase de resumenes tambien pasa en X5. Evidencias en TEMP/cir-resumen-ejecutivo-smoke, sin sobrescribir resultados historicos versionados.

El smoke conserva dos avisos preexistentes de auditoria `docs?.some is not a function` durante inyecciones deliberadas de fallos de rollback; no se ocultaron ni se corrigieron en este alcance. No se enviaron correos reales ni se modifico Atlas o Render. La compatibilidad con clientes de correo se disena mediante tablas y estilos inline; no se ha hecho envio real de aceptacion en Gmail/Outlook/Apple Mail.
