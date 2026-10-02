# Lotes y planes básicos de alimentación

## Alcance

Este documento cubre los lotes operativos y la alimentación por lotes para bovinos y porcinos. Un lote agrupa animales para manejo; no reemplaza una rotación de potrero, una camada ni el objetivo productivo del animal.

La arquitectura distingue plan, ración y suministro: el plan define la estrategia, la ración indica lo previsto y el suministro registra lo entregado realmente. En esta fase no se administra inventario de alimentos, nutrición avanzada, costos ni tareas automáticas rutinarias.

## Alimentación operativa

### Alimento

`Alimento` es el catálogo reutilizable de forrajes, concentrados, granos, subproductos, minerales y suplementos. Puede tener presentaciones activas con una conversión conocida a kg, por ejemplo `Saco de 40 kg`. Desactivar un alimento conserva los registros históricos y evita usarlo en nuevos suministros.

### Racion

`Racion` pertenece a una especie, propósito y etapa. Sus componentes indican alimento, cantidad, unidad y base (`por animal/día`, `por lote/día`, `libre acceso` u otra). Es una referencia de lo planificado; no prueba que el alimento se haya entregado.

### AsignacionRacionLote

Conserva el historial de raciones de cada lote. Solo puede existir una asignación activa por lote. Cambiar la ración cierra la anterior y crea una nueva, sin sobrescribir el historial.

### SuministroAlimentacion

Es la evidencia de una entrega real. Guarda:

- lote, fecha, responsable y observaciones;
- alimentos y cantidades reales;
- unidad y método de medición (`PESADA`, `POR_PRESENTACION`, `ESTIMADA`);
- conversión a kg usada en ese momento;
- fotografías históricas del plan, la ración, la etapa y la cantidad de animales;
- sobrantes opcionales y consumo estimado solo cuando todos los componentes tienen sobrante;
- origen opcional desde `CorteForraje`, sin descontar existencias;
- correcciones con usuario, fecha, motivo y valor anterior.

Se permiten varios suministros para el mismo lote y día. El valor por cabeza usa la cantidad de animales que tenía el lote al registrar la entrega, no su composición actual.

El Dashboard presenta únicamente un resumen factual del día (suministros, lotes y último registro). No lo interpreta como pendientes ni crea tareas recurrentes.

### Conversión de unidades

`KG` y `TONELADA` se convierten directamente. `SACO`, `PACA`, `BALDE`, `CARRETA` y `OTRA` exigen una presentación o factor válido en kg. El sistema no adivina factores faltantes. Una presentación marcada como estimada hace que el detalle conserve esa condición.

## Modelos

### Lote

- Código único por organización y finca.
- Especie: `Bovino` o `Porcino`.
- Propósito: `ENGORDE`, `REPRODUCCION`, `REEMPLAZO`, `DESTETE`, `CUARENTENA`, `VENTA` u `OTRO`.
- Etapa operativa opcional e independiente del propósito: `INGRESO`, `ADAPTACION`, `DESARROLLO`, `ENGORDE`, `FINALIZACION`, `LISTO_VENTA`, `MANTENIMIENTO` u `OTRA`.
- Estado: `ACTIVO`, `CERRADO` o `CANCELADO`.
- Metas opcionales de peso y GMD.
- Ubicación actual opcional en un potrero.

### PertenenciaLote

Es la fuente histórica de pertenencia. Guarda entrada, salida y motivos. Un índice parcial único impide que un animal tenga dos pertenencias activas. `Animal.loteActual` es solo una referencia de lectura rápida.

### PlanAlimentacion

Define nombre, especie, propósito, etapa, vigencia, estado y observaciones. Las etapas disponibles son `INICIO`, `DESARROLLO`, `ENGORDE`, `FINALIZACION`, `MANTENIMIENTO`, `REPRODUCCION` y `OTRA`.

### AsignacionPlanAlimentacion

