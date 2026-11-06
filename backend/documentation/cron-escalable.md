# Cron incremental de categorias, alertas y resumenes

## Alcance - 2026-11-05

Se mantiene `npm run job:alertas` y `POST /api/cron/alertas`. Ejecutan categorias, alertas y resumenes Premium como fases secuenciales independientes. Un error de finca/organizacion no corta las siguientes; un fallo global de categorias tampoco impide intentar alertas y resumenes. Si queda cualquier error no recuperado, se completa el resto del trabajo y el CLI devuelve 1; HTTP devuelve 500. Se conserva el resultado parcial en `TrabajoProgramado.ultimoResultado` y en los logs del CLI.

La perdida del bloqueo es una excepcion de seguridad: las fases se intentan, pero su comprobacion falla antes de iniciar nuevas escrituras o envios. No se continua trabajando sin propiedad del lock.

## Categorias

- Solo organizaciones activas con plan Activo/Prueba y fincas activas, dentro de su contexto multitenant. El cursor y las escrituras conservan organizacion y finca.
- Solo `Animal.estado = Activo` con fecha de nacimiento no nula. Vendidos y muertos no se recorren ni cambian por envejecimiento. Las lecturas habituales conservan su categoria persistida.
- Campo opcional `fechaProximoCambioCategoria`, sin default. Fechas futuras difieren la revision; `null` sella una categoria final (Vaca/Toro o Chancha/Cerdo adulto). No se agregan categorias Verraco o Engorde.
- Son candidatos la fecha vencida o la ausencia del campo. Por tanto, recuperar un cron atrasado no exige que se ejecute exactamente el dia del umbral. La primera corrida prepara los registros legados gradualmente, sin migracion manual de animales.
- Se mantienen las reglas de edad actuales: bovinos 12/24 meses; porcinos 3/7 meses, segun sexo. Se usa el mismo calendario UTC de la clasificacion existente. Fin de mes y bisiestos siguen ese contrato; no se cambian las reglas reproductivas.
- `QueryCursor` con `batchSize: 250`, proyeccion reducida, `lean` y buffers de hasta 250 operaciones. Se escriben solo categoria/fecha modificadas, mas timestamps normales de Mongoose. `bulkWrite` usa `ordered:false` y contabiliza sus exitos parciales si devuelve error.
- Los filtros de escritura comparan estado activo, finca, nacimiento, sexo, especie, categoria y marcador leidos. Una venta o correccion concurrente no recibe calculos basados en el snapshot viejo.
- Alta/document.save, insertMany y edicion individual recalculan la agenda. Las mutaciones masivas ajenas al cron la invalidan cuando tocan campos relevantes para que se reconstruya en el siguiente recorrido. El cron no invalida su propio marcador. La ruta de baja conserva la categoria al corte; una reactivacion vuelve a programar el cambio.
- Una escritura administrativa directa con `collection` omite hooks. Si cambia datos de clasificacion, debe recalcular la agenda o quitar el marcador deliberadamente. No editar este campo desde formularios ni DTO externos.

## Indice y despliegue

Indice parcial `agenda_categoria_activa`: `{organizacionId:1, fincaId:1, fechaProximoCambioCategoria:1}`, con filtro `{estado:'Activo'}`. Soporta la busqueda por finca y elegibilidad. Se verifico el plan natural de MongoDB real con IXSCAN sobre este indice, sin forzar hint.

Tras respaldo y revision de la base de destino, crear/verificar una sola vez el indice de forma aditiva desde el backend del despliegue:

```sh
npm run indexes:categorias
```

El comando exige MONGODB_URI explicita, comparte las validaciones de entorno de produccion y usa la misma MONGODB_DB/DB_NAME que el backend. No modifica animales ni elimina indices ajenos. Alternativamente, el procedimiento existente `indexes:sync` incluye este indice, pero sincroniza todos los modelos y no debe ejecutarse sin revisar ese alcance.

Mantener `MONGODB_AUTO_INDEX=false` en los procesos de produccion. Sin el indice el codigo no lo crea silenciosamente: debe completarse el paso operativo para evitar exploraciones costosas. No se ejecuto ningun comando contra Atlas durante el desarrollo.

No hay variables nuevas obligatorias. Desplegar backend y Cron Job con el mismo commit. El horario actual `0 12 * * *` mantiene las 06:00 de Costa Rica. El primer Trigger Run puede crear avisos/enviar correos reales y preparar mas marcadores; revisar logs antes de repetirlo.

## Bloqueo y telemetria

Se conserva la clave de mantenimiento `alertas-operativas`; resumenes standalone conserva `resumenes-email-premium`. No son indices TTL que eliminen documentos: son leases con token y bloqueadoHasta.

