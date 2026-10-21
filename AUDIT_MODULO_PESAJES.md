# Auditoría del módulo de pesajes y ganancia de peso

Fecha: **15 de octubre de 2026**. Base: árbol de trabajo actual, con sus cambios locales; HEAD `e7bffc6`.

Se leyó [Agents.md](Agents.md). El archivo solicita revisar pesajes, sincronización del inventario, carga masiva, GMD, reportes y barreras de plan; su texto termina truncado en «Curvas de Crecimiento e». Se cubrieron los puntos disponibles y se completó la revisión de interfaz, permisos, trazabilidad y funcionamiento offline. Esta entrega documenta la auditoría; no modifica lógica de negocio ni datos.

## 1. Resumen ejecutivo

**El módulo no está completamente correcto.** La fórmula central de GMD funciona para series válidas y conserva pérdidas de peso, pero existen problemas de consistencia entre pesajes, peso actual, bitácoras, fincas y reportes. Se identificaron **11 hallazgos: 7 P1 y 4 P2**.

Los riesgos prioritarios son:

- Guardado, edición y borrado no son atómicos con sus efectos sobre Animal y eventos. Dos recálculos simultáneos pueden dejar un peso actual obsoleto.
- La lectura del historial contempla fincas anteriores autorizadas, pero el recálculo de peso actual solo consulta la finca activa.
- La carga masiva admite entradas repetidas del mismo animal y no tiene idempotencia. Un fallo posterior a insertar puede devolver error dejando los pesajes guardados.
- La API acepta campos internos sin un DTO estricto y no comprueba fechas contra nacimiento, muerte o fecha actual.
- El peso actual puede editarse directamente desde Inventario/Excel sin crear un Pesaje. La importación y el CRUD tampoco mantienen los mismos datos derivados y eventos.
- La respuesta de POST de pesajes por lote entrega analítica que el GET del lote elimina cuando el plan no la incluye.

### Controles que sí funcionan

- El peso individual se valida como finito y positivo; el esquema exige al menos 0.01 kg. La carga masiva valida pesos y pertenencia actual al lote antes de insertar.
- En ejecución secuencial y dentro de la misma finca, el recálculo consulta el pesaje más reciente por `fecha` y `createdAt`. Una carga retroactiva no sustituye por sí sola al pesaje más reciente.
- Eliminar el último pesaje busca el anterior para actualizar el peso actual; no se limita a dejar el valor borrado. Si no encuentra ninguno en la finca activa, asigna null.
- GMD con diferencia temporal cero devuelve null y no divide entre cero. Una pérdida de 10 kg en 10 días devuelve **−1 kg/día**.
- El historial por animal incluye fincas autorizadas inactivas y muestra la finca de cada medición. Se mantiene el aislamiento organizacional.
- Las rutas de reportes avanzados tienen permisos y barreras de plan. DELETE individual está limitado a Administrador.

### Verificación realizada

`npm.cmd test` en `backend`: **226 pruebas aprobadas, 0 fallidas, 0 omitidas**. Se ejecutaron además diez comprobaciones aisladas con código real, validación/hooks de Mongoose y almacenamiento sustituido por dobles en memoria. Los resultados figuran en la sección 7.

No se conectó a MongoDB productivo ni se ejecutaron peticiones HTTP contra un servidor. Las pruebas de controladores no incluyen autenticación de red; roles y planes se contrastaron separadamente en rutas/configuración. La concurrencia se reprodujo intercalando operaciones en memoria, no mediante un clúster MongoDB. No se realizó navegación automatizada. La suite verde no constituye aceptación de los hallazgos.

## 2. Mapa de datos, APIs y operaciones

### Campos realmente implementados