Guarda el historial entre plan y lote. Solo puede existir una asignación activa por lote. Un plan puede estar vigente en varios lotes.

### HistorialEtapaLote y EventoLote

`HistorialEtapaLote` conserva cada intervalo de etapa; un cambio cierra el intervalo anterior y abre uno nuevo. `EventoLote` reúne la cronología operativa del grupo sin reemplazar `EventoAnimal`: creación, ingreso o salida de miembros, pesajes, sanidad, cambio de potrero, tareas, planes y cierre.

## Reglas operativas

- Solo animales activos pueden ingresar a un lote.
- La especie debe coincidir.
- `ENGORDE`, `REPRODUCCION` y `REEMPLAZO` exigen el objetivo productivo equivalente.
- Un movimiento cierra la pertenencia anterior y crea otra; no sobrescribe historia.
- Cerrar un lote con animales exige moverlos o dejarlos explícitamente sin lote.
- Entradas, salidas y movimientos generan eventos en la bitácora del animal.
- Un plan solo se asigna a lotes activos con igual especie y propósito.
- Cambiar el plan cierra la asignación previa y conserva su historial.
- Desactivar un plan requiere confirmación si está asignado, pero no elimina ni rompe las asignaciones históricas.
- Cambiar especie o propósito se bloquea mientras haya animales o planes activos relacionados.
- Una venta confirmada o una baja por muerte cierra la pertenencia activa con motivo `VENTA` o `MUERTE`; nunca elimina el historial.
- Una tarea puede referenciar un lote y representa una actividad grupal, no una tarea duplicada por cada integrante.
- `RotacionPotrero.loteRef` relaciona la rotación con el lote; el campo textual `lote` se conserva para compatibilidad histórica.
- Una rotación guarda `numeroAnimales` como fotografía del momento. No se recalcula con miembros futuros.

## Interfaz

En `Inventario` se muestran las vistas `Animales`, `Lotes` y, cuando corresponde, `Camadas`. La tabla de lotes permite filtrar propósito, etapa, estado y potrero. El detalle funciona como panel operativo y muestra:

- integrantes actuales e historial de miembros;
- días activo, potrero, plan, ración y último suministro;
- peso promedio derivado del último pesaje y cobertura `pesados / integrantes`;
- GMD derivada de intervalos válidos posteriores al ingreso, cuando existen datos suficientes;
- resumen sanitario y tratamientos activos, sin guardar contadores redundantes;
- tareas pendientes, vencidas y próxima tarea;
- origen comprado/nacido en finca y cantidad de camadas de origen en porcinos;
- historial de etapas, rotaciones, planes y eventos operativos.

Acciones disponibles desde el lote:

- registrar múltiples pesos, generando un `Pesaje` individual por animal;
- registrar una aplicación sanitaria única con los integrantes preseleccionados;
- cambiar de potrero mediante `RotacionPotrero` y sincronizar ubicación de los integrantes;
- programar una `Tarea` grupal asignada a un usuario compatible;
- preparar una venta individual con los integrantes preseleccionados;
- registrar alimentación real con el lote preseleccionado;
- mover o retirar integrantes y cambiar etapa.

Una compra confirmada puede asignarse opcionalmente a un lote existente compatible desde su detalle. Dejarla sin lote sigue siendo válido.

`Alimentación` mantiene las vistas `Planes`, `Raciones` y `Suministros`. Administrador y Encargado gestionan catálogos; Trabajador puede usar el flujo rápido de suministro, pero no editar planes, raciones ni alimentos.

Permisos:

| Rol | Ver lotes y alimentación | Gestionar |
| --- | --- | --- |
| Administrador | Sí | Sí |
| Encargado | Sí | Sí |
| Trabajador | Sí | Registrar suministros |
| Veterinario | Sí | No |
| Consulta | Sí | No |
| Contador | No | No |

Las funcionalidades `lotes` y `planesAlimentacion` están habilitadas en todos los planes comerciales y no afectan el límite de animales.