- CRON_LOCK_MS: vigencia renovable, 30 minutos por defecto. Valores ausentes, no finitos o menores de un segundo usan el valor por defecto.
- Heartbeat cada cinco minutos o un tercio del lease si este es menor; timer `unref`. La renovacion exige el token vigente, estado Ejecutando y lease no vencido. Un proceso no revive un lock expirado ni renueva el de otro.
- Se espera cualquier renovacion en curso antes de finalizar. Siempre se detiene el temporizador y se intenta liberar con filtro por token, sin liberar un propietario nuevo.
- Comprobacion antes de lotes, tareas y envios. Una operacion ya enviada a MongoDB/Resend no es reversible; el control evita iniciar trabajo posterior cuando se detecta perdida de propiedad.
- Cada fase informa duracionMs y memoriaMb con inicio/pico/fin para rss, heapUsed y heapTotal. El pico es el maximo de las muestras de progreso, no un perfil continuo del sistema operativo.

El JSON incluye `categorias: {status,escaneados,actualizados,sellados,errores,resultados,duracionMs,memoriaMb}`, `alertas: {status,enviadas,notificacionesCreadas,errores,...}`, y `resumenes` con sus envios, errores y metricas. Los totales legados y resultados por organizacion se conservan. `actualizados` cuenta cambios de categoria; `sellados` cuenta documentos modificados por categoria/agenda, no solo categorias. En conflictos optimistas un candidato puede contarse como escaneado sin escritura; se recupera si sigue siendo elegible.

## Resumenes en el mismo servicio

Actualizado el 2026-11-05: los resumenes son la tercera fase predeterminada de `job:alertas`. `CRON_INCLUDE_SUMMARIES=false` permite desactivarla explicitamente. La fase tiene su propio lease, comprueba tambien el lease maestro y puede ejecutarse aunque categorias o alertas hayan fallado. El resultado distingue una omision por otra ejecucion de un envio completado.

Usar un unico cron diario (`0 12 * * *` = 06:00 Costa Rica), sin segundo servicio. La fase usa `cron_diario`: ignora hora preferida, conserva dia semanal y clave de periodo. Verificar destinatarios, remitente y zona horaria. La programacion interna mantiene resumenes en su propio intervalo horario y respeta la hora preferida; no debe coexistir con el cron externo.

No ejecutar ademas otro job de resumenes ni el programador interno. Los resumenes siguen usando preferencias por usuario, permiso financiero, fincas autorizadas y ultimoPeriodo. Esto no promete entrega exactamente una vez ante un fallo entre Resend y la persistencia del envio. `EMAIL_ALERTS_ENABLED=false` afecta las alertas, no sustituye las preferencias ni desactiva los resumenes opt-in.

## Verificacion

- `npm test`: suite backend completa, incluida `tests/cron-categorias-integracion.test.js` con MongoDB real desechable en loopback. Requiere mongod local; CIERRE_MONGOD puede indicar el ejecutable.
- Reales: excluir vendidos/muertos/otra organizacion, catch-up de cinco dias, segunda corrida escaneados=0, 601 animales en buffers 250/250/101, indice natural sin COLLSCAN, venta/nacimiento concurrentes, agenda de altas/ediciones/bulk, fallo de finca aislado, renovacion y perdida de lease.
- Orquestador/CLI: independencia de fases incluso con errores globales, resumenes por defecto (destinatarios opt-in), registros de memoria/duracion y codigos de salida 0/1 sin DB ni envios externos.
- Smoke `documentation/cierre-smoke-integrado.cjs`: X5 prueba las fases de categorias/alertas mediante HTTP y el endpoint de resumenes; indices y replica set reales temporales, Resend simulado. Usar CIERRE_OUTPUT_DIR en TEMP para conservar las evidencias historicas del repo.

Los ensayos no certifican un numero de fincas o animales soportados en Atlas Flex. Medir las ejecuciones productivas y ajustar recursos solo con evidencia.

Resultado local final: `npm test` 422/422 PASS, salida 0, incluidas diez pruebas con MongoDB real temporal. Smoke completo 16/16 pasos y 9/9 comprobaciones PASS, salida 0; X5 PASS con ambas fases, ademas del endpoint de resumenes. MongoDB 8.0.5, 75 modelos e indices verificados. El smoke conserva dos avisos preexistentes `docs?.some is not a function` al inyectar fallos deliberados de auditoria en comprobaciones de rollback; no se ocultan ni se modificaron como parte de este trabajo. Evidencias de esta ejecucion en TEMP/cir-cron-cursor-smoke, sin sobrescribir las evidencias historicas versionadas. No se uso Atlas ni se enviaron correos reales.

Ampliacion de resumenes ejecutivos (2026-11-05): backend 435/435 PASS, frontend 60/60 PASS y build salida 0. Smoke repetido 16/16 + 9/9 PASS con tres fases predeterminadas. Ver resumen-ejecutivo-premium.md para reglas de contenido, permisos, cron diario y limites de reintento.
