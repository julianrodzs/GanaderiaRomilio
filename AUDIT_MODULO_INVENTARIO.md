# Auditoría del inventario animal y genético

Fecha: **14 de octubre de 2026**. Instrucción aplicada: [Agents.md](Agents.md), auditoría del inventario animal, camadas y semen/IATF.

Se revisó el **árbol de trabajo actual sobre `9081d8a`**, incluidos los cambios sin confirmar que ya existían al comenzar. En particular, compras y ventas contienen correcciones posteriores a la auditoría financiera anterior. Este documento no presupone que los defectos de aquella versión sigan presentes.

## 1. Resumen Ejecutivo

El inventario tiene una base funcional amplia: identificación individual, especies y categorías, genealogía, pesos, lotes con historial de pertenencia, sanidad separada del estado de inventario, compras/ventas, camadas colectivas y catálogo de semen con consumo real en IATF.

**No puede certificarse que el cupo sea infranqueable por todas las vías.** Existe validación de plan en altas activas, compras, nacimientos individuales, reactivaciones e importación Excel. Sin embargo, el mecanismo común de reserva combina una lectura previa de animales con reservas temporales y permite un intercalado concurrente que excede el límite. Se reprodujo con el servicio real y persistencia simulada: **209 activos → dos altas → 211 activos, con límite 210**.

Las crías colectivas **no consumen cupo mientras solo sean cantidades en `Camada`**, incluso después del destete si no se individualizan. El cupo implementado limita registros `Animal` activos, no toda la población viva de la finca. Hay que hacer explícita esa diferencia y resolverla según la definición comercial del límite, sin crear identificaciones artificiales.

Otros riesgos relevantes son el borrado directo de animales con historial, cambios manuales de estado que evitan el flujo comercial, cantidades inconsistentes en camadas, ausencia de consumo de semen en IA convencional/bandas porcinas y diferencias de validación entre endpoints.

### Controles que sí existen en la versión revisada

- Índice único de código interno por organización/finca y de DIIO por organización.
- DTO de Animal que rechaza organización/finca y operadores MongoDB; evita modificar directamente `loteActual`, `potreroActual`, `compraId` y `ventaId` desde el formulario general.
- Cuota por organización, sumando sus fincas; animales vendidos y muertos no consumen cupo individual.
- Compra confirmada con reserva por cantidad y transacción; su edición conserva las identidades individuales y su anulación comprueba numerosas dependencias.
- Venta confirmada transaccional, actualización condicionada a animal activo, cierre de pertenencia y conservación de pesajes/sanidad. La reversión tiene lógica de restauración de pertenencias.
- Descuento IATF mediante actualización condicionada a stock suficiente y transacción, con snapshot de semen por participante.
- Caché offline separada por organización, finca, usuario y variante de especie.

### Verificación y límites de esta auditoría

`npm.cmd test`, ejecutado en `backend`, terminó con **207 pruebas aprobadas, 0 fallidas**. Además se ejecutaron reproducciones aisladas del servicio de cuotas, preparador de camadas, esquemas Mongoose, validación genealógica y consumo IATF. No se guardaron datos de prueba en MongoDB ni se alteró el código de negocio.

No se conectó a una base de datos real, no se verificó la instalación efectiva de índices en producción, no se ejecutaron transacciones concurrentes reales ni pruebas autenticadas en navegador. La prueba de concurrencia controla el orden de las operaciones mediante dobles de persistencia: demuestra el defecto del algoritmo, pero no reemplaza la regresión de integración sobre MongoDB. La batería existente incluye pruebas de configuración y del índice de reservas; pasar esas pruebas no demuestra exclusión concurrente entre altas.

El alcance excluye expresamente un Kardex de bodega o inventario físico general de insumos. No se considera su ausencia un defecto. El análisis de stock se limita al semen/genética y su uso en protocolos.

## 2. Matriz de Funcionalidades Activas

«Implementado» significa que se encontró código y flujo correspondiente; no implica certificación de integridad en todas las condiciones. «Parcial» señala límites descritos aquí o en el plan de acción.

