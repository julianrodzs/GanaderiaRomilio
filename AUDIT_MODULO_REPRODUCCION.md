# Auditoría del módulo de reproducción y gestación

Fecha de cierre: **20 de octubre de 2026**, America/Costa_Rica. Base: árbol de trabajo existente sobre HEAD `e7bffc6`, incluidos los cambios locales previos. Instrucciones: [Agents.md](Agents.md).

Alcance: reproducción individual bovina/porcina, nacimiento de terneros y enlace con Camada, IATF, bandas porcinas, genealogía, tareas, bitácora, inventario reproductivo, reportes, permisos, suscripciones y operación offline. Auditoría de software; los valores biológicos descritos son los que ejecuta el repositorio, no recomendaciones clínicas.

## 1. Resumen Ejecutivo

**El sistema dispone de ciclos reproductivos, campañas IATF y bandas porcinas utilizables, pero sus flujos no ofrecen garantías uniformes de seguridad, coherencia reproductiva e integridad histórica.** IATF tiene transacciones y snapshots de protocolo; los ciclos ordinarios y bandas mantienen varias escrituras independientes. El nacimiento no es una consecuencia automática de guardar un parto: requiere otra operación.

Se identifican **18 hallazgos: 11 P1 y 7 P2**. P1 significa prioridad alta por autorización, integridad de registros o continuidad operativa. P2 agrupa problemas funcionales, de cálculo, trazabilidad o experiencia de uso. No son puntuaciones CVSS.

Los riesgos principales son:

- El CRUD ordinario acepta campos internos y operadores MongoDB. Se reprodujo un PUT que cambia tenant, convierte el receptor en macho y reactiva un ciclo cancelado.
- La validación ordinaria exige Hembra, pero no animal Activo ni edad reproductiva. Dos altas solapadas pueden crear dos ciclos activos.
- El cierre «No preñada» y el diagnóstico VACIA no tienen la misma semántica. Un bovino puede quedar etiquetado Gestante tras el cierre; una VACIA de IATF conserva ciclo activo y bloquea la nueva inseminación de la resincronización.
- Fallos posteriores pueden dejar ciclos/partos guardados sin sus efectos completos. En bandas se reprodujo devolución de todas las pajuelas aunque la primera cerda ya tenía su inseminación persistida.
- El borrado del ciclo elimina eventos de nacimiento y deja referencias desde camadas/campañas sin resolver.
- La ejecución genérica de IATF acepta IDs repetidos y participantes retiradas; retirar participantes no exige tarea asignada al trabajador.
- Las fechas automáticas sobrescriben o conservan valores incorrectos según el flujo. El destete porcino usa valores divergentes entre ciclo, camada y pantalla.

### Controles comprobados en código

- Autenticación con organización activa y acceso a la finca; consultas normales de registros, animales, insumos y campañas filtradas por tenant.
- Sexo Hembra en alta ordinaria; IATF exige bovina activa con objetivo REPRODUCCION, y banda exige hembra porcina activa al ingresar.
- Validación de responsables ordinarios contra membresía activa y acceso a la finca.
- IATF y protocolos porcinos requieren las features Pro correspondientes; consolidación exige Premium y permisos de reportes.
- Consumo de semen con actualización condicionada a existencias, vigencia del lote respecto de la fecha de uso y cantidad entera positiva.
- IA convencional envuelve consumo y escritura del ciclo en transacción; creación, ejecución, inseminaciones y diagnósticos IATF tienen transacciones.
- CampanaIATF y BandaReproductivaPorcina usan `optimisticConcurrency`; EjecucionPasoIATF declara índice único campaña/paso.
- Alta de ternero y de población colectiva de camada usan reserva de cuota con recuento dentro del bloqueo. No se trata solo de una consulta previa de cupo.
- Reapertura explícita restringida a Cerrado y rechazo si ya hay otro ciclo activo, aunque el PUT genérico permite eludir esa regla.

### Verificación y límites

`npm.cmd test`, ejecutado en `backend`: **247 aprobadas, 0 fallidas, 0 omitidas, salida 0**. Además, se ejecutaron **22 comprobaciones aisladas R1–R22**, descritas en la sección 7, con funciones/controladores reales y almacenamiento simulado.

En R10/R11/R12/R13/R21/R22 se usaron hooks reales de Mongoose en las operaciones indicadas. En los escenarios de IATF se sustituyó la sesión por un doble: comprueban decisiones del servicio, no atomicidad real de MongoDB. No se accedió a producción, no se ejecutaron migraciones, no se probaron HTTP autenticado ni navegador. No se certificó despliegue de índices ni topología transaccional de MongoDB. Las 247 pruebas existentes no cubren todos estos casos.

## 2. Catálogo Exhaustivo de Funcionalidades Activas

«Básico» indica capacidad ejecutable con alcance limitado. «Incompleto» identifica una integración ausente o un defecto material. No se certifica «100% Funcional» sin validación integral de base de datos e interfaz.

