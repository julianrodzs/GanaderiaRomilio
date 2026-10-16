# Auditoría del módulo de potreros

Fecha: **15 de octubre de 2026**. Base revisada: árbol de trabajo actual, incluidos cambios locales; HEAD `9081d8a`.

Se leyó [Agents.md](Agents.md): todavía describe la auditoría de bitácora. Por la instrucción expresa del usuario de continuar con **Potreros**, se adaptaron sus criterios de integridad, trazabilidad, fechas, permisos, aislamiento multi-finca y PWA a este módulo. Este documento es una auditoría; no aplica remediaciones ni modifica datos.

## 1. Resumen ejecutivo

**El módulo permite administrar áreas, rotaciones, cobertura y bancos forrajeros, pero no garantiza una ocupación coherente entre potrero, lote y animales.** Se encontraron **12 hallazgos: 7 P1 de integridad y 5 P2 funcionales/de presentación**.

Los riesgos principales son el borrado de potreros con dependencias, rotaciones activas duplicadas, movimientos hacia destinos sin validar, escrituras parciales y cambios de campos internos desde las APIs. Existe una vía determinista para eludir la comprobación de rotación activa: omitir `estado` en POST; el controlador omite la validación y el esquema aplica después el valor predeterminado `Activa`.

Los controles existentes incluyen autenticación, permisos por rol, aislamiento de consultas por organización/finca, código de potrero único por finca, validación básica de números y enums, protección de bancos con cortes registrados y cobertura gestionada mediante transacción e índice de vigencia única. Estos controles son útiles, pero no cubren todos los caminos de escritura ni las dependencias entre módulos.

### Verificación y alcance

- Inspección de backend y frontend: potreros, rotaciones, cobertura/pastos, cortes, cálculos de rendimiento, integración con lotes, importación, traslados, tareas, permisos y almacenamiento offline.
- `npm.cmd test` ejecutado en `backend`: **218 pruebas aprobadas, 0 fallidas, 0 omitidas**. Es el comando `npm test` mediante el ejecutable de Windows.
- Diez comprobaciones aisladas con funciones/controladores reales y dobles de persistencia en memoria, descritas en la sección 6. También se ejecutó validación real de esquemas Mongoose.
- No se conectó a una base productiva ni se ejecutaron peticiones contra un servidor. Las pruebas aisladas de controladores no incluyen autenticación HTTP; las autorizaciones se verificaron en rutas/configuración. No se probaron carreras con MongoDB real ni navegación automatizada.
- Las pruebas existentes cubren cálculos, catálogo, cobertura histórica y conversiones, entre otros módulos. Su resultado satisfactorio no demuestra que los problemas de escritura, permisos de interfaz y concurrencia identificados estén resueltos.

## 2. Mapa del módulo y catálogo de operaciones

### Modelos y fuente de verdad

| Entidad | Datos persistidos y controles | Relación con la operación |
| --- | --- | --- |
| [Potrero](backend/models/Potrero.js) | Código, nombre, tipo PASTOREO/BANCO_FORRAJERO, área, capacidad, ubicación textual, estado, últimas labores, cobertura actual, descanso/intervalo objetivo, responsable; timestamps y tenant. Código único por organización/finca. | Área física y resumen de estado/cobertura. No registra un historial de cambios de área o capacidad. |
| [RotacionPotrero](backend/models/RotacionPotrero.js) | Potrero, lote textual, `loteRef` opcional, entrada/salida, cantidad de animales, días ocupados/descanso y estado. | Fuente de ocupación para indicadores. Índice único parcial por **lote activo**, no por potrero activo. No identifica individualmente los animales presentes. |
| [HistorialCoberturaPotrero](backend/models/HistorialCoberturaPotrero.js) | Composición, porcentajes, establecimiento, objetivos, inicio/fin y `registradoPor`. | Historial temporal de cobertura; índices únicos de inicio y de una cobertura sin fechaFin por potrero. |
| [CatalogoPasto](backend/models/CatalogoPasto.js) | Catálogo común de pastos, cultivares, especies, categorías y usos permitidos. | Referencias de cobertura; no es inventario privado de una finca. |
| [CorteForraje](backend/models/CorteForraje.js) | Banco, fecha, especie/forraje con nombre capturado, área cortada, kg verdes/materia seca, destino, responsable y registrador. | Hecho productivo de banco; no se encontró CRUD de edición/borrado en sus rutas. |
| [Lote](backend/models/Lote.js), [PertenenciaLote](backend/models/PertenenciaLote.js), [Animal](backend/models/Animal.js) | `ubicacionActual`, membresía de lote y `potreroActual`/`loteActual`, respectivamente. | Representaciones adicionales de ubicación que no se sincronizan en todos los flujos. |
| [EventoLote](backend/models/EventoLote.js), [Tarea](backend/models/Tarea.js) | Movimiento de potrero y tareas de corte/siembra, con autoría. | Complementan la trazabilidad; no sustituyen las referencias ni el historial de rotación. |