| Área / función | Backend y fuente de verdad | Interfaz / comportamiento | Diagnóstico |
|---|---|---|---|
| Identificación | `Animal.identificadorFinca` obligatorio; `diio` opcional; nombre opcional. | Formulario y tabla con ambos identificadores. | Implementado; hay diferencias entre validación previa e índice. |
| Especie | Bovino/Porcino; Bovino por defecto. | Selector y campos adaptados. | Implementado; validación de plan concentrada en operaciones activas. |
| Sexo y categoría | Macho/Hembra; categorías por especie, edad y sexo. | Categorías calculadas/validadas; objetivo separado. | Implementado; no se debe usar categoría como estado reproductivo. |
| Raza | Raza principal/secundaria, grupo, grado, variedad, descripción, composición y fracciones. | Catálogo y captura racial. | Implementado. |
| Objetivo productivo | `objetivoProductivo`; validación con líneas habilitadas de la finca. | Selección del propósito del animal. | Implementado; se valida compatibilidad al entrar a lote. |
| Etapa porcina | Fase 1/2/3, Desarrollo, Engorde. | Selección en ficha y pesajes. | Implementado; distinta de categoría y etapa del lote. |
| Fechas y pesos de vida | Nacimiento, destete estimado/real, compra, venta, muerte; pesos iniciales, actual y comerciales. | Formulario y detalle. | Parcial: cronología, bajas y fuente de `pesoActual` no están centralizadas. |
| Estado de inventario | `Activo`, `Vendido`, `Muerto`. | Selector editable. | Implementado; `Descartado` no existe. Hay cambios que evitan los módulos de origen. |
| Estado sanitario | Sano, En observación, Enfermo, Recuperación; tratamientos separados. | Cambios con motivo y bitácora. | Implementado; migración de «En tratamiento» tiene excepción de cuota. |
| Estado reproductivo | Se deriva de `RegistroReproductivo`; no es campo de `Animal`. | Se gestiona en reproducción. | Separación correcta de dominios. |
| Muertes | Fecha de muerte y evento con observaciones. | Fecha, estado y observaciones generales. | Parcial: no causa ni necropsia estructuradas; fecha no obligatoria para Muerto. |
| Ventas individuales | `VentaAnimal` y actualización del mismo Animal; no elimina el animal. | Selección y confirmación en Ventas. | Implementado con transacción en el árbol actual; persiste la vía manual contradictoria. |
| Compras | `CompraAnimal` crea animales y referencias comerciales. | Compra grupal, lote rápido y edición comercial. | Identidad preservada al editar; transacción y controles de dependencias presentes. |
| Borrado de Animal | `findByIdAndDelete` y limpieza limitada. | Acción eliminar con confirmación. | Riesgo: no inspecciona dependencias de dominio. |
| Genealogía | Padre/madre internos, identificadores/textos externos, origen y registro genealógico. | Árbol, ascendencia/descendencia y detalle. | Parcial: valida sexo y ciclos, no especie ni cronología de parentesco. |
| Historial de pesajes | `Pesaje`, eventos y actualización del peso actual desde el último pesaje. | Lista individual, evolución y flujo grupal por lote. | Implementado; edición manual del peso actual puede separarlo de ese historial. |
| Lotes | `Lote`, `PertenenciaLote`, `loteActual`; índice de una pertenencia activa por animal/finca. | Alta, entrada/salida y actividades por lote. | Implementado; no crea un animal nuevo por pertenecer a lote. |
| Potrero | Referencia `potreroActual`, ubicación y flujos operativos. | Contexto en ficha/lote. | Implementado; distinta de finca y lote. |
| Traslado entre fincas | Conserva ID; `TrasladoFinca` y `HistorialFincaAnimal`; cierra lote y limpia ubicación. | Operación multi-finca. | Transaccional; revisar continuidad visible de datos de dominio históricos. |
| Bitácora | `EventoAnimal`, referencia al origen y actor. | Eventos por animal, incluidos traslados de fincas accesibles. | Implementado, pero algunos CRUD permiten alterar/borrar eventos derivados. |
| Fotografía | `fotoPrincipal` y servicio multimedia. | Subir/eliminar imagen y mostrar ficha. | Subida PRO/PREMIUM; permiso de inventario. |
| Consulta offline | IndexedDB contextual, variante por especie. | Fallback de lectura de inventario guardado. | Implementado; no equivale a reservar cupo ni dar altas offline. |
| Camadas | Madre, ciclo, fechas, nacimientos, muertos, destetados, destinos y estado. | Vista de camadas, formulario, destete, cierre/cancelación. | Colectivo real; validación de conservación incompleta. |
| Individualización porcina | Animal con `camadaOrigen`, madre y fecha heredables. | Formulario de animal permite seleccionar camada. | Consume cupo al crear activo; no limita cuántos se extraen de una camada. |
| Venta colectiva | Líneas con camada, cantidad y peso total en `VentaAnimal`. | Venta de crías sin IDs individuales. | Valida disponible por destino de venta, pero no reconcilia toda la población. |
| Nacimiento individual | `registrarTerneroDesdeParto` crea un Animal enlazado a la madre. | Flujo desde registro con parto real. | Valida cuota; no hay vínculo único/idempotente de cría por intento. |
| Excel | Plantilla, previsualización, confirmación, resultados por fila. | Importación general, crear/actualizar o solo crear. | Valida cupo por fila; admite resultado parcial y comparte la carrera de reserva. |
| Semen / catálogo | `InsumoReproductivo`, categoría `SEMEN`; stock por documento. | Inventario dentro de IATF. | Implementado; no existe modelo independiente `PajuelaSemen`. |
| Semen / toro y raza | Toro, código toro, raza, tipo de semen, lote, vencimiento y costo. | Captura de toro/raza/lote/tipo. | Referencias textuales; sin unicidad toro/lote ni catálogo genético relacional completo. |
| Semen / consumo IATF | Una unidad por participante inseminado; snapshot en campaña y ciclo asociado. | La interfaz informa el descuento por animal. | Condición de saldo y transacción presentes. |
| Semen / IA convencional | Registro reproductivo permite inseminación. | Flujo reproductivo individual. | No se encontró descuento ni referencia equivalente al stock de semen. |
| Semen / bandas porcinas | Paso INSEMINACION actualiza ciclo/fechas. | Ejecución desde banda. | No consume `InsumoReproductivo` en ese flujo. |
| Semen / ajustes y vencimiento | API permite editar directamente cantidades; fecha de vencimiento persistida. | Tabla de disponible/en uso; alta de stock. | Sin validación de vencimiento al consumir ni ajuste de stock con causa/versionado. |