| Submódulo / Función | Descripción en Código | Estado Backend | Estado Frontend | Madurez (100% Funcional / Básico / Incompleto) |
| --- | --- | --- | --- | --- |
| Ciclo individual | Animal, responsable, fechas, especie, observaciones y estado del ciclo | CRUD y consultas por animal | Formulario y listado por especie/fechas | Incompleto |
| Monta natural | Tipo Monta y fecha; no relación estructurada al toro del servicio | Persiste ciclo y genera evento | Selector Monta natural | Básico |
| IA convencional | Semen, pajuelas y snapshot; consumo asociado al ciclo | Transacción de consumo/registro | Selector de semen y cantidad | Incompleto |
| Servicio sin especificar | Tipo Inseminación/Monta sin exigir semen | Admitido como valor predeterminado | Opción «Sin especificar» | Básico |
| Transferencia de embriones | No hay tipo, donante, receptora ni embrión estructurado | No implementada | No implementada | Incompleto |
| FPP bovina básica | Monta + 283 días solo si aún no hay FPP | Cálculo en modelo | Cálculo equivalente, fecha editable | Incompleto |
| FPP bovina IATF | Se calcula tras diagnóstico positivo con duración configurada en finca | Servicio específico, fallback 283 | Visible en ciclo | Básico |
| Celo bovino posparto | Parto + 60 días, avanza de 21 en 21 hasta fecha no vencida | Modelo y tareas | Fecha calculada | Básico |
| Celo 21 días después de monta bovina ordinaria | No se genera por el flujo individual | Ausente | Ausente | Incompleto |
| Diagnóstico bovino individual | Campos existen; no hay comando/formulario diagnóstico equivalente al de IATF | PUT genérico y cierre No preñada | Acción No preñada; sin historia diagnóstica específica | Incompleto |
| Cierre/cancelación/reapertura | Estados Activo, Cerrado, Cancelado, No preñada; eventos y tareas | Servicios explícitos | Botones y confirmaciones | Incompleto |
| Pérdida gestacional | No hay acto específico de aborto/reabsorción con revisión posterior | Se puede anotar motivo o cambiar resultado | Sin flujo específico | Incompleto |
| Parto bovino | `fechaPartoReal` en el ciclo | Edita ciclo y automatización | Formulario de ciclo | Básico |
| Alta de ternero | Crea Animal con madre y fecha del parto, categoría/raza/objetivo | Endpoint separado con cuota | Modal Registrar ternero | Incompleto |
| Genealogía | Madre automática, padre manual interno/externo | Valida sexo parental/ciclos, sin herencia del semen | Campos de padre | Incompleto |
| Destete bovino | Estimación +7 meses; tarea puede registrar fecha real en ternero | Enlace por madre/fecha de nacimiento | Agenda y ficha de inventario | Básico |
| Ciclo porcino | Servicio +118 días, ventana ±3, recordatorios anteriores/posteriores | Cálculo en modelo | Resumen de fechas | Incompleto |
| Camada desde reproducción | Camada colectiva con población, madre y referencia al ciclo | Alta separada y actualización del ciclo | Formulario desde fila reproductiva | Incompleto |
| Plantilla IATF | Pasos por horas, dependencias, ventanas, productos y roles | Versión incremental y snapshot por campaña | Editor de protocolo | Básico |
| Campaña IATF | Lote y/o hembras, condición corporal y advertencias posparto | Crea participantes, tareas y ejecuciones en transacción | Alta y detalle | Básico |
| Ejecución parcial IATF | Fecha real, animales, productos consumidos y tarea | Transaccional, validación de conjunto insuficiente | Selección y continuación | Incompleto |
| Inseminación IATF | Confirmación separada tras paso ejecutado; consume semen y vincula ciclo | Transaccional | Registro colectivo; Tareas también | Básico |
| Diagnósticos IATF | ECOGRAFIA/PALPACION/PAG/OTRO; resultados por hembra | Guarda múltiples diagnósticos y actualiza resultado | Formulario colectivo | Incompleto |
| Resincronización | Crea nueva campaña a partir de VACIAS seleccionadas | API disponible; ciclo anterior no se cierra | No hay botón en IATF.js | Incompleto |
| Monta de repaso IATF | Tipo de paso admitido | Solo ejecución genérica; no crea servicio de repaso especializado | Tipo seleccionable | Incompleto |
| Insumos reproductivos | Semen, hormonas, dispositivos; stock, lote, vencimiento y costo | Catálogo en rutas IATF Pro | Inventario dentro de IATF | Básico |
| Dispositivo reutilizable | Mueve cantidades disponible/en uso y las devuelve al retirar | Conteo por insumo | Ejecución de paso | Básico |
| Métricas IATF | P/AI, diagnósticos por fecha, resultados por toro, costos por moneda | Fórmulas implementadas con defectos específicos | Tarjetas y tablas | Incompleto |
| Bandas porcinas | Participantes, snapshot y ejecuciones de pasos | Servicios de alta/ejecución/cierre | Editor, bandas y detalle | Incompleto |
| Parto/destete en banda | Una cerda por operación; crea Camada o registra destete | Escrituras independientes | Captura individual de cantidades | Incompleto |
| Traslado a maternidad | Tipo de paso y calendario | No cambia lote/ubicación física | Se registra como actividad | Básico |
| Intervalo destete-servicio | Diferencia entre último destete capturado y fecha de servicio | Consolidado de bandas con cobertura | No presentado en BandasPorcinas.js | Básico |
| Días No Productivos completos | No hay cálculo integral de DNP con períodos reproductivos | No implementado | No implementado | Incompleto |
| Reportes de reproducción | Productividad, vacas a revisar, reproducción porcina y consolidación | Endpoints reales indicados abajo | Reportes y panel IATF | Incompleto |
| Operación offline | No hay almacén/cola de ciclos, partos, inseminaciones o diagnósticos | APIs requieren red | Reproducción solo lectura; protocolos exigen conexión | Incompleto |

### Modelos y campos reales