## API

### Lotes

- `GET /api/lotes`
- `POST /api/lotes`
- `GET /api/lotes/:id`
- `PUT /api/lotes/:id`
- `POST /api/lotes/:id/animales`
- `POST /api/lotes/:id/mover-animales`
- `POST /api/lotes/:id/retirar-animales`
- `POST /api/lotes/:id/cerrar`
- `PATCH /api/lotes/:id/etapa`
- `POST /api/lotes/:id/pesajes`
- `POST /api/lotes/:id/tareas`
- `POST /api/lotes/:id/cambiar-potrero`
- `GET /api/lotes/:id/historial`
- `GET|POST /api/lotes/:id/plan-alimentacion`
- `GET /api/lotes/:id/historial-alimentacion`
- `GET|POST /api/lotes/:id/racion`
- `GET /api/lotes/:id/historial-raciones`
- `GET /api/lotes/:id/suministros`

### Alimentación

- `GET|POST /api/alimentacion/planes`
- `GET|PUT /api/alimentacion/planes/:id`
- `POST /api/alimentacion/planes/:id/asignar-lotes`
- `GET|POST /api/alimentacion/alimentos`
- `PUT /api/alimentacion/alimentos/:id`
- `GET|POST /api/alimentacion/raciones`
- `GET|PUT /api/alimentacion/raciones/:id`
- `GET|POST /api/alimentacion/suministros`
- `GET|PUT /api/alimentacion/suministros/:id`
- `GET /api/alimentacion/origenes/cortes`
- `GET /api/alimentacion/resumen-hoy`

### Integraciones y reportes

- `POST /api/compras/:id/asignar-lote`
- `GET /api/reportes/lotes`: operación básica para todos los planes.
- `GET /api/reportes/lotes/analitica`: añade GMD y cumplimiento; requiere `analiticaProductiva` desde Gestión.

El reporte de Lotes vive dentro de Reportes, no crea un módulo principal adicional. Permite comparar cantidad, propósito, etapa, peso, cobertura, potrero, plan y estado. Las métricas productivas avanzadas respetan el FeatureGate existente.

## Importador

La hoja `INVENTARIO` admite las columnas opcionales `CODIGO_LOTE`, `NOMBRE_LOTE` y `PROPOSITO_LOTE`. `CODIGO_LOTE` debe identificar un lote activo existente y compatible. La vista previa rechaza códigos desconocidos; el importador no crea lotes silenciosamente.

## Migración y despliegue

No se modifica ni inventa pertenencia para animales existentes. Todos empiezan sin lote hasta una asignación explícita. Los lotes existentes reciben `etapaOperativa = null`; no se reconstruyen etapas pasadas sin evidencia. Las rotaciones antiguas mantienen su texto `lote` y solo las nuevas operaciones grupales usan `loteRef`. Mongoose crea los nuevos índices al iniciar el backend; antes de desplegar se debe verificar que no existan pertenencias o rotaciones activas duplicadas.

Los índices principales son:

- código de lote único por organización y finca;
- una pertenencia activa por animal;
- una asignación de alimentación activa por lote;
- una asignación de ración activa por lote;
- búsquedas por especie, propósito, estado y ubicación.
- una sola etapa abierta por lote;
- una sola rotación activa referenciada por lote;
- tareas por lote, estado y fecha.

## Pendiente deliberado

Quedan fuera de este sprint el inventario de alimentos, recetas nutricionales, nutrientes, materia seca, conversión alimenticia, costos, reportes alimentarios y formulación de dietas. Los componentes de una ración son una guía operativa, no una fórmula nutricional. El GMD mostrado pertenece al desempeño observado del lote y no se atribuye causalmente al plan o ración.

También queda preparada, sin inventar cifras, la futura economía por lote. Para hacerla profesional deberá existir asignación explícita de costos a lote; los gastos generales de la finca no se repartirán automáticamente.