### 2.1 Ficha del animal, unicidad y duplicados

Fuentes: [Animal.js](backend/models/Animal.js), [animal-controller.js](backend/controllers/animal-controller.js), [animal-dto.js](backend/services/animal-dto.js), [FormularioAnimal.js](frontend/src/Components/FormularioAnimal.js), [Animales.js](frontend/src/Components/Animales.js).

El modelo incluye identificación, descripción racial, genealogía, fechas, pesos, datos comerciales, estado sanitario, potrero, lote, foto y observaciones. `compraId`, `ventaId` y `camadaOrigen` relacionan los orígenes. El estado reproductivo pertenece a [RegistroReproductivo](backend/models/RegistroReproductivo.js).

| Identificador | Restricción declarada | Consecuencia |
|---|---|---|
| `identificadorFinca` | Único compuesto `(organizacionId, fincaId, identificadorFinca)`. | Mismo código en otra finca permitido; duplicado en la misma finca rechazado por el índice. |
| `diio` | Único compuesto `(organizacionId, diio)`, parcial cuando DIIO es string. | No se puede repetir entre fincas de una misma organización; sí entre organizaciones diferentes. |
| Código de camada | Único `(organizacionId, fincaId, codigoCamada)`. | Identifica camada, no cada una de sus crías. |
| Semen | Índice de nombre/lote sin `unique`. | Dos documentos pueden representar el mismo lote de semen. |

`validarDiioDisponible` consulta dentro de la finca activa, mientras el índice DIIO abarca la organización. Un duplicado de otra finca puede superar la prevalidación y terminar como error MongoDB al guardar. En el endpoint Animal se captura como 400; no se traduce de forma específica a conflicto de unicidad. No se verificó que esos índices estén instalados en la base desplegada.

Se recortan espacios, pero no hay normalización uniforme de mayúsculas/minúsculas ni unicidad cruzada entre el DIIO de un animal y el código interno de otro. Excel busca por `diio OR identificadorFinca` usando la misma columna DIIO; dos identificadores cruzados pueden volver ambiguo cuál registro se actualiza. En Excel se detectan duplicados dentro del archivo, pero esa validación no unifica todas las vías de alta.

### 2.2 Estados, bajas y conservación de historia

El modelo admite exactamente **Activo, Vendido y Muerto**. «En tratamiento» se trata como legado y se presenta como Activo con información sanitaria separada. No existe «Descartado» ni una baja archivada independiente del borrado.

**Muerte:** el formulario admite `fechaMuerte`, estado y observaciones. El evento de muerte usa la fecha indicada o la fecha actual si falta, pero ese fallback no exige que la ficha conserve una fecha de muerte. No hay campos específicos para causa, diagnóstico post mortem o necropsia; solo notas generales/eventos manuales. Tampoco se exige coherencia entre nacimiento y fecha de baja.

**Venta confirmada:** el [controlador actual](backend/controllers/ventaAnimalController.js) guarda la venta y sus efectos en transacción, condiciona el cambio a `estado: Activo`, guarda datos de venta, cierra pertenencia y genera ingreso/eventos. Conserva el ID y no elimina Pesaje, sanidad ni reproducción. Al quedar Vendido, sale del conteo de activos. La reversión intenta restaurar pertenencias cerradas por esa venta y comprueba cuota al reactivar.

**Límite:** modificar la ficha o importar Excel sigue permitiendo cambiar estados sin pasar por Ventas. Reponer Activo en la ficha de un vendido no anula la venta, y marcar Vendido manualmente no crea su documento comercial. El borrado directo sí puede separar el historial de su animal. Por ello, la garantía es válida para el flujo de venta previsto, no para todas las mutaciones posibles.

### 2.3 Camadas y población porcina real

Fuentes: [Camada.js](backend/models/Camada.js), [camadaController.js](backend/controllers/camadaController.js), [camada-service.js](backend/services/camada-service.js), [bandas porcinas](backend/services/protocoloPorcino-service.js).

El nacimiento/destete de una camada conserva cantidades colectivas: no crea automáticamente N documentos Animal. Los animales seleccionados para inventario individual se crean por el flujo de alta y se enlazan por `camadaOrigen`. La interfaz compara los registrados por objetivo con `criasParaFinca` y `criasParaEngorde`; son indicadores, no reservas atómicas de población.