- [RegistroReproductivo](backend/models/RegistroReproductivo.js#L135): animal, asignadoA, especie, tipoRegistro, tipoInseminacion, semenUtilizado/snapshot/cantidadPajuelas, vínculos IATF/banda, historialDiagnosticos, origenGestacion, confirmación/resultado/última fecha diagnóstica, fechas de servicio/parto/celo/destete, cantidades/destino de crías y estadoCiclo. No guarda toro de monta, abortos estructurados ni fecha de secado.
- [Animal](backend/models/Animal.js#L46): sexo/especie/fechaNacimiento, madre/padre y referencias externas, camadaOrigen, fechas y pesos de destete. No existe estado reproductivo canónico ni última monta/FPP como campos persistidos de Animal: se consultan los registros. `numeroPartos` y `condicionCorporal` se leen al crear bandas, pero no están declarados en este esquema.
- [CampanaIATF](backend/models/CampanaIATF.js), [EjecucionPasoIATF](backend/models/EjecucionPasoIATF.js), [DiagnosticoGestacionIATF](backend/models/DiagnosticoGestacionIATF.js) y [EventoCampanaIATF](backend/models/EventoCampanaIATF.js) separan participantes, ejecución, diagnóstico y auditoría de campaña.
- Las plantillas reales se llaman [PlantillaProtocoloIATF](backend/models/PlantillaProtocoloIATF.js) y [PlantillaProtocoloReproductivoPorcino](backend/models/PlantillaProtocoloReproductivoPorcino.js); la banda es [BandaReproductivaPorcina](backend/models/BandaReproductivaPorcina.js). No hay que buscar solo los nombres orientativos ProtocoloIATF/BandaPorcina.
- [InsumoReproductivo](backend/models/InsumoReproductivo.js) es inventario propio del módulo, con toro/código/raza como textos, no un padre Animal referenciado. [Camada](backend/models/Camada.js) representa población colectiva; su creación no genera un Animal por lechón.

### APIs mapeadas

| Grupo | Rutas y comportamiento |
| --- | --- |
| [Reproducción](backend/routes/reproduccionRoutes.js) | GET/POST `/api/reproduccion`; GET/PUT/DELETE `/:id`; GET `/animal/:animalId`; GET `/insumos/semen`; POST `/:id/ternero`; PATCH `/:id/cerrar-ciclo`, `/reabrir-ciclo`, `/cancelar-ciclo`, `/no-prenada` |
| [IATF](backend/routes/iatfRoutes.js) | Plantillas GET/POST/PUT, campañas GET/POST, detalle y actividad por tarea, ejecutar/reprogramar pasos, registrar inseminaciones/diagnósticos, retirar participante, finalizar/cancelar/resincronizar, insumos GET/POST/PUT y métricas/consolidado |
| [Bandas](backend/routes/protocoloPorcinoRoutes.js) | Plantillas GET/POST/PUT, bandas GET/POST/detalle, actividad por tarea, ejecutar/reprogramar, retirar, finalizar/cancelar y métricas/consolidado |
| [Camadas](backend/routes/camadaRoutes.js) | API separada utilizada al registrar parto porcino desde Reproducción |
| [Reportes](backend/routes/reporte.js) | `/api/reportes/productividad`, `/vacas-improductivas`, `/porcinos/reproduccion`, `/porcinos/camadas`, `/porcinos/economia-camadas`, `/multi-finca`; métricas IATF bajo su propio router |

**No existe `/api/reportes/reproduccion` en el router inspeccionado.** Los reportes están repartidos en las rutas anteriores. Los montajes de reproducción/IATF/bandas en [app.js](backend/app.js#L56) exigen auth.

## 3. Flujo Biológico Real (Monta → Gestación → Diagnóstico → Parto → Cría)

### Servicio individual y fechas

1. [createRegistro](backend/controllers/reproduccionController.js#L211) valida responsable y llama a validarHembra. Busca un ciclo activo; normalmente devuelve 409 si existe. Con cerrarCicloAnterior=true cierra el anterior.
2. Si tipoRegistro es exactamente Inseminación y existe fecha de servicio, consume el semen elegido con [consumirSemen](backend/services/semen-reproductivo-service.js#L23) y guarda snapshot. Si se usa Sin especificar/Monta no consume semen. No hay servicio estructurado de transferencia de embriones.
3. El [modelo](backend/models/RegistroReproductivo.js#L210) calcula fechas/estado. Después del guardado el controlador registra evento, sincroniza tareas y notifica. Esos efectos quedan fuera de la transacción de IA convencional.

| Fecha / estado | Bovino ordinario | Bovino IATF | Porcino |
| --- | --- | --- | --- |
| FPP | Monta +283, solamente si falta FPP | Sin FPP hasta positivo; duración de finca o 283 | Servicio +**118**, recalculado siempre |
| Revisión de celo posservicio | No se genera a +21 | Depende de pasos de plantilla | +21 días |
| Diagnóstico programado | No hay tarea automática específica 35–60 días | Horas/ventana del paso configurado | Paso de banda si existe |
| Ventana de parto | Sin ventana específica | La del protocolo si se define | FPP ±3 días |
| Preparación preparto | Tarea Revisar parto en FPP | Configurable | Desparasitar FPP−30; alimento lactancia FPP−15 |
| Destete estimado | Parto real +7 meses | Tras parto y flujo ordinario | Ciclo: parto real o estimado +diasDestetePorcino, default **28**; Camada usa **31** |
| Celo posparto / nuevo servicio | Parto +60, luego saltos +21 hasta hoy/futuro | Flujo posparto bovino al registrar parto | Destete +5; revisión posterior +21 |
| Secado | No implementado | No implementado | No aplica como capacidad implementada |

Fuentes: [config bovina](backend/config/reproduccionBovinaConfig.js), [config porcina](backend/config/reproduccionPorcinaConfig.js), [duración IATF](backend/services/duracionGestacion-service.js), [formulario](frontend/src/Components/FormularioReproduccion.js#L145). El valor 114 aparece en una rama genérica, pero la rama Porcino anterior retorna y ejecuta **118**. No se concluye que 118 sea clínicamente incorrecto: sí difiere de la expectativa escrita en Agents y requiere contrato explícito de configuración.

La monta ordinaria puede producir estado Gestante sin diagnóstico confirmado. IATF sí distingue «Inseminada pendiente diagnóstico». No hay un criterio único entre flujos.

### Diagnósticos, pérdida y disponibilidad

IATF guarda diagnósticos individuales con fecha, método, responsable y autor. Una VACIA elimina su FPP, pero no cierra el ciclo. La resincronización crea otra campaña; al inseminar en ella encuentra el ciclo activo anterior y devuelve 409 hasta que se cierre manualmente.

La acción ordinaria No preñada cambia estadoCiclo, cancela tareas y registra evento, pero no actualiza de forma equivalente resultadoDiagnosticoGestacion/gestacionConfirmada. El cálculo bovino puede mantener Gestante. Cancelar no representa automáticamente un aborto. No hay fecha/tipo/motivo de pérdida como entidad reproductiva específica ni un historial de correcciones uniforme.

Las bandas agregan historialDiagnosticos al registro; IATF conserva sus diagnósticos en su colección separada. El formulario ordinario no presenta una historia diagnóstica equivalente.

### Parto y alta de cría

Guardar fechaPartoReal no crea un ternero. El usuario usa [POST /:id/ternero](backend/controllers/reproduccionController.js#L265):

1. Lee ciclo y madre, exige fecha de parto e identificador de cría.
2. Construye Animal con especie/madre/fecha de nacimiento del ciclo, raza inicial y categoría. El padre proviene exclusivamente de lo enviado en el formulario.
3. Valida relaciones genealógicas, especie/cupo del plan y objetivo productivo permitido en finca.
4. [ejecutarConReservaCuota](backend/services/plan-service.js#L136) bloquea cuota por organización/recurso, recuenta uso y guarda Animal. El bloqueo tiene expiración y liberación en finally; la reserva no incluye tareas/eventos posteriores.
5. Sincroniza tareas y genera eventos de nacimiento en cría y parto en madre. No guarda en Animal una referencia directa al ciclo bovino; el servicio de tareas encuentra la primera cría por madre y día de nacimiento.

No existe herencia automática del toro del semen: en monta ni siquiera se persiste una referencia al toro. El módulo de evaluación de cruces es una consulta independiente, no una validación obligatoria del servicio.

En porcinos, Reproduccion.js abre FormularioCamada y llama `/api/camadas`. Se guarda población colectiva y se actualiza el ciclo. En bandas PARTO también crea una Camada, una cerda por operación, pero mediante otro código con diferencias de validación/automatización.

### Tareas, eventos e historial

[Tareas bovinas](backend/services/reproduccionBovina-service.js) genera parto, celo posparto y destete; un ciclo Cerrado con parto conserva seguimiento posparto. El destete vincula solo la primera cría encontrada por madre/día. Completar esa tarea puede guardar fechaDestete real en Animal; no crea un peso de destete.

[Tareas porcinas](backend/services/reproduccionPorcina-service.js) genera revisión de celo, desparasitación, alimento lactancia y revisión de parto. El seguimiento de lechones pertenece a Camada. Una tarea Revisar parto completada puede generar evento tipo Parto, pero no crea fechaPartoReal ni un Animal/Camada: es evidencia de tarea, no prueba estructurada de nacimiento.

Los eventos ordinarios se actualizan por animal+módulo+referencia+tipo. Esto evita ciertas duplicaciones, pero una nueva edición puede sustituir datos de un evento anterior del mismo tipo. En bandas varios diagnósticos del mismo ciclo/banda pueden compartir esa clave y reemplazar el evento visible, aunque historialDiagnosticos conserve resultados.

## 4. Evaluación de IATF y Protocolos Porcinos

### IATF

El protocolo es configurable: horas desde inicio u otro paso, ventanas, productos, dosis textuales, cantidad por animal, instrucciones, obligatoriedad y rol. Puede representar Día 0, Día 7/8 y Día 9/10; no hay un tratamiento farmacológico fijo incorporado. [calcularCronograma](backend/services/iatf-service.js#L99) detecta dependencias circulares al calcular la campaña.

La campaña captura versión/snapshot, participantes y advertencias de condición corporal/días posparto. Estos criterios son advertencias; no bloquean inclusión por edad, preñez existente ni pertenencia a otra campaña. La unicidad de ciclo se comprueba al inseminar.

Las fases de ejecución y confirmación de inseminación son separadas. La primera puede consumir productos no semen; la segunda consume pajuelas y crea/vincula RegistroReproductivo. El servidor impide descontar semen desde el paso genérico para evitar doble consumo. Un dispositivo reutilizable mueve cantidades entre disponible y en uso; no se modela identificación individual ni número de reutilizaciones por dispositivo.

Los diagnósticos se registran masivamente, con resultado por participante. Guardarlos no completa por sí mismo EjecucionPasoIATF/Tarea de diagnóstico. Completar el paso genérico DIAGNOSTICO_GESTACION tampoco escribe un diagnóstico clínico. Falta conciliar ambas confirmaciones.

P/AI principal = participantes con resultado actual PREÑADA / participantes con fecha de inseminación. Una inseminada retirada permanece en el denominador, comportamiento cubierto por pruebas. Las agrupaciones por fecha de diagnóstico, en cambio, cuentan documentos y pueden duplicar la misma hembra.

Hay API de resincronización y tipo de paso MONTA_REPASO. La primera carece de enlace automático al cierre del ciclo vacío y no tiene botón en IATF.js; la segunda no implementa registro especializado de toro/servicio ni atribución de preñez entre IATF y repaso.

### Bandas porcinas

La [banda](backend/services/protocoloPorcino-service.js#L94) exige hembras activas y rechaza pertenencia detectada a otra banda activa. Ese control usa consulta previa, no restricción atómica; incluso una participante retirada permanece en el conjunto consultado de una banda activa.

Las acciones con efectos específicos son servicio/IA, diagnóstico, destete, parto/camada, destete de camada y tratamiento reproductivo. OBSERVAR_CELO, PREPARTO, TRASLADO_MATERNIDAD, CONTROL y OTRA principalmente registran ejecución: TRASLADO_MATERNIDAD no traslada físicamente el animal.

SERVICIO/INSEMINACION reutiliza el registro vinculado o activo y sobrescribe fechas/datos sin limpiar necesariamente parto/diagnóstico anteriores. El hook porcino conserva fechaInseminacion si ya existe, por lo que una actualización parcial de fechaMonta también puede mantener la base anterior.

El cronograma admite eventos reales, pero mantiene una fechaReal por ejecución grupal. En pasos parciales realizados en días diferentes, la última fecha reemplaza la anterior como referencia del grupo. PARTO_ESTIMADO se ofrece como evento configurable, pero ejecutarPaso no lo agrega al mapa automático; puede requerir reprogramación manual vía API. Las tareas se asignan al responsable general de banda; rolResponsable/tareaGrupal no producen una asignación individual acorde por sí solos.

El consolidado calcula intervalo destete-servicio cuando existe fechaUltimoDestete y una fecha de servicio válida; expone cobertura de datos. No calcula DNP completos. fechaUltimoDestete puede provenir de un destete estimado de RegistroReproductivo, lo que limita interpretarlo como medición real.

## 5. Evaluación de Riesgos e Inconsistencias (P1 y P2)

### REP-01 — P1: DTOs ausentes permiten cambiar tenant y eludir validaciones

**Evidencia:** [createRegistro](backend/controllers/reproduccionController.js#L211), [crearNuevoCiclo](backend/services/reproduccion-service.js#L239), [updateRegistro](backend/controllers/reproduccionController.js#L448), [plugin](backend/models/plugins/organizacion-plugin.js#L108).

La creación expande datos del cliente; el plugin solo completa tenant si falta. PUT entrega req.body directamente a findByIdAndUpdate. La validación de animal/asignado inspecciona campos superiores, no operadores.

**R10:** con contexto A, el insertOne simulado recibió organización/finca B ejecutando hooks reales. **R22:** `$set` cambió animal a macho, tenant a otro y estado Cancelado→Activo, con respuesta 200. El filtro de lectura seguía limitado a A: filtrar la selección no protege el ámbito escrito.

La ruta de Camada usada por Reproducción también expande body. Las plantillas/insumos IATF sí tienen listas de campos; no se les atribuye el mismo defecto. Sin embargo, campos de responsable/técnico de ejecución/diagnóstico se aceptan sin la misma validación de membresía que el alta de campaña.

**Acción:** DTO por comando, prohibir operadores/rutas con punto, fijar tenant/autor del contexto y validar referencias sobre el documento resultante. No exponer estado, vínculos de campaña o snapshots como edición libre.

### REP-02 — P1: acceso por ID a plantillas de otra finca y continuidad tras traslado

**Evidencia:** [plantilla IATF](backend/models/PlantillaProtocoloIATF.js), [plantilla porcina](backend/models/PlantillaProtocoloReproductivoPorcino.js), [versionar/crear campaña](backend/services/iatf-service.js#L196), [crear banda](backend/services/protocoloPorcino-service.js#L94).

Ambas plantillas tienen fincaId, pero su plugin solo aplica organización. Los listados filtran alcance; los findById de uso/versionado no verifican acceso a la finca propietaria. **R21** confirmó con hooks reales que una plantilla FINCA ajena dentro de la organización puede recuperarse por ID. Es una falla entre fincas de la misma organización; no prueba lectura de otra organización.

En sentido inverso, [historial por animal](backend/controllers/reproduccionController.js#L434) mantiene filtro de finca actual. El [traslado](backend/services/consolidacionMultiFinca-service.js#L64) cambia Animal y pertenencias, pero no migra/reconcilia ciclos o participantes. El destino puede no ver el ciclo activo anterior y crear otro. Ejecutar después una campaña/banda tampoco vuelve a validar sistemáticamente inventario/especie/finca de cada participante.

**Acción:** resolver plantillas por alcance y fincas autorizadas; validar referencias auxiliares. Definir continuidad autorizada del ciclo tras traslado, sin abrir indiscriminadamente todos los datos de la organización.

### REP-03 — P1: mutaciones ordinarias sin vigencia de suscripción

**Evidencia:** [router reproducción](backend/routes/reproduccionRoutes.js), [auth](backend/middleware/auth.js#L105), [middleware plan](backend/middleware/plan.js).

Auth rechaza organización inactiva, pero solo calcula planVigente. El CRUD y cierres ordinarios no usan requirePlanVigente ni asegurarPlanVigente. **R12** obtuvo 201 en createRegistro con planVigente=false mediante controlador real y almacenamiento simulado.

IATF/bandas sí están detrás de requireFeature, que comprueba vigencia. El nacimiento sí pasa por permisos/cuota del plan. No afirmar que todas las rutas reproductivas omiten el control.

**Acción:** política explícita de lectura histórica/escritura suspendida y guard común para todas las mutaciones ordinarias, manteniendo los controles de cuota y especie.

### REP-04 — P1: elegibilidad biológica y de inventario insuficiente

**Evidencia:** [validarHembra](backend/controllers/reproduccionController.js#L116), [resolver animales IATF](backend/services/iatf-service.js#L160), [alta de banda](backend/services/protocoloPorcino-service.js#L94).

El flujo individual valida existencia y sexo, no estado Activo, edad, objetivo ni fechas respecto del nacimiento. **R8** admitió hembras Vendida/Muerta y nacida hoy; **R12** alcanzó el alta con Vendida. La UI individual filtra hembras, no todos esos criterios.

IATF/bandas comprueban actividad al ingreso, pero no tienen validación general de edad ni bloqueo/advertencia de preñez existente equivalente. Ejecutar pasos después no revalida todos los cambios de inventario ocurridos desde la inscripción.

**Acción:** política explícita de elegibilidad configurable y de registros históricos, con excepciones motivadas. Revalidar alcance en ejecución. No inventar un umbral clínico universal.

### REP-05 — P1: un solo ciclo activo y transiciones no están garantizados

**Evidencia:** [crearNuevoCiclo](backend/services/reproduccion-service.js#L239), [reabrir](backend/services/reproduccion-service.js#L167), [índices](backend/models/RegistroReproductivo.js#L342), [PUT](backend/controllers/reproduccionController.js#L448).

Buscar ciclo y luego insertar permite carrera. **R11:** dos lecturas iniciales vacías produjeron dos altas activas; no hay índice único parcial correspondiente. El modelo de registro no usa optimisticConcurrency.

PUT puede cambiar estadoCiclo sin pasar por reabrir/cerrar; si omite animal no comprueba otro activo. R22 reprodujo reactivación de Cancelado. cambiarEstadoCiclo también admite transiciones sin exigir coherencia con parto previo. En bandas, el control de ocupación es otra consulta previa.

**Acción:** comandos de transición, control de versión y unicidad apropiada por animal/tenant para el ciclo activo. Definir la independencia entre ciclo gestacional y seguimiento posparto para no bloquear servicios legítimos.

### REP-06 — P1: escrituras parciales y reintentos inconsistentes

**Evidencia:** [create/parto](backend/controllers/reproduccionController.js#L211), [cierre/reapertura](backend/services/reproduccion-service.js#L120), [ejecución porcina](backend/services/protocoloPorcino-service.js#L246).

**R13:** falla de bitácora devuelve 400 después de insertar el ciclo. Cerrar el anterior desde un alta de IA no propaga session a cambiarEstadoCiclo: el cierre puede sobrevivir a un fallo posterior de la nueva operación. La reapertura reactiva tareas antes de guardar el ciclo.

El ternero se guarda dentro de la reserva de cupo y los eventos/tareas ocurren después. Si fallan, el animal queda creado pese al error. La unicidad del identificador evita repetir ese mismo ID, pero no devuelve idempotentemente el resultado original.

**R19:** la IA de dos cerdas falla al guardar la segunda; la primera queda registrada y la compensación devuelve las seis pajuelas consumidas para ambas. **R20:** PARTO persiste fechaPartoReal antes de validar cantidades de camada; una suma inválida deja el ciclo modificado. La concurrencia optimista de Banda detecta conflicto al final, cuando los efectos externos ya pudieron ocurrir.

Crear Camada desde banda no llama toda la sincronización de tareas de Camada/cancelación de estimaciones que sí ejecuta su controlador ordinario. Un tratamiento sanitario de banda tiene su propia transacción, pero no comparte una unidad atómica con guardar la ejecución de banda.

**Acción:** transacciones por acto completo, idempotencia y notificaciones tras commit; validar antes de escribir. Unificar servicios de nacimiento/destete entre UI ordinaria y banda.

### REP-07 — P1: diagnóstico, cierre y resincronización discrepan

**Evidencia:** [modelo](backend/models/RegistroReproductivo.js#L210), [marcar No preñada](backend/services/reproduccion-service.js#L232), [diagnósticos IATF](backend/services/iatf-service.js#L599), [resincronización](backend/services/iatf-service.js#L773).

**R1:** bovino con resultado VACIA y estadoCiclo No preñada sigue calculando Gestante con FPP. El cierre ordinario no actualiza todos los campos clínicos. **R14/R15:** VACIA IATF queda Activo y bloquea inseminación de otra campaña.

Tras un positivo, DUDOSA/REQUIERE_RECONFIRMACION no limpian necesariamente gestacionConfirmada/FPP en IATF. Un diagnóstico retroactivo recibido después puede sustituir resultadoActual sin respetar orden cronológico. Registrar diagnóstico en campaña FINALIZADA está permitido y la devuelve a DIAGNOSTICO. No hay pérdida gestacional estructurada.

**Acción:** separar resultado clínico, confirmación y estado operativo; definir transiciones de pérdida, reconfirmación y nuevo servicio. Cerrar/sustituir explícitamente el ciclo vacío al resincronizar y conservar todos los diagnósticos.

### REP-08 — P1: ejecución IATF puede declarar cobertura falsa

**Evidencia:** [ejecutarPaso](backend/services/iatf-service.js#L406).

**R16:** enviar dos veces el ID de una hembra completó un paso para una campaña de dos animales. El cálculo usa longitud de animalesAplicados y no deduplica la entrada. También aceptó productos=[] pese a un producto planificado; no existe conciliación obligatoria entre consumo previsto y ejecutado.

**R17:** una participante RETIRADA pudo ejecutarse en paso IATF y pasó a PROTOCOLO_COMPLETADO. La validación usa todos los IDs de campaña, no solo elegibles. Un cliente también puede enviar estado=REALIZADO para pasos genéricos sin acreditar cobertura completa.

Dependencias y ventanas ordenan el calendario, pero no obligan a ejecutar antecedentes ni a justificar omisión/desviación. Una tarea de diagnóstico completada por el paso genérico no acredita resultado diagnóstico.

**Acción:** conjuntos únicos de participantes elegibles, estado calculado por servidor y validación de secuencia/cobertura. Diferenciar omisión autorizada, registro de actividad y diagnóstico efectivo.

### REP-09 — P1: trabajador puede retirar participantes sin tarea asignada

**Evidencia:** [ruta IATF](backend/routes/iatfRoutes.js), [retirarParticipante IATF](backend/services/iatf-service.js#L758), [ruta porcina](backend/routes/protocoloPorcinoRoutes.js), [retiro en banda](backend/services/protocoloPorcino-service.js#L317).

Las rutas de retiro usan permisos de ejecución que incluyen Trabajador. Los servicios reciben usuarioId pero no comprueban que tenga una tarea asignada o autorización de gestión de participantes. **R18** verificó permiso de Trabajador y retirada sin consulta de asignación en IATF.

Las ejecuciones normales sí comprueban asignación para el trabajador y el diagnóstico porcino exige Administrador/Veterinario. El defecto es específico del retiro; tampoco se valida estado final de la campaña/banda antes de retirar.

**Acción:** permiso específico para gestionar participantes o autorización por asignación y alcance, con motivo obligatorio y transición válida.

### REP-10 — P1: nacimiento y vínculo Camada–ciclo no tienen integridad suficiente

**Evidencia:** [createCamada](backend/controllers/camadaController.js#L239), [Camada](backend/models/Camada.js), [PARTO/DESTETE_CAMADA](backend/services/protocoloPorcino-service.js#L162), [alta de ternero](backend/controllers/reproduccionController.js#L265).

La API ordinaria de Camada valida a la madre por especie/sexo, pero consulta el registro solo para asignadoA: no exige que exista, corresponda a esa misma madre ni sea ciclo porcino. Después puede actualizar el parto de otro ciclo de la finca. No hay unicidad por registroReproductivo; la comprobación de duplicado de bandas no cubre altas ordinarias ni una carrera.

Bandas valida suma vivos+muertos+momias, pero la vía ordinaria no aplica esa misma suma. DESTETE_CAMADA guarda destetados sin comparar con población viva; el esquema solo exige entero no negativo. El formulario de camada propone incluso FPP como fechaNacimiento si aún no hay parto real, y el servidor no rechaza nacimiento futuro.

El ternero exige fechaPartoReal, pero no valida ciclo cancelado, parto futuro ni coherencia temporal de madre/padre. No existe un acto de parto con lista de crías y cardinalidad/rectificaciones; registrar varios IDs puede añadir crías al mismo parto sin reconciliación. Deben contemplarse partos múltiples legítimos, no imponer una cría como regla universal.

**Acción:** entidad/servicio de parto con vínculo madre–ciclo–crías, validación de fechas, cantidades y estado, idempotencia y restricción de camada por ciclo según el contrato del producto.

### REP-11 — P1: borrado destructivo y trazabilidad que se sobrescribe

**Evidencia:** [deleteRegistro](backend/controllers/reproduccionController.js#L545), [eventoAnimal-service](backend/services/eventoAnimal-service.js#L3), [eventos de banda](backend/services/protocoloPorcino-service.js#L237).

DELETE borra ciclo, elimina todos sus eventos Reproduccion y cancela tareas, sin comprobar Animal/Camada/campaña/banda. La cría conserva madre, pero desaparece su evento de nacimiento referido al ciclo. Camada y participantes pueden conservar referencias colgantes. No se debe describirlo como pérdida de la madre: se pierde el origen reproductivo y evidencia asociada.

Cambiar animal o fecha de parto en PUT no reconcilia terneros ya creados ni eventos del receptor anterior. El upsert por tipo de evento puede reemplazar sucesivos diagnósticos de una banda. No existe revisión inmutable uniforme.

**Acción:** archivar/anular con motivo o 409 ante dependencias; nunca borrar evidencia del nacimiento para eliminar un ciclo. Registrar correcciones como revisiones y reconciliar vínculos de crías.

### REP-12 — P2: fechas y cantidades incoherentes entre flujos

**Evidencia:** [modelo](backend/models/RegistroReproductivo.js#L210), [formulario](frontend/src/Components/FormularioReproduccion.js#L145), [Camada](backend/services/camada-service.js#L197), [IATF UI](frontend/src/Components/IATF.js#L144).

- **R2:** cambiar fechaMonta conserva una FPP existente. La IA convencional tampoco usa la duración configurable de finca que sí usa IATF.
- **R3:** ciclo porcino usa 118 días y destete default 28; pantalla/resumen y Camada usan 31. Guardar un destete real en fechaDestete se sobrescribe por el cálculo automático. diasCeloPostDestetePorcino se ofrece, pero la rama principal usa la constante +5.
- **R4:** el esquema permite servicio futuro, parto anterior al servicio y 1.5 crías. No diferencia registro retrospectivo autorizado de fechas imposibles.
- En el formulario bovino normalizado se conserva fechaInseminacion anterior aunque se edite fechaMonta. Si ya había consumo, el PUT no vuelve a normalizar ambas fechas; si se incorpora consumo por primera vez, prepararInseminacionConvencional prioriza fechaInseminacion. Fecha de servicio y base calculada pueden divergir.
- IATF envía valores datetime-local sin offset y el backend usa `new Date(cadena)`. Si servidor y usuario tienen distinta zona, el instante cambia; no se verificó la zona de producción. Bandas muestra fechas UTC con formato local sin fijar zona, pudiendo presentar el día anterior. Reproducción ordinaria sí fija UTC en su tabla.

**Acción:** distinguir estimado/real, recalcular dependencias bajo reglas explícitas, cantidades enteras y cronología validada; fechas civiles para días e instantes con offset para IATF. Unificar configuración frontend/backend.

### REP-13 — P2: genealogía paterna manual y validación incompleta

**Evidencia:** [registro de ternero](backend/controllers/reproduccionController.js#L294), [validarRelacionGenealogica](backend/services/genealogiaService.js#L58).

Madre sí se asigna automáticamente; padre no se deriva de semenSnapshot ni de un toro del servicio. Si padreDiio no se encuentra en la finca, puede convertirse en referencia externa sin advertir que existe en otra finca. Un padre por ID inexistente puede terminar omitido al construir datos.

**R9:** el validador aceptó padre Porcino y madre Bovina; valida sexo y ciclos genealógicos, no especie ni edad parental relativa al nacimiento. No se exige padre Activo, lo cual puede ser correcto para semen o ascendencia histórica: la remediación debe distinguir padre genético de animal disponible para monta.

**Acción:** guardar identidad/snapshot del padre en el servicio, heredar explícitamente al nacimiento y validar especie/cronología. Mantener opción externa y paternidad desconocida sin inventar genealogía.

### REP-14 — P2: agenda y calendario no equivalen a hechos reproductivos

**Evidencia:** [cronograma porcino](backend/services/protocoloScheduler-service.js#L46), [tareas bovinas](backend/services/reproduccionBovina-service.js), [tareas porcinas](backend/services/reproduccionPorcina-service.js), [efectos de tareas](backend/controllers/tareaController.js#L29).

**R6:** dos pasos porcinos que se referencian circularmente pasan validación y generan fechas usando inicio como fallback. Una referencia a un paso posterior también puede caer silenciosamente en inicio. IATF sí detecta ciclos al calcular cronograma.

No se genera automáticamente el evento PARTO_ESTIMADO para dependencias de banda; las fechas parciales se condensan a una sola fecha por grupo. Las tareas de banda ignoran asignación por rol de cada paso. Al cerrar banda se cancelan ejecuciones PENDIENTE, pero pueden quedar PARCIAL mientras sus tareas se cancelan.

El GET del listado ordinario refresca y puede guardar registros/sincronizar tareas, incluso desde lectura. La estimación bovina de celo vencida avanza automáticamente de 21 en 21: no constituye observación real de celo. Completar Revisar parto no registra un nacimiento.

El seguimiento del ternero busca solo el primero de madre/día y solo rellena fechaDesteteEstimada si falta; corregir el parto/destete del ciclo no reconcilia siempre la cría. No se certifica seguimiento completo de gemelos.

**Acción:** cronograma con dependencias válidas, referencias por participante cuando proceda, separación entre revisión y acto observado, y reconciliación de tareas/fechas sin efectos sorpresa de GET.

### REP-15 — P2: consumo y trazabilidad de insumos incompletos

**Evidencia:** [actualizar ciclo](backend/controllers/reproduccionController.js#L476), [consumirInsumos IATF](backend/services/iatf-service.js#L362), [guardar insumo](backend/services/iatf-service.js#L812).

La protección de semen en PUT solo rechaza un ID nuevo no vacío diferente. Se pueden editar cantidades/snapshot o borrar el vínculo con null/operadores sin reconciliar consumo. La baja del ciclo tampoco deja una corrección explícita del movimiento consumido; cancelar un servicio real no debería devolver automáticamente semen usado.

El consumo genérico de hormonas/dispositivos comprueba activo/stock, pero no vencimiento; semen sí lo comprueba. El inventario admite ajustes directos de cantidades sin libro de movimientos por corrección. No hay campo especie en InsumoReproductivo para impedir elegir un lote de semen incompatible.

IATF registra consumo/productos por paso, pero no llama a AplicacionSanitaria ni a retiro de carne. El árbol actual **sí tiene** retiro de carne en Sanidad por cambios previos; no debe asumirse que todos los productos aplicados por IATF alimenten ese control. Bandas TRATAMIENTO_REPRODUCTIVO sí llama al servicio sanitario, aunque su formulario no captura días de retiro.

**Acción:** movimientos de consumo/corrección con identidad, snapshots inmutables, compatibilidad/vencimiento y contrato explícito con Sanidad. No derivar retiros o dosis del nombre del producto.

### REP-16 — P2: métricas y reportes pueden dar resultados engañosos

**Evidencia:** [métricas IATF](backend/services/iatf-service.js#L659), [gestación en reporte](backend/controllers/reporte-controller.js#L944), [reporte porcino](backend/controllers/reporte-controller.js#L1891).

**R5:** con tres pajuelas a 10, costoSemen cuenta 10; suma costo unitario por participante sin multiplicar cantidad. Dos diagnósticos positivos de la misma hembra/día dan P/AI por fecha de 200%. El P/AI principal por participante no presenta ese duplicado.

La separación CRC/USD sí existe; costoTotal es null si mezcla monedas. Los subtotales costoProductos/costoSemen siguen siendo sumas numéricas sin unidad única cuando hay varias monedas. No se encontró creación de MovimientoFinanciero desde estos servicios: son costos operativos internos.

**R7:** vacas a revisar considera gestación activa un ciclo Cancelado/VACIA con FPP futura. obtenerVacasGestantes también se apoya en FPP/sin parto, sin exigir confirmación ni estadoCiclo. Edad y estado actual se mezclan con períodos históricos.

La tasaPartoPorCiclo porcina divide camadas nacidas en el período entre servicios del período; no son necesariamente la misma cohorte. Bandas excluye retiradas en su denominador mientras IATF mantiene inseminadas retiradas; requiere etiquetas claras. Cumplimiento de protocolo cuenta PARCIAL como realizada.

**Acción:** cantidades reales y monedas separadas, último diagnóstico por hembra/corte, denominadores/cohortes definidos, estado clínico coherente y separación de cobertura parcial/completa.

### REP-17 — P2: formularios y permisos impiden completar flujos autorizados

**Evidencia:** [carga IATF](frontend/src/Components/IATF.js#L270), [usuarios asignables](backend/controllers/usuario-controller.js#L113), [BandasPorcinas](frontend/src/Components/BandasPorcinas.js#L30), [Tareas](frontend/src/pages/Tareas.js#L516).

- IATF carga responsables siempre; el endpoint exige iatfCrear. Encargado/Consulta pueden ver reproducción, pero ese 403 rechaza todo Promise.all y evita aplicar los demás datos.
- Con Premium, IATF carga consolidado por feature sin comprobar reportes.ver. Veterinario/Encargado carecen de ese permiso: otro 403 puede bloquear toda la carga.
- Bandas carga asignables para cualquier gestor ordinario, aunque Encargado no puede crear bandas; muestra botones de configurar/crear/diagnosticar sin distinguir esos permisos.
- Tareas ofrece ejecución INSEMINACION porcina, pero no obtiene/envía semen ni cantidadPajuelas. El servidor exige semen y rechaza la operación. La pantalla Bandas sí los envía; Trabajador no tiene acceso al módulo completo para usar esa alternativa.
- Los botones Eliminar ciclo aparecen a gestores, aunque solo Administrador tiene DELETE. Es un fallo de interfaz, no una autorización efectiva de borrado.
- Semen disponible se consulta para hoy, no para la fecha histórica elegida; un lote ya agotado tampoco aparece al editar. El inventario que permite crear existencias está bajo IATF Pro, aunque IA convencional está en el flujo básico.
- IATF.js edita solo el primer producto de cada paso; al guardar reconstruye productos con uno o ninguno, pudiendo perder los demás configurados vía API. No ofrece resincronización ni cantidad de pajuelas por participante en el modal principal, aunque el backend lo soporta.

**Acción:** permisos por acción, cargas opcionales independientes, formularios de ejecución completos y catálogo de semen accesible conforme al contrato comercial del servicio básico.

### REP-18 — P2: sin captura reproductiva offline ni reintento clínico seguro

**Evidencia:** [offlineStorage](frontend/src/services/offlineStorage.js#L4), [offlineSync](frontend/src/services/offlineSync.js#L25), [ListaUsuario](frontend/src/Components/ListaUsuario.js#L467), [Tareas](frontend/src/pages/Tareas.js#L441).

No hay stores/cola para servicios, diagnósticos, partos, crías o pasos de protocolo. Solo se sincronizan tareas generales y notas. Reproducción queda en solo lectura sin conexión y Tareas bloquea protocolos sin red.

No existe nacimiento rápido offline para trabajador. Completar una tarea general en cola no sustituye registrar parto/Animal/Camada. Las operaciones reproductivas ordinarias no tienen una clave idempotente de negocio para resolver respuestas perdidas.

**Acción:** resolver integridad/idempotencia antes de implementar cola clínica; conservar actor, instante real, finca, referencias y versión, con conciliación explícita al reconectar.

## 6. Cumplimiento de Exclusividad por Plan y Matriz de Roles

### Planes reales

[planes.js](backend/config/planes.js#L28) declara defaults **Esencial 6 / Gestión 12 / Pro 20 / Premium 35 USD mensuales**, configurables por entorno. No coinciden con 10/20/35/60 de las instrucciones. No se leyeron secretos ni se verificó precio efectivo en producción.

| Capacidad | Esencial | Gestión | Pro | Premium |
| --- | --- | --- | --- | --- |
| Ciclo individual, monta, IA convencional y parto | Sí por rol | Sí | Sí | Sí |
| Alta de cría/población de camada | Sujeta a especie y cuota | Cuota | Cuota | Cuota |
| Alertas/tareas básicas | Sí | Sí | Sí | Sí |
| Productividad/natalidad, vacas a revisar y reproducción porcina analítica | No | Sí | Sí | Sí |
| Reportes económicos de cría/camadas | No | No | Sí | Sí |
| IATF: `iatfReproductivo` | No | No | Sí | Sí |
| Bandas: `protocolosReproductivosPorcinos` | No | No | Sí | Sí |
| Gestión de insumos reproductivos por router IATF | No | No | Sí | Sí |
| Consolidado IATF/bandas y comparativas reproductivas entre fincas | No | No | No | Sí |
| Plantillas porcinas compartidas ORGANIZACION | No | No | No | Sí |
| Plantillas IATF ORGANIZACION | No | No | Sí, sin guard Premium específico | Sí |
| Registro reproductivo offline | No implementado | No implementado | No implementado | No implementado |

Las barreras Pro de los routers son reales. El CRUD genérico, sin embargo, acepta tipoInseminacion/campanaIATF/bandaReproductivaPorcina enviados por cliente sin exigir sus features: permite fabricar vínculos/etiquetas avanzados, no ejecutar por esa vía todo el motor IATF. Debe impedirse esa edición como parte de REP-01.

El control de animales de Esencial permite una especie con límites configurados; los planes superiores admiten ambas. Crear crías respeta cuota, incluido conteo de población colectiva porcina. El problema de vigencia ordinaria es REP-03.

La consolidación Premium presenta partos/destetes por finca y P/AI/costos por moneda de campañas, además del intervalo destete-servicio de bandas. Son indicadores existentes; no equivalen a un análisis completo de DNP, atribución causal de fertilidad o genealogía automática.

### Roles

Fuente: [permisosRoles.js](backend/config/permisosRoles.js#L62), servicios de ejecución y [usuarioAsignable-service](backend/services/usuarioAsignable-service.js#L4).

| Acción | Administrador | Encargado | Veterinario | Trabajador | Consulta | Contador |
| --- | --- | --- | --- | --- | --- | --- |
| Ver reproducción ordinaria | Sí | Sí | Sí | No | Sí | No |
| Crear/editar ciclo, marcar No preñada, parto/ternero | Sí | Sí | Sí | No | No | No |
| Eliminar ciclo | Sí | No | No | No | No | No |
| Configurar/crear IATF | Sí | No | Sí | No | No | No |
| Ejecutar IATF | Sí | Sí | Sí | Solo asignada, salvo retiro descrito | No | No |
| Diagnóstico clínico IATF | Sí | No | Sí | No | No | No |
| Configurar/crear banda | Sí | No | Sí | No | No | No |
| Ejecutar banda | Sí | Sí | Sí | Solo asignada, salvo retiro descrito | No | No |
| Diagnóstico de banda | Sí | No | Sí | No | No | No |
| Parto de cerda desde paso asignado de banda | Sí | Sí | Sí | Sí, con Pro/Premium y asignación | No | No |
| Reportes dedicados/consolidados | Sí | No | No | No | Sí | Sí |

El trabajador no dispone de alta ordinaria rápida de ternero. Puede registrar ciertos actos de banda desde Tareas, incluida una camada asignada, con las limitaciones de formulario descritas. No puede configurar una prescripción/protocolo ni diagnosticar por las rutas dedicadas. El PUT ordinario y la gestión de ciclo básico no distinguen diagnóstico veterinario como acción exclusiva: Administrador/Encargado también pueden cambiar campos diagnósticos.

El valor de Esencial es seguimiento individual y registro de nacimiento. Gestión añade indicadores, Pro coordinación y consumos, Premium consolidación. Integridad, autorización y trazabilidad deben ser comunes; requieren corrección antes de ampliar el alcance offline o prometer genealogía/diagnósticos automatizados.

## 7. Plan de Acción Priorizado

| ID | Prioridad | Tarea concreta | Criterio de aceptación |
| --- | --- | --- | --- |
| REP-01 | P1 | DTOs por comando y referencias internas protegidas | Rechazar tenant, `$set` y cambios de vínculos/snapshots; misma validación para POST/PUT |
| REP-02 | P1 | Alcance de plantillas y continuidad autorizada entre fincas | No usar/versionar plantilla FINCA sin acceso; traslado conserva acceso permitido al ciclo vigente |
| REP-03 | P1 | Vigencia común para mutaciones básicas | Suscripción suspendida no puede crear/editar/cerrar por API directa; lectura histórica definida |
| REP-04 | P1 | Elegibilidad y cronología por especie | Muerto/Vendido y receptores inválidos rechazados o tratados como excepción histórica explícita |
| REP-05 | P1 | Unicidad de ciclo activo y máquina de estados | Altas/reaperturas concurrentes no dejan dos activos; PUT no elude cierre clínico |
| REP-06 | P1 | Transacción e idempotencia por acto reproductivo | Fallo en segunda cerda no deja IA ni stock discordantes; respuesta perdida recupera el mismo resultado |
| REP-07 | P1 | Conciliar diagnóstico, pérdida y nuevo servicio | VACIA no sigue Gestante; re-IATF completa sin intervención oculta; correcciones conservan historia |
| REP-08 | P1 | Conjuntos y estados de ejecución calculados por servidor | IDs duplicados/retiradas rechazados; no completar cobertura parcial mediante payload |
| REP-09 | P1 | Autorizar retiro de participantes | Trabajador sin asignación/permiso no puede retirar; motivo y estado válidos |
| REP-10 | P1 | Servicio unificado de parto/camada | Madre/ciclo/especie concordantes, cantidades/fechas válidas y no duplicación por reintento |
| REP-11 | P1 | Archivo/anulación y revisiones | Borrar ciclo con crías no elimina nacimiento ni deja referencia colgante |
| REP-12 | P2 | Fechas estimadas/reales y zona horaria coherentes | Corregir servicio actualiza FPP según regla; destete real no se sobrescribe; horas IATF no dependen del servidor |
| REP-13 | P2 | Paternidad trazable | Cría hereda padre explícito del servicio o conserva desconocido; rechaza especie incompatible |
| REP-14 | P2 | Calendario, tareas y referencias por participante | Dependencias circulares rechazadas; fecha real de una cerda no sustituye todas las demás |
| REP-15 | P2 | Consumos/correcciones e integración sanitaria | Cambiar cantidad no altera silenciosamente stock histórico; insumo vencido/incorrecto se rechaza |
| REP-16 | P2 | Fórmulas y cohortes de indicadores | Tres pajuelas cuestan tres unidades; P/AI no duplica diagnósticos; VACIA no cuenta como gestación |
| REP-17 | P2 | Permisos y formularios completos | Encargado/Veterinario cargan vistas autorizadas; trabajador registra IA porcina asignada con semen |
| REP-18 | P2 | Captura offline con conciliación | Servicio/parto registrado sin red sincroniza una vez o muestra conflicto recuperable |

Antes de migrar datos, inventariar: ciclos activos duplicados, cambios de tenant/receptor, ciclos No preñada con FPP/confirmación, VACIAS IATF aún activas, crías sin origen resoluble, camadas de otra madre, cantidades incongruentes, pajuelas/consumos discordantes, fechas reales sobrescritas y participantes trasladadas. Conservar originales y motivos de corrección. No se ejecutó ninguna migración durante esta auditoría.

### Comprobaciones aisladas ejecutadas

Se usaron scripts efímeros `node -`, sin añadir pruebas permanentes ni cambiar aplicación. Funciones privadas se expusieron solo en memoria mediante Module._compile. Consultas/escrituras, notificaciones y sesiones se sustituyeron por dobles cuando correspondía.

| Prueba | Función / alcance | Resultado observado |
| --- | --- | --- |
| R1 | completarFechasYEstado | Bovino VACIA y ciclo No preñada conserva Gestante/FPP |
| R2 | completarFechasYEstado | Monta cambiada de enero a febrero mantiene FPP anterior |
| R3 | Modelo porcino y cálculo real | Gestación 118; default destete 28; destete real enviado sustituido por estimado |
| R4 | Validación real RegistroReproductivo | Acepta servicio año 2999, parto año 2000 y 1.5 crías |
| R5 | calcularMetricasCampana | Tres pajuelas a 10 cuentan 10; dos positivos misma hembra/día dan 200% por fecha |
| R6 | prepararPasos + calcularCronograma porcino | Dependencia circular aceptada; genera fechas usando fallback |
| R7 | tieneGestacionActiva real | Cancelado/VACIA con FPP futura devuelve true |
| R8 | validarHembra real, Animal simulado | Admite Vendido/Muerto y nacimiento de hoy |
| R9 | validarRelacionGenealogica real | Acepta padre Porcino y madre Bovina |
| R10 | crearNuevoCiclo con save/hooks reales | Tenant del payload ajeno llega a insertOne simulado |
| R11 | Dos altas solapadas, save/hooks reales | Dos registros Activos para el mismo animal; no índice único activo |
| R12 | createRegistro real, guardado simulado | Responde 201 con planVigente=false y hembra Vendida |
| R13 | createRegistro real con fallo de evento | Devuelve 400 después de insertar ciclo |
| R14 | registrarDiagnosticos IATF, sesión simulada | VACIA conserva estadoCiclo Activo y activoParaAlertas |
| R15 | registrarIATF, sesión simulada | Nueva campaña devuelve 409 por ciclo vacío anterior aún activo |
| R16 | ejecutarPaso IATF, sesión simulada | ID repetido completa paso de dos participantes, sin consumo pese a producto planificado |
| R17 | ejecutarPaso IATF, sesión simulada | RETIRADA pasa a PROTOCOLO_COMPLETADO |
| R18 | Permiso Trabajador + retirarParticipante real | Retira participante sin comprobar tarea asignada |
| R19 | ejecutarPaso de banda, escrituras simuladas | Falla segunda cerda, conserva IA de primera y devuelve todas las pajuelas |
| R20 | registrarAccionParticipante real | Camada con suma inválida falla después de guardar fechaPartoReal |
| R21 | findById y hooks reales de ambas plantillas | Filtran organización, no finca; recuperan plantilla FINCA ajena |
| R22 | updateRegistro + hooks reales | `$set` cambia tenant/receptor macho y reactiva Cancelado, respuesta 200 |

Las pruebas existentes relevantes incluyen [iatf-service.test.js](backend/tests/iatf-service.test.js), [protocolos-productivos.test.js](backend/tests/protocolos-productivos.test.js), [reproduccion-bovina.test.js](backend/tests/reproduccion-bovina.test.js) y [reproduccion-reapertura.test.js](backend/tests/reproduccion-reapertura.test.js). Cubren fórmulas, fechas, permisos y estructuras concretas; hacen falta pruebas integradas de autorización, transacciones, concurrencia y formularios para cerrar los hallazgos.

**Entrega: auditoría completada; remediaciones pendientes. En esta fase solo se añadió este informe y se conservaron los cambios locales previos.**