### APIs y flujos

| Operación | API / implementación | Efectos observados |
| --- | --- | --- |
| Alta/edición/borrado de área | `/api/potreros`, `/api/potreros/:id`; [rutas](backend/routes/potrero.js), [controlador](backend/controllers/potrero-controller.js) | Cambia Potrero; puede programar tareas. DELETE solo bloquea si hay CorteForraje. |
| Rotación manual | CRUD `/api/rotaciones`; [rutas](backend/routes/rotacion.js), [controlador](backend/controllers/rotacion-controller.js) | Guarda rotación y cambia estado de Potrero; no sincroniza Lote/Animal. El formulario usa lote como texto libre. |
| Movimiento de lote | POST `/api/lotes/:id/cambiar-potrero`; [moverLoteAPotrero](backend/services/lote-service.js#L393) | Cierra rotación anterior, crea otra, cambia ubicaciones/estado y escribe EventoLote. Escrituras sucesivas sin transacción común. |
| Cobertura | GET/POST/PUT `/api/potreros/:id/cobertura`; [servicio](backend/services/potreroCobertura-service.js) | Valida referencias principales, cierra cobertura previa y actualiza historial y Potrero en transacción. |
| Pastos | GET `/api/pastos`; [rutas](backend/routes/pasto.js) | Lista catálogo y asegura datos base; no es una consulta de existencias de forraje. |
| Cortes de forraje | GET/POST `/api/potreros/:id/cortes`; [servicio](backend/services/forraje-service.js#L77) | Crea corte, completa/cancela tareas de corte pendientes y programa la siguiente. No registra suministro alimentario por seleccionar un destino. |
| Rendimiento de pastoreo | `/api/potreros/rendimiento`, `/rendimiento/por-pasto`, `/:id/rendimiento`; [servicio](backend/services/potreroRendimiento-service.js) | Calcula ocupación, descanso, densidad y animal-días desde rotaciones; requiere `analiticaProductiva`. |
| Reportes de pastoreo/forraje | `/api/reportes/potreros/rendimiento`, `/potreros/por-pasto`, `/forrajes/rendimiento`; [rutas](backend/routes/reporte.js#L81) | Reutiliza cálculos; exige permiso de Reportes y función de plan. |
| Importación | [importarExcel-service](backend/services/importarExcel-service.js#L563) | Crea/actualiza áreas y cobertura; puede asignar `potreroActual` a animales por código sin crear una rotación equivalente. |

La interfaz está en [Potreros.js](frontend/src/Components/Potreros.js), [FormularioPotrero.js](frontend/src/Components/FormularioPotrero.js), [FormularioRotacion.js](frontend/src/Components/FormularioRotacion.js), [RendimientoPotreros.js](frontend/src/Components/RendimientoPotreros.js) y [BancosForrajeros.js](frontend/src/Components/BancosForrajeros.js). Hay tablas y filtros, detalle de cobertura/rotaciones y registro de cortes. No se encontró un flujo de aforo, polígonos geográficos o adjuntos por rotación; `ubicacion` es texto. La imagen general de Potreros no constituye evidencia adjunta a una operación.

## 3. Análisis de integridad, seguridad y trazabilidad

### POT-01 — P1: borrado físico con dependencias

**Evidencia:** [deletePotrero](backend/controllers/potrero-controller.js#L166) consulta únicamente CorteForraje antes de `findByIdAndDelete`. No verifica rotaciones, cobertura histórica, animales en el potrero, ubicación de lotes ni tareas asociadas. Se reprodujo el borrado de un potrero marcado Ocupado con cero cortes: 200.

**Impacto:** permanecen referencias a un potrero eliminado; los populate pueden devolver null y los indicadores pierden el área/nombre que contextualiza la historia. La protección de bancos con cortes sí devuelve 409, pero no protege el resto de dependencias. Además, [deleteRotacion](backend/controllers/rotacion-controller.js#L235) borra físicamente cualquier rotación; solo recalcula el estado de Potrero si era activa, sin corregir Lote/Animal ni guardar una anulación.

**Acción:** impedir borrado con cualquier dependencia y ofrecer archivo/baja explícita conservando identidad. Para rotaciones ejecutadas, rectificación/anulación trazable. No usar simplemente Mantenimiento como sinónimo de archivo sin definir su efecto operativo. Probar también carrera entre creación de una dependencia y borrado.

### POT-02 — P1: exclusividad de ocupación eludible y vulnerable a concurrencia

**Evidencia:** [validarRotacionActivaUnica](backend/controllers/rotacion-controller.js#L44) retorna si `estado !== 'Activa'`. [createRotacion](backend/controllers/rotacion-controller.js#L145) valida antes de construir el modelo; el esquema aplica `Activa` por defecto después. Dos POST consecutivos sin estado crearon dos activas en la prueba aislada, sin ejecutar ninguna consulta de exclusividad.

Con estado explícito, el control sigue siendo `findOne → save`. Dos peticiones pueden observar un destino libre antes de insertar. El índice parcial existente protege `loteRef` activo por organización/finca, **no la ocupación única de un potrero por lotes diferentes**, y no cubre rotaciones manuales sin loteRef. El movimiento desde Lotes también usa consulta previa por potrero.

**Impacto:** ocupaciones simultáneas incompatibles con la regla que el propio controlador pretende imponer; posteriores cierres pueden marcar Descanso aunque otra ocupación siga activa. El cálculo no une intervalos y puede mostrar más del 100% de tiempo ocupado.

**Acción:** aplicar defaults antes de validar y garantizar exclusividad en base de datos por organización/finca/potrero para rotaciones activas, tras conciliar duplicados. Gestionar el conflicto como 409. Para períodos históricos/planificados, definir además la política de solapamientos: el índice de activas no valida todos los intervalos.

### POT-03 — P1: destino, tipo de área y capacidad sin validar

**Evidencia:** la creación/edición manual no exige que el Potrero referenciado exista; la sincronización posterior retorna silenciosamente si no lo encuentra. [moverLoteAPotrero](backend/services/lote-service.js#L393) tampoco carga/valida el destino: comprueba rotaciones y ejecuta actualizaciones de Potrero sin verificar si encontraron un documento.

En la reproducción aislada, el servicio actualizó lote y animales hacia un ID de destino inexistente, aunque la actualización del Potrero retornó null. El mismo defecto permite referencias a un potrero de otra finca que la consulta aislada no encuentre; no implica que pueda actualizar ese potrero ajeno.

Tampoco se comprueba `tipoArea === PASTOREO`, estado utilizable, capacidad máxima o descanso objetivo. Si el destino está en Mantenimiento, el update de su estado lo excluye, pero la rotación y las ubicaciones pueden guardarse igualmente. El [selector de rotación](frontend/src/Components/Potreros.js#L241) recibe todos los potreros, incluidos bancos forrajeros. `capacidadMaxima` existe, pero no se encontró una validación de ocupación contra ella.

**Acción:** resolver destino dentro de la organización/finca activa y comprobar sus condiciones antes de mutar origen. Definir capacidad como límite o advertencia explícita y validar cantidades reales; tratar descanso objetivo como política configurable. Filtrar la UI y repetir las validaciones en servidor.

### POT-04 — P1: divergencia entre ubicación, ocupación y estado

**Evidencia y escenarios:**

- Crear, editar, finalizar o borrar una rotación mediante su CRUD solo modifica RotacionPotrero/Potrero; no cambia Lote.ubicacionActual ni Animal.potreroActual, incluso si esa rotación fue generada por un movimiento de lote.
- [agregarAnimalesAlLote](backend/services/lote-service.js#L182) cambia `loteActual`, pero no asigna el potrero donde ya está el lote. Mover un animal de un lote ubicado en A a otro ubicado en B puede dejar `potreroActual = A`.
- [cerrarLote](backend/services/lote-service.js#L252) cierra pertenencias/asignaciones y el lote, pero no finaliza su rotación activa ni libera el potrero. Una rotación puede continuar activa para un lote cerrado.
- `numeroAnimales` se captura al mover el lote; no se divide la rotación en tramos cuando entran/salen animales. El rendimiento trata la cantidad inicial como constante durante toda la estancia, incluso después de cambios de composición.
- [createRotacion](backend/controllers/rotacion-controller.js#L145) con estado Finalizada marca Descanso sin verificar otra rotación activa. Registrar una estancia histórica puede alterar el estado operativo actual.
- La edición general del potrero permite cambiar manualmente su estado sin conciliar rotaciones; la importación puede asignar animales a un potrero sin producir una rotación.

**Impacto:** pantallas, ubicación de animales e indicadores no coinciden; se mantienen ocupaciones ficticias o se libera visualmente un potrero todavía ocupado.

**Acción:** unificar las transiciones operativas en un servicio común y decidir la fuente autoritativa. Modelar cambios de población mediante segmentos fechados para conservar animal-días reales; no sobrescribir retrospectivamente toda la estancia con el último conteo. Reconciliar registros existentes y probar altas, bajas, venta, traslado, cambio/cierre de lote y edición de historia.

### POT-05 — P1: escrituras parciales y reintentos sin garantía

**Evidencia:** el movimiento de lote guarda primero el cierre de la rotación de origen y luego crea la nueva, actualiza Lote/Potrero/Animal y genera el evento, sin sesión/transacción compartida. Al simular fallo en la creación de la nueva rotación, el cierre anterior quedó guardado. Una petición fallida no significa que el origen permanezca intacto.

Otros caminos relevantes:

- Rotación manual guarda/borrar primero y sincroniza el estado del potrero después.
- [guardarPotrero en frontend](frontend/src/Components/Potreros.js#L120) hace una petición de área y otra de cobertura. Si la segunda falla durante un alta, el área ya existe, pero el formulario conserva modo crear; un reintento con el mismo código puede fallar por duplicado. La [importación](backend/services/importarExcel-service.js#L563) también guarda primero y puede reportar como omitida una fila parcialmente aplicada.
- [registrarCorte](backend/services/forraje-service.js#L77) crea el corte antes de cerrar/programar tareas. Un fallo posterior deja el corte registrado; volver a enviar el formulario puede duplicar producción porque no hay clave idempotente.
- Un corte retroactivo completa la tarea pendiente más antigua encontrada en ese momento y reprograma desde la fecha de ese corte, sin conciliar contra el último corte cronológico. Puede cerrar una tarea actual y desplazar la siguiente hacia atrás.

**Acción:** operaciones transaccionales comunes para efectos que deban confirmarse juntos, idempotencia de altas/cortes y respuesta que permita recuperar operaciones ya confirmadas. Programar desde la secuencia cronológica efectiva y conservar asociación corte-tarea. Inyectar fallos en cada frontera de escritura y verificar reintentos.

### POT-06 — P1: modificación de tenant y bypass del servicio de cobertura

**Evidencia:** [sinCamposCobertura](backend/controllers/potrero-controller.js#L23) excluye una lista de claves superiores, no define un DTO permitido. POST acepta organización/finca explícitas; PUT admite campos internos, `tipoArea` y operadores. Un payload como `{"$set":{"pastoPrincipal":"<id>","fincaId":"<otra-finca>"}}` llega completo a `findByIdAndUpdate`, eludiendo la exclusión de cobertura. Se confirmó ese reenvío en el controlador aislado.

El CRUD de rotaciones también expande `req.body`. El [plugin organizacional](backend/models/plugins/organizacion-plugin.js#L57) protege el filtro de las consultas, pero su validación solo rellena tenant ausente y no impide reasignarlo en estas actualizaciones normales. Un Potrero validó con organización/finca diferentes a las del contexto. No se afirma lectura arbitraria entre organizaciones: el problema está en valores de escritura y coherencia de referencias.

La interfaz deshabilita cambiar tipo de área al editar, pero el backend no impone esa regla. Se puede cambiar tipo/estado/cobertura sin el historial o validaciones correspondientes. El control de responsable de corte en actualización depende de que el body incluya `tipoArea === BANCO_FORRAJERO`; una actualización parcial de solo responsable no pasa por ese control inicial.

**Acción:** DTO estricto, tenant derivado del contexto, rechazo de operadores/rutas y campos internos; cobertura exclusivamente por su servicio. Validar la entidad resultante en actualizaciones parciales y proteger transiciones de tipo de área con dependencias.

### POT-07 — P1: fechas y cantidades incompatibles con una rotación real

**Evidencia:** los modelos exigen Date/Number, pero no validan entrada ≤ salida, coherencia de estado/fechas o enteros en `numeroAnimales`/`capacidadMaxima`. [calcularDiasEntreFechas](backend/controllers/rotacion-controller.js#L8) convierte una duración negativa en cero. Una rotación Finalizada con entrada 10/octubre, salida 1/octubre y **1.5 animales** pasó la validación real del esquema y quedó con cero días.

También son posibles Finalizada sin salida y Activa con entrada futura o salida informada. La preparación del descanso busca una salida anterior sin filtrar rotaciones reales, por lo que puede usar una Planificada. Cambiar una rotación antigua no recalcula necesariamente los campos persistidos de las siguientes; el enriquecimiento de lectura conserva valores no nulos.

Las fechas de corte no se contrastan con hoy/establecimiento. El helper `diaUTC` construye fechas civiles con Date.UTC y puede normalizar días imposibles en lugar de rechazarlos. Las fechas de mantenimiento tampoco tienen validación temporal de negocio.

**Acción:** validar fechas civiles estrictas, secuencia temporal y transiciones por estado, cantidades enteras y datos obligatorios. Separar planificación de hechos ejecutados y recalcular descansos afectados al corregir historia. No corregir silenciosamente una duración negativa a cero.

### POT-08 — P2: cobertura vigente y composición con trazabilidad incompleta

[guardarCobertura](backend/services/potreroCobertura-service.js) sí usa transacción y el esquema impide dos coberturas sin fechaFin. No se reporta ausencia de esos controles. Sin embargo:

- Un cambio con la misma fecha de inicio reemplaza el registro vigente; no conserva una revisión ni actualiza un campo de editor. El autor original puede permanecer mientras cambian los datos.
- Una cobertura futura se copia inmediatamente a Potrero y se devuelve como `actual` por no tener fechaFin, sin exigir que haya comenzado. Operación actual y cronología por fechas pueden discrepar.
- Los porcentajes comprueban el rango individual 0–100, pero no validan duplicados, existencia/selección de cada referencia porcentual ni total. Se aceptaron dos entradas de 80% para el mismo ID sin seleccionarlo en la composición. Si se permiten coberturas por estratos que sumen más de 100%, esa semántica debe ser explícita; actualmente no está modelada.
- `FormularioPotrero` no incorpora `porcentajesCobertura` en su normalización/firma. Al cambiar otros campos de cobertura de un registro que sí los tenga, la petición puede omitirlos y `prepararCobertura` los sustituye por un arreglo vacío.

**Acción:** distinguir corrección y cambio temporal; conservar editor/revisión, resolver cobertura efectiva para una fecha y no anticipar cambios futuros. Validar/preservar porcentajes y su significado en API e interfaz. Mostrar autoría del historial, actualmente no presentada en su tabla.

### POT-09 — P2: resultados de rendimiento y gráficas que pueden inducir a error

**Casos concretos:**

- [calcularResumen](backend/services/potreroRendimiento-service.js#L98) suma duraciones sin unir intervalos. Dos rotaciones coincidentes de 10 días en un período de 10 días produjeron **200% de ocupación**. Es una consecuencia observable de POT-02/07; corregir el dato y detectar inconsistencias, no solo limitar visualmente a 100%.
- [calcularRendimientoPotrero](backend/services/potreroRendimiento-service.js#L151) convierte `diasDescansoObjetivo: null` en **0** mediante Number(null), mostrando un objetivo inexistente. El acumulador por pasto usa la misma conversión en coberturas con objetivo nulo.
- Los indicadores por hectárea usan el área actual de Potrero para períodos históricos. Cambiar área reexpresa el pasado; no existe un historial de superficie que permita otra interpretación. El formulario de pastoreo etiqueta simplemente “Área”, aunque los cálculos la interpretan en hectáreas.
- El comparativo consulta todos los Potrero, sin filtrar PASTOREO; los bancos también pueden aparecer como potreros de pastoreo sin ocupación.
- [agrupar en forrajeRendimiento](backend/services/forrajeRendimiento-service.js) ordena por producción todos los grupos, incluida `produccionPorMes`. Con enero=100 kg y febrero=1000 kg devolvió febrero antes de enero; la gráfica de línea consume ese orden como secuencia temporal.
- Tabla de rotaciones y métricas no comparten exactamente la misma convención: una estancia del mismo día puede tener `diasOcupado=0` en CRUD y contar un día en rendimiento. La tabla principal filtra por fecha de entrada; las métricas recortan intervalos que cruzan el período. Debe explicarse o alinearse esa diferencia.

**Acción:** preservar nulos, ordenar series por fecha, filtrar tipo de área y declarar unidades/convención temporal. Detectar solapamientos y definir cómo se calcula rendimiento histórico ante cambios de superficie. Hay pruebas existentes para recorte por período y asignación histórica de pastos; ampliarlas a estos casos.

### POT-10 — P2: validación y consulta de cortes incompletas

El registro exige banco forrajero, cobertura y responsable asignable, convierte toneladas y valida materia seca 0–100. Conserva además nombre de forraje al cortar. Permanecen estas carencias:

- [listarCortes](backend/services/forraje-service.js#L137) aplica `fechaCorte <= fechaFin + 1 día`. Como los cortes se normalizan a medianoche, una consulta hasta 15/octubre incluye el corte del **16/octubre a las 00:00 UTC**. El reporte usa fin de día y puede discrepar con la lista.
- `convertirAKg` interpreta cualquier unidad no reconocida como kg, en lugar de rechazarla. El formulario restringe las opciones, pero la API no.
- No se valida área cortada contra área del banco ni se exige una referencia coherente cuando destino es LOTE/ANIMAL. La UI permite elegir esos destinos con texto libre sin seleccionar entidad. No se crea automáticamente una entrega de alimento ni se descuenta inventario por registrar el destino.
- No existe una ruta de rectificación/anulación de cortes en este módulo. Un error confirmado no tiene un mecanismo operativo de corrección trazable disponible en la ficha.

**Acción:** usar límite superior exclusivo del día siguiente, validar unidades/destinos y política de superficie; agregar rectificación con revisión y conciliación de tareas, sin abrir un borrado destructivo. Distinguir destino descriptivo de suministro realmente registrado.

## 4. Comportamiento multi-finca y trazabilidad histórica

Potrero, RotacionPotrero, HistorialCoberturaPotrero y CorteForraje incorporan aislamiento por organización y finca. Las rutas están autenticadas; las consultas ordinarias permanecen en la finca activa. El catálogo de pastos es compartido por diseño. El responsable de corte se valida mediante membresía y acceso a la finca cuando se ejecuta `validarUsuarioAsignable`; eso no valida por sí mismo los IDs de potrero/lote/destino.

| Escenario | Comportamiento actual |
| --- | --- |
| Consultar potreros/rotaciones/cortes desde finca B | Recupera los documentos de B; no se encontró una consulta general de potreros que elimine el aislamiento. |
| Enviar ID de potrero de A al crear rotación/mover lote desde B | Puede persistirse una referencia incoherente porque no se valida destino. La actualización aislada no modifica el Potrero de A; el resto del movimiento puede continuar (POT-03). |
| Enviar finca/organización en payload | Las APIs generales no las descartan ni fijan de forma segura (POT-06). La protección de lecturas no neutraliza este defecto. |
| Trasladar animales entre fincas | [consolidacionMultiFinca-service](backend/services/consolidacionMultiFinca-service.js#L129) cierra pertenencias y limpia `loteActual`/`potreroActual` dentro de su transacción. No recalcula la población temporal de la rotación ni libera una rotación de origen que queda sin animales (POT-04). |
| Consultar ubicación histórica de un animal | Las rotaciones identifican lote/cantidad, no cada animal. Se requieren pertenencias fechadas y eventos del lote para reconstruirla; el módulo no entrega esa reconstrucción completa en la ficha de potrero. |
| Cambiar nombre, área o cobertura | Las rotaciones populan datos actuales del potrero. Cobertura tiene historial propio, área no. Borrar el potrero impide resolver su identidad actual (POT-01/08/09). |

La trazabilidad de autoría es desigual: cobertura tiene registradoPor; cortes tienen responsable y registrador; movimientos desde Lotes crean EventoLote con autor. Potrero/RotacionPotrero no tienen creadoPor/actualizadoPor ni revisiones de negocio. La [auditoría HTTP](backend/middleware/auditoria.js) registra peticiones y actores, pero es posterior a la respuesta y no almacena una imagen completa anterior para restaurar cualquier dato eliminado. Las últimas labores de herbicida/chapia/fertilización son campos de última fecha, no un historial completo de aplicaciones.

## 5. Roles, interfaz y soporte offline

### Matriz efectiva de permisos

| Rol | Leer potreros, rotaciones, cobertura y cortes | Crear/editar/borrar áreas y rotaciones; cambiar cobertura; registrar corte | Mover lote a potrero | Analítica vía Potreros* | Analítica de forrajes vía Reportes* |
| --- | --- | --- | --- | --- | --- |
| Administrador | Sí | Sí | Sí | Sí | Sí |
| Encargado | Sí | Sí | Sí | Sí | No |
| Trabajador | Sí | No | No | Sí | No |
| Veterinario | No | No | No | No | No |
| Consulta | Sí | No | No | Sí | Sí |
| Contador | No | No | No | No | Sí |

\* Requiere además `analiticaProductiva`. Contador puede acceder a los reportes de potreros por la ruta de Reportes, aunque no al CRUD operativo. Completar una tarea asignada tiene reglas propias; no concede permiso de registrar CorteForraje.

Fuentes: [permisosRoles](backend/config/permisosRoles.js), [potrero](backend/routes/potrero.js), [rotación](backend/routes/rotacion.js), [lotes](backend/routes/loteRoutes.js), [reportes](backend/routes/reporte.js#L63). DELETE de área/rotación utiliza `potreros.gestionar`, por lo que Encargado tiene permiso de borrado al igual que Administrador. No hay un permiso independiente de eliminación histórica.

### POT-11 — P2: interfaz no alineada con permisos, plan y presentación

- La analítica de bancos usa [obtenerRendimientoForrajes](frontend/src/services/api.js#L692), que llama a Reportes. La pantalla la muestra bajo la función de plan, sin comprobar `reportes.ver`: un Encargado puede gestionar bancos/cortes, pero la analítica devuelve 403. Lo mismo ocurre con Trabajador que tiene lectura de Potreros.
- [DetalleBanco](frontend/src/Components/BancosForrajeros.js) no recibe `soloLectura` y muestra “Registrar corte” siempre. Consulta/Trabajador pueden abrir el formulario desde el detalle; la API deniega el guardado. No es una elevación de privilegios confirmada, sino una acción inválida expuesta. También queda expuesta sin conexión.
- [DetallePotrero](frontend/src/Components/RendimientoPotreros.js#L100) consulta rendimiento y cobertura mediante Promise.all. Si el plan carece de analítica, el rechazo del rendimiento impide asignar la cobertura devuelta, aunque su API sea accesible. La pestaña inicial es rendimiento y no está separada por FeatureGate en ese modal.
- Fechas civiles persistidas a medianoche UTC se presentan con la zona del navegador; en Costa Rica pueden aparecer el día anterior. Los formularios de rotación/corte usan fecha inicial UTC, que puede diferir del día local. Definir una única convención para entrada, presentación y cálculo.
- La UI pagina tablas sobre datos descargados; las APIs principales cargan colecciones completas. No se encontró paginación de servidor para rotaciones/historial/cortes. Esto limita el uso con muchos años de registros.

**Acción:** compartir permisos efectivos entre rutas y componentes, separar lectura de cobertura de analítica restringida, ocultar acciones imposibles y mostrar autor/fecha de registro cuando corresponda. Alinear fechas civiles y añadir paginación de servidor sin perder filtros temporales.

### POT-12 — P2: funcionamiento offline parcial y vacío ambiguo

[Potreros.js](frontend/src/Components/Potreros.js#L85) solicita áreas y rotaciones con Promise.all y guarda **solo áreas** en IndexedDB. Si una de las dos consultas falla, pierde el resultado de la otra; en modo solo lectura intenta recuperar áreas cacheadas y pone `rotaciones=[]`. Un error de autorización/servidor también puede presentarse como “Sin conexión” cuando hay caché.

La caché sí está separada por organización/finca/usuario en [offlineStorage](frontend/src/services/offlineStorage.js#L21). Puede contener datos resumidos del último corte, pero no colecciones completas de rotaciones, cobertura o cortes ni resultados analíticos. Los detalles vuelven a consultar APIs; no hay garantía de consulta histórica completa offline.

El sincronizador actual admite **completar tareas y crear notas de bitácora animal**, pero no altas/ediciones de potreros, movimientos, cobertura o cortes. No se atribuye al código actual la ausencia de notas offline de auditorías anteriores. [ListaUsuario](frontend/src/Components/ListaUsuario.js#L424) deshabilita gestión ordinaria sin conexión, con la excepción de presentación del botón en DetalleBanco descrita en POT-11.

**Acción:** indicar claramente datos cacheados, antigüedad e historia no disponible; separar fallo de red, 403 y vacío real. Si se requiere operación en campo, añadir caché histórica y cola de operaciones expresamente soportadas, con idempotencia, conflictos y contexto de finca. No hacer parecer que una lista de rotaciones vacía significa que nunca hubo ocupación.

## 6. Plan de acción y criterios de aceptación

### Reproducciones realizadas

Todas las pruebas siguientes usaron datos sintéticos; no persistieron en MongoDB. En controladores/servicios se sustituyeron llamadas de almacenamiento por dobles en memoria. Los resultados de estado HTTP son respuestas del controlador aislado, no una prueba de acceso autenticado.

| Prueba | Entrada / condición | Resultado observado |
| --- | --- | --- |
| R1 | Dos altas de rotación sin estado, mismo potrero; destino no encontrado | 201 y 201; ambas Activa; cero consultas de exclusividad y sin rechazo por destino inexistente. |
| R2 | Entrada 10/oct, salida 1/oct, Finalizada, numeroAnimales=1.5 | Esquema acepta; helper calcula diasOcupado=0. |
| R3 | DELETE de Potrero Ocupado y count de cortes=0 | 200; no se consultan rotaciones/animales/lotes. |
| R4 | PUT con `$set` de cobertura, tenant y tipo de área; documento con tenant explícito diferente del contexto | Controlador reenvía los campos; validación de esquema conserva tenant explícito. |
| R5 | Dos porcentajes 80% para mismo ID no seleccionado como cobertura | Preparación acepta las dos entradas, total 160%. |
| R6 | Dos rotaciones de 10 días coincidentes en período de 10 días; objetivo null | Ocupación 200%; descanso objetivo 0. |
| R7 | Listado de cortes con fechaFin=2026-10-15 | Filtro `$lte: 2026-10-16T00:00:00Z`. |
| R8 | Enero 100 kg, febrero 1000 kg | Serie mensual devuelve febrero antes de enero. |
| R9 | Movimiento de lote cuyo destino no existe y actualización de Potrero devuelve null | Servicio sigue y actualiza ubicación de lote/animales. |
| R10 | Fallo inyectado al crear rotación de destino después de guardar cierre de origen | La rotación original queda Finalizada; no hay rollback del cierre. |

### Prioridad y cierre verificable

| ID | Prioridad | Remediación | Criterio mínimo de aceptación |
| --- | --- | --- | --- |
| POT-01 | P1 | Protección de dependencias, archivo y anulación trazable. | Potrero con rotación, cobertura, animal, lote, tarea o corte no se borra físicamente; historia permanece resoluble. |
| POT-02 | P1 | Exclusividad en DB y defaults antes de validación. | Dos solicitudes concurrentes al mismo destino producen una aprobación y un conflicto; omitir estado no cambia la regla. Probar con lotes distintos y sin loteRef. |
| POT-03 | P1 | Validar destino y condiciones antes de mutar origen. | Destino inexistente/ajeno/banco/en mantenimiento se rechaza conforme a política y no cambia ninguna ubicación; capacidad se controla según regla definida. |
| POT-04 | P1 | Unificar ubicación/ocupación y segmentos poblacionales. | Cambiar/cerrar lote, mover/vender/trasladar animales y corregir rotación mantiene coherentes las tres entidades y los animal-días. |
| POT-05 | P1 | Transacciones e idempotencia de operaciones compuestas. | Fallos intermedios no dejan cierres/altas/cortes parciales; reintentar una operación no duplica producción; un corte antiguo no desordena la programación vigente. |
| POT-06 | P1 | DTO estricto y protección de contexto/cobertura. | Campos de tenant, `$set`, rutas con punto y cambio de tipo no autorizado se rechazan; cobertura no cambia sin su historial. |
| POT-07 | P1 | Reglas temporales y enteros. | Rechazar cantidades fraccionarias, intervalos invertidos, estado incompatible y fechas civiles inválidas; recalcular descansos tras corregir historia. |
| POT-08 | P2 | Revisiones y cobertura efectiva; preservar composición. | Cambio futuro no altera cobertura de hoy; corrección conserva editor; editar una observación no borra porcentajes; referencias y totales siguen una política explícita. |
| POT-09 | P2 | Corregir nulos, series, filtros y metodología histórica. | Null sigue sin objetivo; serie mensual cronológica; bancos separados; solapamientos detectados; unidades y criterio temporal consistentes. |
| POT-10 | P2 | Período de cortes, unidades/destinos y rectificación. | Filtro hasta día 15 excluye día 16; unidad desconocida falla; destino tipado valida entidad; correcciones conservan historial. |
| POT-11 | P2 | Alinear permisos/plan/acciones y presentación. | Encargado ve funciones que puede ejecutar; Consulta no ve registro de cortes; cobertura se consulta sin analítica; fechas civiles y paginación funcionan. |
| POT-12 | P2 | Offline explícito y sincronización por operación. | Caché nunca se confunde con historia completa; errores se distinguen; operaciones offline que se incorporen conservan finca, fecha e idempotencia. |

Orden recomendado: cerrar las vías de corrupción de datos POT-01/02/03/06; unificar transiciones y atomicidad POT-04/05/07; completar cobertura, indicadores, cortes y experiencia operativa. Antes de agregar índices o reconstruir ocupación, realizar un diagnóstico de rotaciones activas duplicadas, referencias huérfanas, ubicaciones divergentes y cantidades/fechas inválidas. Conservar los datos originales al conciliar.

**Estado: auditoría completada; remediaciones pendientes.** La aceptación de las correcciones requerirá pruebas de integración y concurrencia reales para los casos indicados, además de volver a ejecutar la suite completa.