Los estados de camada son Activa, Destetada, Vendida, Cerrada y Cancelada. Registrar destete cambia cantidades/fecha/estado y tareas, pero no convierte por sí solo el colectivo en individuos. Las ventas colectivas descuentan disponibilidad mediante el histórico de ventas no anuladas. Los contadores no forman una ecuación única entre nacidos vivos, muertos, individualizados y vendidos.

El flujo PARTO de banda sí verifica que nacidos totales coincida con vivos + muertos + momias; el CRUD general de Camada no aplica la misma regla. Esta diferencia es importante: una restricción de un flujo no protege a los demás.

### 2.4 Stock de semen y ejecución reproductiva

Fuentes: [InsumoReproductivo.js](backend/models/InsumoReproductivo.js), [iatf-service.js](backend/services/iatf-service.js), [rutas IATF](backend/routes/iatfRoutes.js), [IATF.js](frontend/src/Components/IATF.js).

El semen se distingue con categoría `SEMEN`, tipo CONVENCIONAL/SEXADO/OTRO, toro, código, raza, lote, unidad, cantidad disponible, costo y moneda. El campo vencimiento existe en backend; el formulario de alta revisado no lo ofrece. El stock pertenece a la finca y no consume cupo de animales.

Crear una plantilla o campaña no descuenta pajuelas. En `registrarIATF`, por cada participante aceptado se ejecuta un decremento de 1 con filtro de categoría SEMEN, activo y cantidad disponible ≥ 1. El decremento, ciclo reproductivo, participante, tareas y eventos usan la misma sesión transaccional. Un participante ya INSEMINADA no cumple el estado permitido para repetir ese registro. Se conserva snapshot del semen y costo utilizados.

Los dispositivos y otros productos del motor IATF tienen reglas de consumo distintas; para semen el flujo dedicado es una pajuela por inseminación. No se exige un inventario general de bodega para implementar ni auditar este control.

Persisten límites: no verifica vencimiento, no exige enteros para pajuelas, permite editar saldo por PUT y no comprueba de nuevo que el animal siga activo al ejecutar. La ruta genérica de ejecución de pasos también acepta SEMEN por API, aunque la pantalla principal lo excluye de ese selector. IA convencional y pasos de inseminación porcina no conectan con el decremento anterior.

## 3. Diagnóstico de Cupos y Barreras de Plan

### 3.1 Límites y unidad de conteo

La configuración coincide con lo pedido en Agents.md:

| Plan | Especies | Límite de Animal activo | Alcance | Semen/IATF |
|---|---|---|---|---|
| ESENCIAL | Una elegida: Bovino o Porcino | 210 bovinos o 500 porcinos | Organización, no por finca | Feature IATF deshabilitada |
| GESTIÓN | Ambas | 2.000 combinados | Organización | Feature IATF deshabilitada |
| PRO | Ambas | 5.000 combinados | Organización | Habilitada |
| PREMIUM | Ambas | 10.000 combinados | Organización | Habilitada; consolidado adicional |