| Modelo | Campos relevantes | Capacidades que no deben suponerse |
| --- | --- | --- |
| [Pesaje](backend/models/Pesaje.js) | `animal`, `fecha` con default Date.now, `peso`, `etapaProductiva`, `aumentoKg`, `diasDesdeUltimoPesaje`, `observaciones`, `registradoPor`, organización/finca y timestamps. Índice por animal/fecha no único. | No persiste `gmd`, `tipoPesaje`, `condicionCorporal` ni `loteId`. El nombre real del peso es `peso`, no `pesoKg`. |
| [Animal](backend/models/Animal.js#L63) | `pesoActual`, `pesoNacimiento`, `pesoCompra`, `pesoDestete`, `pesoVenta` y fechas de nacimiento/destete/compra/venta/muerte. | No tiene `fechaUltimoPesaje`. Ese nombre aparece calculado en respuestas de reportes, no actualizado en el documento Animal. |
| EventoAnimal / EventoLote | El CRUD de pesajes genera proyecciones; el lote genera un evento grupal con los IDs de las mediciones. | No constituyen revisiones completas de los valores anteriores ni una relación histórica de lote dentro de Pesaje. |
| Camada | Pesos de nacimiento/destete colectivos. | No son mediciones individuales de la colección Pesaje ni se convierten automáticamente en ellas. |

### Caminos de escritura y lectura

| Flujo | Implementación | Comportamiento |
| --- | --- | --- |
| Individual | [rutas pesaje](backend/routes/pesaje.js), [pesaje-controller](backend/controllers/pesaje-controller.js) | GET/POST `/api/pesajes`, GET/PUT/DELETE `/:id`; permite animal sin lote. Genera eventos y recalcula pesoActual. |
| Historial de animal | GET `/api/pesajes/animal/:animalId` | Consulta fincas históricas autorizadas; devuelve finca y registrador poblados. |
| Masivo de lote | POST `/api/lotes/:id/pesajes`; [registrarPesajesLote](backend/services/lote-service.js#L367) | Filtra pesos vacíos, valida lote activo/pertenencias y utiliza insertMany, seguido de actualizaciones/eventos. |
| Protocolo de engorde | [ejecutarPaso](backend/services/protocoloEngorde-service.js#L158) | Paso PESAJE llama al servicio masivo y después guarda ejecución/tarea; requiere función de protocolos y permiso/asignación. |
| Excel, hoja PESAJES | [importarPesajes](backend/services/importarExcel-service.js#L756) | Busca animal y pesaje existente del día; crea/actualiza por fila, luego recalcula aumentos, días y pesoActual. No sincroniza eventos de pesaje. |
| Inventario/formulario/Excel | [animal-dto](backend/services/animal-dto.js#L9), [FormularioAnimal](frontend/src/Components/FormularioAnimal.js#L292) | Puede escribir pesoActual directamente, sin crear una medición. |
| Compras | [compraAnimalController](backend/controllers/compraAnimalController.js#L179) | Inicializa pesoActual con peso de compra; esto no crea un Pesaje de compra. |
| Crecimiento general | GET `/api/reportes/crecimiento-pesajes` | Serie filtrada por período; GMD global por animal y promedio de animales. |
| Crecimiento porcino / engorde | `/api/reportes/porcinos/crecimiento`, `/api/reportes/engorde` | ICP por intervalos/etapas e IEE por componentes, usando [indicesProductivos-service](backend/services/indicesProductivos-service.js). |
| Peso de destete | `/api/reportes/destete/peso` y `/destete/peso/analitica` | Usa Animal.pesoDestete y los pesos colectivos de Camada; [reportePesoDestete-service](backend/services/reportePesoDestete-service.js). No consulta Pesaje. |

El formulario individual está integrado en [Pesajes.js](frontend/src/Components/Pesajes.js); no se encontró un FormularioPesaje separado. La carga colectiva está en [Lotes.js](frontend/src/Components/Lotes.js), y también en [ProtocolosEngorde.js](frontend/src/Components/ProtocolosEngorde.js). La ficha Animal muestra tabla de evolución/diferencias; las curvas están en [Reportes.js](frontend/src/Components/Reportes.js#L171).

## 3. Sincronización, transacciones e historial

### Respuestas directas sobre pesoActual

| Caso | Resultado actual |
| --- | --- |
| Nuevo pesaje reciente, misma finca | Busca el último y escribe su peso en Animal. |
| Pesaje retroactivo, misma finca | Mantiene el peso del más reciente, porque ordena por fecha descendente y después createdAt. |
| Editar peso o fecha | Guarda la edición y vuelve a buscar el último. Si se cambia de animal, recalcula también el anterior. |
| Borrar último pesaje con otro anterior en la misma finca | Restaura el peso de ese anterior. |
| Borrar único pesaje de la finca activa | Escribe null; no recupera pesoCompra/pesoNacimiento ni pesos de otra finca. |
| Actualizar fechaUltimoPesaje | No ocurre: ese campo no existe en Animal. |
| Editar pesoActual desde Inventario | Cambia el campo sin crear Pesaje; una medición posterior puede reemplazarlo. |
| Recalcular GMD de registros posteriores | GMD no se persiste en Pesaje: los reportes la calculan al consultar. Los campos persistidos aumentoKg/días sí pueden quedar desactualizados. |

### PES-01 — P1: falta de atomicidad y recálculos concurrentes obsoletos

**Evidencia:** [createPesaje](backend/controllers/pesaje-controller.js#L80), [updatePesaje](backend/controllers/pesaje-controller.js#L159) y [deletePesaje](backend/controllers/pesaje-controller.js#L214) escriben/eliminan el Pesaje antes de sincronizar eventos y pesoActual. No comparten una transacción. El helper [actualizarPesoActualAnimal](backend/controllers/pesaje-controller.js#L16) hace una consulta y después una actualización sin comparación de fecha/versión.

**Reproducción:** un recálculo leyó 300 kg y quedó esperando antes de escribir; otro leyó/escribió el nuevo último peso de 400 kg; al terminar el primero, Animal quedó en **300 kg**. No se requiere que el algoritmo elija mal el último registro: el resultado leído puede quedar obsoleto antes de su escritura.

**Pesaje masivo:** no es un bucle de 30 saves independientes. Usa `Pesaje.insertMany` y luego Promise.all para pesoActual/eventos, sin transacción común. La respuesta a «¿qué pasa si falla uno?» depende del momento:

| Momento del fallo | Consecuencia |
| --- | --- |
| Peso inválido o animal que no pertenece al lote, detectado por el servicio | Rechaza antes de insertar. |
| Validación/casting Mongoose de un documento con insertMany ordenado | El comportamiento instalado valida antes de enviar; la comprobación con un peso menor a 0.01 produjo **cero llamadas al almacenamiento**. No se afirma que se guarden los otros 29 en este caso. |
| Fallo de escritura en MongoDB durante un insertMany sin transacción | No hay garantía de todo-o-nada; puede quedar un prefijo escrito. No se reprodujo este fallo contra MongoDB real. |
| Fallo en pesoActual, bitácora o evento grupal después de insertar | Los pesajes ya están guardados; algunos efectos pueden faltar. En la prueba aislada, fallar bitácora rechazó la operación pero conservó los nuevos pesajes. |

La ejecución de un paso PESAJE de protocolo añade después más escrituras de tarea/ciclo. Un fallo antes de marcarlo realizado permite reintentar sobre mediciones ya creadas. No hay idempotencia de medición/operación en estos caminos.

**Acción:** servicio común transaccional o mecanismo durable de reconciliación, serialización/CAS del peso vigente e idempotencia de petición. La corrección debe cubrir también borrar/reasignar una medición y fallos posteriores al insertMany.

### PES-02 — P1: historial multi-finca más completo que el recálculo del peso

**Lo correcto:** [getPesajesPorAnimal](backend/controllers/pesaje-controller.js#L131) valida animal/membresía, incluye fincas autorizadas con `incluirInactivas: true` y registros legados sin finca, y omite solo el filtro automático de finca. La organización sigue aislada. [La tabla](frontend/src/Components/Animales.js#L1426) identifica la finca de cada peso.

**El defecto:** el helper de pesoActual, el masivo y el recálculo de Excel consultan Pesaje con el filtro automático de la finca activa. Se confirmó ejecutando hooks reales: la búsqueda recibió `fincaId` de la finca B y, sin registros allí, la actualización escribió null.

**Ejemplos:** un animal trasladado A→B tiene 400 kg en A. Se añade en B una medición retroactiva de 300 kg: el recálculo puede elegir 300 porque no compara con A. Al eliminar el único pesaje de B puede quedar null aunque el historial autorizado siga mostrando el de A. El problema no es la ausencia de lectura histórica, sino criterios distintos para derivar el valor actual.

Los reportes habituales de crecimiento/ICP/IEE y el resumen de lote también consultan la finca activa. El consolidado de protocolos tiene un alcance organizacional más amplio y usa la historia disponible de los miembros actuales; los resultados no son necesariamente comparables. Debe explicitarse si un indicador describe crecimiento ocurrido en esa finca, crecimiento durante la pertenencia o historia completa del animal.

Las rutas normales GET/PUT/DELETE por ID mantienen finca activa. Que un usuario vea una medición antigua desde B no implica que pueda corregirla por ese mismo CRUD; cambiar a A tampoco hace que el animal trasladado vuelva a pertenecer allí para la validación de edición.

**Acción:** definir peso vigente organizacional del animal y política de lectura/rectificación histórica, conservando finca de origen. Separar esa derivación interna de los permisos de visualización del solicitante; no eliminar indiscriminadamente el aislamiento. Probar A→B, finca A inactiva, retroactivos y borrado del único registro en B.

### PES-06 — P1: pesoActual tiene vías de escritura sin medición

**Evidencia:** el DTO de Animal permite pesoActual y [el controlador](backend/controllers/animal-controller.js) lo guarda como campo de negocio. El formulario presenta el valor editable. Excel INVENTARIO admite PESO_ACTUAL_KG y guarda Animal sin generar Pesaje por ese cambio. Compras también inicializa pesoActual sin un registro de la colección de pesajes.

**Impacto:** Animal puede mostrar 500 kg mientras su último Pesaje dice 450 kg. El siguiente recálculo vuelve a 450. Reportes que usan Pesaje, indicadores que leen Animal y peso mostrado en una venta/traslado pueden discrepar. Sin una fecha/fuente del valor inicial no se puede ordenar de manera fiable una estimación frente a mediciones.

No toda inicialización desde compra/nacimiento debe prohibirse: falta una política que distinga peso inicial estimado/de origen y peso medido vigente. El borrado del único pesaje tampoco define un retorno a esos valores, sino null.

**Acción:** declarar Pesaje como fuente de peso medido vigente o modelar explícitamente origen, fecha y tipo de peso. Convertir cambios manuales en mediciones/correcciones trazables, o impedir sobrescribir el peso derivado. Conciliar datos existentes antes de imponer la regla.

### PES-07 — P2: datos derivados y eventos distintos según la vía de escritura

[recalcularPesajesAnimal](backend/services/importarExcel-service.js#L739) actualiza aumentoKg y diasDesdeUltimoPesaje después de importar. El CRUD individual y el masivo no ejecutan ese recálculo. Por tanto, editar/borrar una medición importada puede dejar valores persistidos de las siguientes calculados con el dato anterior. Los reportes GMD sí recalculan desde fecha/peso al consultarse; no debe confundirse este defecto con una GMD almacenada que no existe.

La importación no crea/actualiza EventoAnimal/EventoLote: importar una corrección puede cambiar el peso y conservar una bitácora con el valor previo. El CRUD genera EventoLote usando el **lote actual** del animal, no el lote en la fecha del pesaje. Si se edita el mismo pesaje después de cambiar de lote, puede añadir una proyección al lote nuevo y dejar la del antiguo, porque la limpieza solo se ejecuta al cambiar de animal.

Los pesajes masivos producen un evento grupal con IDs; borrar una medición individual elimina eventos vinculados por referencia a ese Pesaje, pero no actualiza necesariamente el resumen grupal cuyos IDs están dentro de metadata. La relación histórica de lote no está en Pesaje.

`registradoPor` se asigna al crear, pero no hay historial de revisiones ni editor dedicado; el upsert de bitácora vuelve a escribir creadoPor con el usuario que corrige. La auditoría HTTP general aporta evidencia de peticiones, no una revisión de negocio completa del antes/después.

**Acción:** unificar proyecciones de todas las vías, derivar los campos calculados al leer o mantenerlos consistentemente, y registrar pertenencia temporal/operación de origen. Preservar actor original, editor y motivo de rectificación; no reconstruir el lote histórico a partir de la ubicación actual.

## 4. Integridad matemática, fechas y reportes

### Fórmulas y tratamiento de datos insuficientes

[calcularGmd](backend/services/indicesProductivos-service.js#L46) usa la primera y última medición válida del conjunto recibido:

`GMD = (pesoFinal − pesoInicial) / ((fechaFinal − fechaInicial) / 86 400 000)`.

Se filtran pesos no finitos/no positivos y fechas inválidas; se ordena por fecha. Menos de dos registros o duración ≤0 devuelve null. Se aceptan ganancias negativas. Fechas con horas distintas producen días fraccionarios; dos registros del mismo día civil no necesariamente tienen duración cero si sus timestamps son diferentes.

| Cálculo | Criterio observado |
| --- | --- |
| Crecimiento general | GMD entre extremos por animal; promedio aritmético de GMD de animales con datos. Promedio mensual = GMD × 30.44, no suma de ganancias realmente observadas por mes calendario. |
| Lote | Pesajes desde entrada de cada pertenencia; suma ganancias/suma animal-días. Peso cercano a entrada se busca hasta 30 días antes o después, pero ese dato no necesariamente participa en la GMD desde entrada. |
| ICP porcino | Intervalos consecutivos, etapa/meta y ponderación por animal-días. Omite intervalos de duración cero. |
| IEE engorde | GMD ponderada, cumplimiento, tiempo y supervivencia según configuración. Los pesos actuales se buscan hasta el fin del período; GMD usa mediciones dentro del período. |
| Destete | GMD predestete a partir de pesos de nacimiento/destete y edad positiva; ajuste bovino a 205 días restringido por su rango implementado y ajuste porcino por tabla de factores. No utiliza la serie de Pesaje. |

Los promedios simple y ponderado no son equivalentes ni un error por sí mismos. Deben identificarse en pantalla para que no se interpreten como el mismo indicador. Se revisó la implementación matemática; esta auditoría no certifica las metas o tablas productivas como recomendación zootécnica.

### PES-04 — P1: fechas fuera del ciclo de vida alteran peso e indicadores

**Evidencia:** [validarPesaje](backend/controllers/pesaje-controller.js#L51) comprueba existencia del animal y peso, no nacimiento, muerte/venta ni fecha actual. La fecha solo se valida como Date en el esquema; acepta una fecha de 2999. La carga masiva valida pertenencia **actual**, no pertenencia en la fecha histórica informada, y no comprueba el estado de cada Animal por separado.

**Impacto:** una fecha futura pasa a ser la más reciente y domina pesoActual. Se pueden asociar mediciones anteriores al nacimiento, posteriores a una salida o atribuidas a un lote distinto al de esa fecha. Los datos extremos también afectan GMD, alertas y proyecciones. La captura de un peso histórico de un animal ya vendido/muerto puede ser legítima: la regla debe basarse en la fecha del hecho, no solo bloquear todo animal no activo.

**Acción:** reglas temporales de medición y corrección, validación de pertenencia a fecha, y advertencias de valores atípicos con política explícita. Los rechazos deben ocurrir antes de escribir. Validar pesos conforme al mismo mínimo en servicio y esquema.

### PES-05 — P1: duplicados y desempate inconsistente de mediciones

**Evidencia:** no existe índice único ni idempotencia de medición. El masivo deduplica los IDs para comprobar pertenencias, pero **no deduplica las filas** que envía a insertMany. Dos filas del mismo animal/fecha con 200 y 210 kg fueron aceptadas en la comprobación aislada.

Excel rechaza duplicados del mismo DIIO/fecha dentro del archivo y busca un registro del día al importar; el CRUD individual acepta varios. Si ya hay varios, el findOne de importación no fija cuál corregir. Además, ese intervalo diario usa setHours del servidor, mientras otras entradas vienen como fechas UTC.

El pesoActual desempata por createdAt, pero los cálculos y varias consultas ordenan solo por fecha. En inserciones masivas pueden coincidir también los timestamps de creación. Se reproducen resultados distintos por la falta de una política común:

| Serie | GMD entre extremos | Intervalos válidos de ICP |
| --- | --- | --- |
| Día 1: 100 kg; día 1 misma hora: 200 kg; día 2: 210 kg | 110 kg/día | Omite el primer intervalo de duración cero; el siguiente aporta 10 kg/día. |

No es división por cero; son mediciones conflictivas que se interpretan de forma distinta. Si se admiten varias mediciones por día, deben conservar hora/propósito y una regla de selección/corrección; si solo se admite una, debe imponerse consistentemente en todas las vías.

**Acción:** definir identidad de medición, política diaria y desempate estable; rechazar filas repetidas accidentalmente y proteger reintentos. Conciliar duplicados antes de crear índices. Probar edición, borrado e importación con fechas iguales.

### PES-09 — P2: alertas y ceros que no representan la evidencia disponible

**Alerta de reciente:** [getCrecimientoPesajes](backend/controllers/reporte-controller.js#L1006) calcula «sin pesaje reciente» usando únicamente la serie ya filtrada por el período del reporte, pero compara contra la fecha actual. Se reprodujo un animal pesado ayer que aparece sin pesaje reciente al consultar un período antiguo que excluye ese registro. Debe consultarse el último pesaje global permitido o definir la alerta respecto del cierre del período, sin mezclar ambos criterios.

**Nulos convertidos en cero:** [crearAnalisisPesajesAnimal](backend/controllers/reporte-controller.js#L974) sustituye GMD/ganancia/días no calculables por 0. Con dos mediciones del mismo instante reporta ganancia diaria 0 aunque el helper devolvió null. El resumen también presenta 0 cuando no hay animales evaluables. ICP/IEE manejan datos insuficientes más explícitamente.

**Peso de nacimiento ausente:** en crecimiento de crías se usa pesoNacimiento=0 si falta y se calcula ganancia desde nacimiento contra ese cero. El peso actual del reporte significa último peso **dentro del rango**, no necesariamente el peso vigente del animal. El conjunto de animales se selecciona por estado actual excluyendo muertos/vendidos, por lo que un reporte histórico cambia al vender un animal después del período.

**Acción:** mantener null y cobertura de datos; separar último pesaje global del período analizado, y definir población histórica/actual. Etiquetar peso al cierre/período y no fabricar una ganancia desde nacimiento sin dato base.

## 5. Seguridad, permisos y barreras de plan

### PES-03 — P1: campos internos y autoría editables desde el payload

POST expande req.body antes de fijar peso/etapa/registradoPor. PUT pasa req.body a `pesajeAnterior.set`, sin lista permitida. Esto admite organización/finca, registradoPor en edición y campos derivados como aumentoKg/días. El cambio de animal sí se valida contra su existencia en la finca activa y recalcula los dos animales; no equivale a permitir cualquier ID inexistente.

El [plugin organizacional](backend/models/plugins/organizacion-plugin.js) limita consultas, pero solo completa tenant ausente en validación. Se confirmó que un documento Pesaje valida una organización/finca explícitas distintas al contexto y aumentoKg arbitrario. No se afirma que un PUT con operadores Mongo funcione como actualización directa: aquí se usa document.set. El defecto comprobado es aceptación de campos de esquema que deben controlar el servidor.

**Impacto:** registros fuera del contexto esperado, autoría falsificable en edición, campos calculados incompatibles con la medición y proyecciones que pueden seguir bajo otra finca. La lectura aislada no garantiza integridad de escritura.

**Acción:** DTO de campos de captura, tenant/autor derivados de sesión y derivados calculados por servidor. Prohibir reasignación de tenant y conservar autor/editor. Probar POST/PUT directos y evitar que correcciones legítimas de animal generen efectos parciales.

### PES-08 — P1: fuga de analítica por la respuesta de pesaje masivo

Las rutas de crecimiento/engorde y destete avanzado usan `analiticaProductiva`; el plan mínimo configurado es **GESTION**. Los protocolos de engorde requieren **PRO** mediante `protocolosEngorde`. El registro ordinario de peso está disponible sin exigir analítica; esa separación es correcta.

[GET lote](backend/controllers/lote-controller.js#L67) aplica `proyectarDetalleLotePorPlan`, que elimina GMD, cumplimiento, alcanzaron objetivo y meta cuando falta analítica. Sin embargo, [POST pesajes del lote](backend/controllers/lote-controller.js#L133) devuelve `obtenerDetalleLote` directamente. Se confirmó que la respuesta conserva `gmdPromedioLote`, mientras la proyección con incluirAnalitica=false lo elimina. Esta ruta solo exige pesajes.gestionar, no la función analítica.

**Acción:** aplicar la misma proyección por plan a todas las respuestas que devuelvan detalle de lote, incluidas mutaciones. No bloquear la captura básica de pesajes para corregir la fuga. Probar GET y POST con el mismo usuario en ESENCIAL y GESTION.

### Matriz de roles

| Rol | Leer pesajes | Crear/editar individual | Borrar individual | Registrar por lote | Reportes de crecimiento/engorde* |
| --- | --- | --- | --- | --- | --- |
| Administrador | Sí | Sí | Sí | Sí | Sí |
| Encargado | Sí | Sí | No | Sí | No |
| Veterinario | Sí | Sí | No | Sí | No |
| Trabajador | No | No | No | No | No |
| Consulta | Sí | No | No | No | Sí |
| Contador | No | No | No | No | Sí |

\* Además del rol requiere la función de plan. Reporte básico de destete exige Reportes, pero no analiticaProductiva. Un trabajador puede registrar un paso PESAJE **asignado** desde un protocolo habilitado; es una autorización específica de protocolo, no acceso general al CRUD. Fuentes: [permisosRoles](backend/config/permisosRoles.js), [pesaje](backend/routes/pesaje.js), [lotes](backend/routes/loteRoutes.js#L25), [reportes](backend/routes/reporte.js), [protocoloEngordeRoutes](backend/routes/protocoloEngordeRoutes.js), [rolPuedeEjecutarPaso](backend/services/protocoloEngorde-service.js#L32).

### PES-10 — P2: permisos de interfaz desalineados

[Pesajes.cargarDatos](frontend/src/Components/Pesajes.js#L78) pide pesajes, animales y **potreros** en Promise.all. Veterinario puede leer/gestionar pesajes, pero no tiene potreros.ver. El 403 de esa petición impide asignar también los resultados de animales/pesajes; una dependencia opcional bloquea el módulo autorizado.

Los botones Editar y Eliminar dependen ambos de !soloLectura. Encargado/Veterinario tienen gestión, por lo que ven Eliminar aunque la API lo reserva a Administrador. La API sí deniega; no se reporta una escalada de privilegios.

En Lotes, el botón de pesajes depende de gestión de **Lotes**, que no tiene Veterinario, aunque la ruta masiva sí le permite pesar. La ficha de animal también solicita historial de pesos para roles con lectura de Inventario, como Trabajador, que no tienen pesajes.ver.

**Acción:** permisos independientes de consultar, capturar y borrar; cargar catálogos opcionales según permisos o con recuperación independiente; alinear las acciones del lote y ficha. Probar cada rol en navegador además de las rutas.

## 6. Presentación y operación en campo

### PES-11 — P2: curva temporal, filtros y soporte offline incompletos

- [LineaPeso](frontend/src/Components/Reportes.js#L171) distribuye X por índice, no por distancia entre fechas. Pesajes separados por 1 y por 90 días quedan igualmente espaciados; no hay ejes/fechas que permitan interpretar la pendiente como velocidad de crecimiento. El cálculo GMD del backend sí usa días reales.
- Las fechas civiles enviadas como YYYY-MM-DD se interpretan en UTC y se presentan con zona del navegador. En Costa Rica pueden aparecer el día anterior. Los filtros de Pesajes construyen límites en hora local, por lo que una medición de medianoche UTC puede quedar fuera del día seleccionado. La fecha inicial se calcula al cargar el módulo y se reutiliza al abrir formularios; una sesión abierta puede conservar el día anterior.
- El filtro por potrero usa Animal.potreroActual, no la ubicación al tomar el peso. No hay potrero/lote histórico en Pesaje que respalde otra interpretación.
- La tabla de ficha calcula diferencias en kg, no GMD. Muestra finca, pero no el registrador poblado; el listado principal tampoco ofrece revisión de autoría/correcciones. La presentación puede mostrar «Sin pesajes» junto con un error de carga.
- Las APIs descargan todos los pesajes del alcance; la paginación de UI opera sobre lo ya cargado. Los gráficos/resúmenes muestran subconjuntos, no una curva exhaustiva de todos los animales.
- IndexedDB contiene inventario, tareas, potreros y eventos animales, pero no la colección de pesajes. El sincronizador admite tareas/notas de bitácora, no capturas de peso. Tener un evento de bitácora cacheado no equivale a disponer de la serie de mediciones. El registro ordinario se deshabilita offline y no hay cola de pesajes masivos o individuales.

**Acción:** eje X por tiempo real, unidades kg/día claras, fechas civiles consistentes y filtros históricos correctamente etiquetados; distinguir carga fallida de vacío. Añadir paginación de servidor. Si se requiere pesar sin señal, diseñar una cola de mediciones con contexto, fecha real, idempotencia y conflictos, además de una caché histórica autorizada.

## 7. Pruebas específicas y plan de acción

### Comprobaciones aisladas ejecutadas

Se utilizaron datos sintéticos y dobles de almacenamiento; no son pruebas de integración contra MongoDB. La validación previa de insertMany y el filtro de finca se comprobaron usando código/hooks reales de la versión Mongoose instalada.

| Prueba | Resultado observado |
| --- | --- |
| R1 — GMD básica | Misma fecha exacta devuelve null; 100→90 kg en 10 días devuelve −1 kg/día. |
| R2 — Duplicados y null | Serie 100/200 kg al mismo instante y 210 al día siguiente: GMD global 110, intervalo válido 10; reporte general convierte GMD no calculable en 0. |
| R3 — Validación masiva | insertMany con una fila menor al mínimo del esquema falla antes de llamar al almacenamiento: 0 llamadas. |
| R4 — Esquema y contexto | Acepta fecha 2999, tenant explícito ajeno y aumentoKg arbitrario. |
| R5 — Último por finca | Hook incorpora finca activa a búsqueda; sin medición allí, actualiza pesoActual=null. |
| R6 — Animal repetido | Dos filas del mismo animal/fecha en carga masiva producen dos documentos. |
| R7 — Fallo tras insertar | Error simulado de bitácora rechaza el servicio; las nuevas mediciones permanecen en el almacenamiento simulado. |
| R8 — Plan | POST masivo devuelve GMD que proyectarDetalleLotePorPlan(false) elimina. |
| R9 — Alerta histórica | Animal pesado ayer es clasificado sin pesaje reciente al consultar un período antiguo. |
| R10 — Carrera de recálculo | Escritura tardía de 300 sobrescribe 400, aunque 400 ya es el último pesaje. |

### Prioridades y criterios de cierre

| ID | Prioridad | Corrección | Criterio de aceptación |
| --- | --- | --- | --- |
| PES-01 | P1 | Atomicidad, reconciliación e idempotencia; proteger recálculo concurrente. | Fallos antes/después de insertar no dejan divergencia silenciosa; reintentar no duplica; el peso vigente coincide con el último tras concurrencia. |
| PES-02 | P1 | Derivación de peso con alcance histórico definido. | A→B, retroactivo en B y borrado del único peso B mantienen el último peso válido organizacional; permisos históricos permanecen protegidos. |
| PES-03 | P1 | DTO, autoría y tenant controlados por servidor. | POST/PUT con tenant/autor/derivados manipulados se rechaza o descarta conforme a contrato; no produce referencias/proyecciones incoherentes. |
| PES-04 | P1 | Reglas de fechas y pertenencia a fecha. | Futuro, pre-nacimiento y fuera del ciclo válido se rechazan antes de escribir; captura histórica legítima y reasignación se tramitan explícitamente. |
| PES-05 | P1 | Identidad de medición y política de duplicados. | Misma operación reintentada se aplica una vez; filas repetidas no crean duplicados accidentales; GMD/peso/Excel usan el mismo criterio de desempate. |
| PES-06 | P1 | Fuente de pesoActual y valores de origen. | Editar Inventario/Excel no contradice silenciosamente la última medición; fuente/fecha del peso inicial son visibles; borrar último tiene política definida. |
| PES-07 | P2 | Unificar derivados, eventos y pertenencia histórica. | Corregir/importar/borrar un pesaje actualiza sus proyecciones y datos dependientes sin atribuirlo al lote equivocado ni perder autoría. |
| PES-08 | P1 | Aplicar proyección de plan también en mutaciones. | ESENCIAL captura peso pero no recibe GMD/cumplimiento restringidos por GET ni POST; GESTION sí recibe su analítica. |
| PES-09 | P2 | Alertas con alcance correcto y null explícito. | Pesar ayer evita alerta global aunque el reporte sea antiguo; sin base suficiente se informa no calculable, no cero. |
| PES-10 | P2 | Permisos efectivos en UI y dependencias opcionales. | Veterinario abre/captura individual y masivo sin necesitar Potreros; solo Administrador ve acción de borrado; cada rol ve consultas autorizadas. |
| PES-11 | P2 | Fechas, curva temporal, filtros, paginación y offline. | Un día conserva su fecha al filtrar/mostrar; curvas respetan intervalos; error no aparece como historia vacía; operaciones offline incorporadas se sincronizan una sola vez. |

Orden recomendado: proteger escritura/tenant/fechas, acordar identidad y fuente del peso, corregir atomicidad y alcance multi-finca, cerrar la respuesta sin filtro de plan y después alinear reportes e interfaz. Antes de migrar índices o recalcular todo el inventario, diagnosticar duplicados, pesos actuales divergentes, datos sin finca y fechas inválidas; conservar evidencia de las correcciones.

**Estado de entrega: auditoría completada, remediaciones pendientes.** La suite existente pasó con 226 pruebas. La corrección debe incorporar pruebas de integración, fallos y concurrencia para los criterios anteriores y volver a ejecutar la suite completa.