Fuentes: [planes.js](backend/config/planes.js), [PlanService](backend/services/plan-service.js#L198), [middleware de plan](backend/middleware/plan.js).

`contarAnimalesActivos` aplica `$match: { estado: 'Activo' }`, agrupa por especie y usa `omitirAislamientoFinca: true`, conservando aislamiento organizacional. No cuenta muertos, vendidos, reservas de semen ni crías representadas solo en Camada. Un Animal sin especie se agrupa como Bovino. Los registros legados «En tratamiento» no entran en ese conteo aunque la interfaz pueda mostrarlos como activos.

La comprobación de alta activa exige especie habilitada y plan vigente; solo Activo y Prueba son estados vigentes de suscripción. Las limitaciones de la interfaz son ayudas: la barrera relevante es el backend.

### 3.2 Revisión por cada vía de entrada o reactivación

| Vía | Validación encontrada | Atomicidad / limitación | Resultado de auditoría |
|---|---|---|---|
| `POST /api/animales` activo | `asegurarPuedeCrearAnimal` + `ejecutarConReservaCuota`. | Guardado individual protegido por reserva; bitácora posterior no forma una transacción conjunta. | Control secuencial presente; carrera común pendiente. |
| `PUT /api/animales/:id` hacia Activo | Valida especie y reserva si antes no era Activo. | El estado anterior se lee antes de actualizar. | Control presente; no concilia documento comercial y comparte carrera. |
| Alta de Vendido/Muerto | No reserva cupo, pues no añade activo. | No pasa por la validación de plan de alta activa; aplica restricciones de finca que correspondan. | No aumenta activos, pero requiere política de históricos/especie/vigencia explícita. |
| Compra confirmada | Reserva por `animales.length`, antes de crear. | Creación de compra, animales y efectos en transacción; reserva fuera de ella. | Mejora existente; comparte defecto del mecanismo global. |
| Edición de compra | Conserva conjunto e IDs; no permite agregar/quitar animales. | Transacción para actualización comercial. | No es una vía de nuevas altas en esta versión. |
| Nacimiento individual desde parto | Valida cuota/especie y reserva 1 antes de guardar. | Animal y tareas/eventos posteriores no forman una única transacción. | No omite cuota; falta idempotencia de la operación completa. |
| Nacimiento/destete colectivo | Crea/actualiza Camada; no crea Animal. | Sin reserva ni conteo de crías colectivas. | No consume cupo de Animal; límite de población viva no cubierto. |
| Individualización desde camada | Usa alta individual con cuota. | No retira/reserva atómicamente una unidad del colectivo. | Cupo individual sí, conservación de población no. |
| Excel: nuevas filas activas | Valida y reserva antes de cada `Animal.create`. | Secuencial por fila, con captura de errores y éxito parcial. | No inserta libremente todo el archivo sin control. Comparte carrera global. |
| Excel: reactivar existente | Valida especie, cuota y reserva. | `save` individual; previsualización no garantiza cupo futuro. | Control presente; cambios de estado evitan flujo comercial. |
| Excel: actualizar activo | No consume otra unidad; valida especie/objetivo y lote cuando corresponde. | Permite actualizar otros campos de inventario. | Correcto no contar dos veces el mismo activo; revisar conservación de historia. |
| Anular/eliminar venta | Verifica cuota y reserva para reactivaciones individuales. | Reversión transaccional. | Control presente; comparte carrera global. |
| Editar venta | Calcula animales anteriores que saldrán de la venta y reserva para reactivarlos. | Lectura usada para la reserva fuera de la transacción posterior. | Control presente; requiere prueba de concurrencia también ante edición simultánea. |
| Traslado entre fincas de la organización | No crea ni duplica Animal; conserva ID. | Transacción de traslado y validaciones de destino. | No necesita nuevo cupo organizacional. |
| Normalización sanitaria de legado | «En tratamiento» pasa a Activo. | No usa PlanService ni reserva en ese servicio. | Puede aumentar el conteo más allá del límite si existen datos legados. |
| Eliminación de Animal | Baja físicamente el documento, libera conteo por desaparición. | No protege referencias. | No excede cupo, pero compromete trazabilidad. |

Las rutas de inventario están en [animal.js](backend/routes/animal.js); los otros flujos se inspeccionaron en [importación](backend/services/importarExcel-service.js#L616), [reproducción](backend/controllers/reproduccionController.js#L229), [compras](backend/controllers/compraAnimalController.js), [ventas](backend/controllers/ventaAnimalController.js), [traslados](backend/services/consolidacionMultiFinca-service.js) y [estado sanitario](backend/services/estadoSanitario-service.js).

### 3.3 Contraejemplo de concurrencia del mecanismo de reservas

El [servicio](backend/services/plan-service.js#L63) lee primero el consumo, luego consulta/modifica un documento `ReservaCuotaPlan`. La condición atómica solo protege la lista de reservas; usa el conteo previamente leído como número constante. La reserva se elimina al terminar la operación. No existe un contador persistente de ocupación actualizado conjuntamente con Animal.

Secuencia reproducida con límite 210 y 209 activos iniciales:

1. B lee 209 y queda suspendida antes de insertar su reserva.
2. A lee 209, reserva 1, crea su animal y libera su reserva. Quedan 210 activos.
3. B continúa con la lectura 209 guardada. Ya no hay reserva de A.
4. Su condición evalúa `209 + 1 + 0 <= 210`, acepta y crea otro animal.
5. Resultado: **211 activos, cero reservas pendientes**.

Se ejecutó `ejecutarConReservaCuota` real sustituyendo únicamente `Animal.aggregate` y las operaciones de `ReservaCuotaPlan` por dobles que reproducen ese intercalado. La expiración fija de reservas a 15 minutos, sin renovación, añade otro caso que deberá contemplarse para operaciones largas.

**Diagnóstico:** contar antes de reservar no garantiza el límite. No basta comprobar que exista un índice único de reserva por organización/recurso ni agregar otra consulta previa. Hace falta serializar la ocupación mediante contador o bloqueo compartido y cambios de Animal coherentes con esa decisión.

### 3.4 Evidencia adicional reproducida sin base de datos

| Prueba ejecutada sobre código real | Resultado observado | Límite de la evidencia |
|---|---|---|
| Preparador de camada + validación de documento, con 0 nacidos vivos, 25 para venta y 40,5 destetados. | Aceptado. | No se ejecutaron las tareas posteriores del endpoint. |
| Validación de `InsumoReproductivo`, SEMEN, 1,5 pajuelas y vencimiento de 2020. | Aceptado por el esquema. | Guardar un lote vencido puede ser legítimo; el defecto operativo es no comprobarlo al usarlo. |
| `consumirInsumos` con tipoAccion IATF y producto SEMEN vencido. | Descuenta 1 en el doble de persistencia, sin registrar inseminación. | Demuestra la aceptación del servicio genérico, no una transacción real contra MongoDB. |
| `validarRelacionGenealogica` con padre porcino macho. | Acepta la relación sin recibir/comparar especie de la cría. | Prueba la ausencia de esa validación; no comprueba un árbol real de producción. |

### 3.5 Acceso por roles y alcance organizacional

Según [permisosRoles.js](backend/config/permisosRoles.js), inventario lo consultan Administrador, Encargado, Trabajador, Veterinario y Consulta; lo gestionan Administrador/Encargado. **Eliminar Animal usa el mismo permiso de gestionar**, sin una restricción adicional de historial o rol. Camadas se gestionan por Administrador/Encargado/Veterinario y su eliminación exige el permiso reproductivo de Administrador.

Semen/IATF está detrás de `iatfReproductivo` (PRO/PREMIUM). Administrador/Veterinario configuran insumos. Administrador/Encargado/Trabajador/Veterinario ejecutan IATF; para Trabajador se comprueba la tarea asignada. Esos permisos no se extienden automáticamente a un inventario genético compartido entre fincas: el stock queda bajo la finca activa.

La protección del DTO Animal es positiva, pero no cubre todos los recursos relacionados. Camada, Pesaje y eventos aceptan cuerpos más amplios y el plugin de organización solo completa campos ausentes al crear. Los controles del recurso principal deben extenderse a sus satélites.

## 4. Plan de Acción Priorizado

P1: riesgo de integridad, autorización, sobreventa o incumplimiento del cupo. P2: inconsistencia operativa o trazabilidad incompleta. Los siguientes son hallazgos y propuestas; no se modificó su implementación en esta entrega.

### INV-01 — P1: corregir la exclusión concurrente de cupos

**Evidencia:** [reservarCuotaPlan](backend/services/plan-service.js#L63), [ReservaCuotaPlan](backend/models/ReservaCuotaPlan.js), contraejemplo de §3.3. Afecta todas las vías que reutilizan la reserva, incluso si su operación de dominio usa transacción.

**Acción:** centralizar altas/reactivaciones/bajas con una ocupación organizacional actualizada atómicamente junto con los cambios de animales, o serializar esas operaciones con un bloqueo compartido y lectura válida dentro de él. Definir recuperación ante fallos y expiración. No resolverlo con un segundo `count` previo.

**Aceptación:** con un único cupo libre y altas simultáneas desde formulario, compra, parto y Excel, exactamente una unidad entra; ninguna combinación supera el límite. Probar rollback, reintentos, expiración y reactivación contra MongoDB con soporte transaccional.

### INV-02 — P1: definir y conciliar el conteo de crías colectivas

**Evidencia:** el conteo de PlanService solo consulta Animal; [Camada](backend/models/Camada.js) no participa. Nacimiento, destete y partida de banda mantienen cantidades colectivas.

**Acción:** decidir si el límite comercial significa individuos registrados o población viva. Si debe limitar animales vivos, sumar remanentes colectivos e individualizados sin doble conteo y mover unidades entre representaciones en una operación atómica. Si las crías colectivas están excluidas por política, expresarlo en planes, uso y mensajes de cupo. No crear IDs artificiales solo para contarlas.

**Aceptación:** una camada con 12 vivos añade 12 a la población; individualizar 4 mantiene el total en 12; vender 3 y registrar 1 muerte deja 8, con desglose verificable. El cupo facturable debe seguir la política acordada.

### INV-03 — P1: impedir borrados que dejan historial huérfano

**Evidencia:** [deleteAnimal](backend/controllers/animal-controller.js#L465) elimina primero el animal y después limpia eventos de Inventario/foto. No revisa Pesaje, sanidad, reproducción, padres/hijos, ventas, compras, camadas, pertenencias o campañas. [deleteCamada](backend/controllers/camadaController.js#L418) elimina la camada y cancela tareas, sin comprobar animales o ventas asociados.

**Acción:** separar corrección de un alta sin uso de baja/archivo histórico. Bloquear eliminación con dependencias o conservar un registro archivado referenciable. Reutilizar los controles de dependencias que ya incorporó la anulación de compras, ampliándolos a todos los recursos pertinentes.

**Aceptación:** intentar borrar un animal pesado, tratado, vendido, padre/madre o participante de campaña devuelve conflicto y conserva sus relaciones. Igual criterio para una camada con crías individualizadas o ventas.

### INV-04 — P1: centralizar transiciones de estado y su origen

**Evidencia:** [updateAnimal](backend/controllers/animal-controller.js#L321), [DTO](backend/services/animal-dto.js) y [Excel](backend/services/importarExcel-service.js#L616) permiten escribir estado y datos comerciales. El CRUD manual no verifica que `ventaId` exija revertir primero Ventas.

**Acción:** vender/reactivar un animal vinculado a venta únicamente mediante su dominio; las bajas por muerte deben tener una operación explícita con fecha/motivo y cierre coherente de pertenencias. En importación, distinguir migración de históricos de cambios sobre operaciones vigentes. Evitar que la misma ficha declare Activo y conserve una venta confirmada.

**Aceptación:** editar o importar Activo sobre un vendido no anula implícitamente su venta; se rechaza o conduce a reversión válida con cuota. Marcar Vendido sin operación comercial debe quedar restringido a un modo histórico explícito y trazable.

### INV-05 — P1: conservar cantidades y relaciones de camada en todos los flujos

**Evidencia:** [prepararDatosCamada](backend/controllers/camadaController.js#L152) solo rechaza distribución superior a vivos si vivos > 0; los campos numéricos admiten fracciones. [registrarDestete](backend/controllers/camadaController.js#L319) no comprueba disponibilidad ni todas las transiciones previas. [prepararRelacionCamada](backend/controllers/animal-controller.js#L78) valida existencia/no cancelada, pero no cupo de crías ni coincidencia de madre explícita con la camada. El CRUD Camada no verifica que el ciclo asociado pertenezca a esa madre.

**Acción:** un validador común para CRUD, destete, banda, individualización y venta: enteros no negativos, nacidos conciliados, supervivientes suficientes, destinos compatibles y referencias madre/ciclo/camada coherentes. Mantener saldo colectivo e historial de sus variaciones.

**Aceptación:** rechazar los ejemplos de §3.4; no destetar más supervivientes ni individualizar más crías disponibles; rechazar asociación con ciclo/madre distintos. Un intento repetido debe ser idempotente.

### INV-06 — P1: serializar la disponibilidad de venta colectiva

**Evidencia:** [validarCamadasVenta](backend/controllers/ventaAnimalController.js) calcula `criasParaVenta - ventasNoAnuladas`; crear una venta escribe documentos nuevos, sin un descuento condicionado sobre un saldo común de la camada. Dos transacciones pueden leer la misma disponibilidad y escribir ventas distintas sin conflicto sobre ese saldo. Es un riesgo por inspección; no se ejecutó la carrera en MongoDB.

**Acción:** reserva/descuento atómico de disponibilidad colectiva dentro de la transacción de venta, con restitución al anular y conciliación con individualización/mortalidad. La transacción por sí sola no protege una regla calculada desde lecturas de documentos que ninguna de las dos operaciones modifica.

**Aceptación:** dos ventas simultáneas de 8 sobre un disponible de 10 no pueden confirmar ambas. La edición de `criasParaVenta` tampoco puede dejar disponibilidad incompatible con ventas existentes.

### INV-07 — P1: proteger campos de ámbito en los recursos satélite

**Evidencia:** [Camada create/update](backend/controllers/camadaController.js#L233), [Pesaje create/update](backend/controllers/pesaje-controller.js), [eventos](backend/controllers/eventoAnimalController.js) y [plugin de organización](backend/models/plugins/organizacion-plugin.js). A diferencia de Animal, estos caminos aceptan campos del cuerpo sin un DTO equivalente; el plugin no sustituye una organización/finca explícita al validar.

**Acción:** listas permitidas, ámbito impuesto desde sesión y comprobación de pertenencia de todas las referencias. No permitir que cambiar un evento reescriba su origen de dominio. Proteger los campos internos también en actualizaciones.

**Aceptación:** un usuario autorizado en finca A no crea ni traslada una camada, pesaje o evento a finca/organización B mediante payload; las referencias deben pertenecer al ámbito autorizado. Verificar por endpoint real, no solo `validate()`.

### INV-08 — P1: unificar consumo de semen y evitar doble descuento

**Evidencia:** [registrarIATF](backend/services/iatf-service.js#L500) descuenta una pajuela; [consumirInsumos](backend/services/iatf-service.js#L361) también permite consumir SEMEN en un paso genérico. La reproducción individual y [INSEMINACION porcina](backend/services/protocoloPorcino-service.js#L155) guardan el ciclo sin consumir ese stock.

**Acción:** servicio único de uso de semen enlazado a inseminación real, con identidad de operación, lote y cantidad. Impedir que el paso previo descuente nuevamente el semen de esa misma IA. Integrarlo en los flujos que deban controlar semen, manteniendo explícito el caso de semen externo/no inventariado cuando sea aplicable.

**Aceptación:** programar no consume; registrar una IA con stock descuenta exactamente su cantidad una sola vez; repetir petición no vuelve a descontar; anular/corregir sigue una política trazable. Cubrir IATF, convencional y bandas porcinas.

### INV-09 — P2: endurecer el catálogo genético y elegibilidad al ejecutar

El esquema y formulario permiten 1,5 pajuelas; el vencimiento no participa en filtros de consumo. `guardarInsumo` permite reemplazar `cantidadDisponible`/`cantidadEnUso` sin un ajuste identificado ni control de versión. `registrarIATF` se apoya en el participante y no consulta de nuevo el estado actual de Animal: una hembra vendida, muerta o trasladada después de inscribirse puede quedar elegible por su estado de campaña.

**Acción:** unidad y cantidad entera cuando se trate de pajuelas, control de vencimiento al uso, ajustes de stock con motivo/autor y protección contra sobrescrituras concurrentes. Revalidar estado/finca del animal al ejecutar y retirar participantes afectados por bajas. La cancelación de una campaña no debe devolver automáticamente un consumo que sí ocurrió.

**Aceptación:** saldo nunca negativo, ninguna dosis consumida dos veces, lote vencido no usado por omisión y animal dado de baja no inseminado desde una campaña antigua. No se necesita un Kardex general para estos controles específicos.

### INV-10 — P2: completar genealogía e identidad coherente entre entradas

**Evidencia:** [validarRelacionGenealogica](backend/services/genealogiaService.js#L57) comprueba sexo, existencia, autorreferencia y ciclos hasta 12 generaciones, pero no compara especie de padres/cría ni sus fechas. No recibe la especie de la cría en el alta. La UI filtra opciones, pero eso no protege la API.

**Acción:** validar especie, cronología y genealogía final combinando cambios parciales con el registro vigente. Unificar normalización y resolución de DIIO/código; al encontrar dos coincidencias cruzadas, fallar explícitamente. Traducir violaciones de unicidad y verificar índices desplegados.

**Aceptación:** no asignar padre porcino a bovino; no aceptar padres posteriores a la cría sin una excepción histórica definida; código ambiguo de Excel no actualiza un registro arbitrario.

### INV-11 — P2: completar trazabilidad de muertes y nacimientos

La muerte no exige fecha ni causa estructurada; un evento puede registrar la fecha actual mientras la ficha queda sin fecha de muerte. El nacimiento individual desde parto guarda Animal y después tareas/eventos; un fallo posterior puede responder error dejando el animal creado. Reintentar con otro identificador puede registrar otra cría para el mismo intento. No hay una identidad de solicitud ni una regla de cantidad de crías por resultado de parto en ese endpoint.

**Acción:** transacción o recuperación idempotente para el nacimiento completo; distinguir reintento de un nacimiento múltiple legítimo. Incorporar causa/notas de muerte según necesidad, fecha coherente y vínculo de baja con eventos. La migración sanitaria de «En tratamiento» debe contabilizarse y reconciliarse antes de aplicar cupos.

**Aceptación:** reintentar una alta fallida no duplica la cría; gemelos pueden registrarse explícitamente; ninguna normalización legada aumenta activos sin considerar la ocupación. Una muerte conserva fecha y motivo consultables.

### INV-12 — P2: preservar una vista consistente del historial al trasladar y pesar

El traslado conserva ID y bitácora organizacional accesible, pero [getPesajesPorAnimal](backend/controllers/pesaje-controller.js) consulta bajo la finca activa: los pesajes anteriores permanecen en la finca de origen. Sanidad y genealogía también usan consultas por finca en varios caminos. Se debe distinguir historia conservada en base de historia visible desde el nuevo destino, sin ampliar permisos indiscriminadamente.

`pesoActual` puede cambiarse desde la ficha/Excel sin crear Pesaje. El endpoint de Pesaje recalcula desde el último registro; al borrar el último puede dejarlo nulo aunque exista peso comercial/inicial. Los indicadores basados en `pesoActual` y los basados en Pesaje pueden divergir.

**Acción:** definir consulta histórica por animal con permisos de fincas y metodología única para peso vigente; marcar origen/fecha/cobertura del peso. Paginar el inventario en servidor, que actualmente carga el conjunto completo, antes de depender de filtros visuales para hato grande.

**Aceptación:** después de traslado, un usuario con ambos accesos puede consultar cronología completa; uno restringido ve solo lo permitido y la limitación queda explícita. El peso mostrado identifica su fuente y no contradice silenciosamente el historial.

### Secuencia de corrección y pruebas requeridas

1. Resolver INV-01 y la política de INV-02; construir pruebas concurrentes reales para formulario, compras, parto, Excel y reactivaciones.
2. Proteger bajas, referencias y ámbito: INV-03, INV-04 e INV-07. Ensayar con animales con historia sanitaria, pesajes, genealogía y documentos comerciales.
3. Centralizar conservación de camadas y ventas colectivas: INV-05/06, incluyendo edición, cancelación, mortalidad e individualización.
4. Unificar semen y proteger su uso: INV-08/09; probar agotamiento concurrente, idempotencia, vencimiento y bajas posteriores a inscripción.
5. Completar validaciones y experiencia histórica: INV-10/11/12, con pruebas por especie, rol, finca y datos legados.

Esta entrega añadió únicamente `AUDIT_MODULO_INVENTARIO.md`. Los cambios de código y documentos que ya estaban en el árbol de trabajo se conservaron. No se ejecutaron migraciones, correcciones masivas ni escrituras sobre datos de la aplicación.
