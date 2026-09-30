# Bancos forrajeros

Los bancos forrajeros forman parte de `Potreros`; no agregan una opción al menú principal. El área se distingue mediante `Potrero.tipoArea`:

- `PASTOREO`: conserva rotaciones, descansos y animal-días.
- `BANCO_FORRAJERO`: registra producción por corte y no calcula animal-días.

## Datos y trazabilidad

`CatalogoPasto` es la fuente única de materiales. `usosPermitidos` diferencia `PASTOREO`, `CORTE` y `ENSILAJE`. El catálogo base incluye Cuba OM-22, Cuba CT-115, King Grass, Taiwán, Camerún, Maralfalfa, Elefante, caña de azúcar, maíz y sorgo forrajero, entre otros.

La cobertura actual permanece en `Potrero`. Cada cambio cierra y abre un `HistorialCoberturaPotrero`, por lo que `CorteForraje` conserva además una instantánea del nombre, especie base y cultivar vigentes al momento del corte.

Un corte almacena:

- fecha y área realmente cortada;
- cantidad de forraje verde normalizada a kg;
- materia seca solo cuando el usuario aporta un porcentaje;
- destino productivo opcional;
- responsable y usuario que registró la operación.

Un banco con cortes históricos no se elimina físicamente. Debe mantenerse en estado `Mantenimiento` para no dejar historial huérfano.

## Tareas y calendario lunar

Al crear un banco se puede programar el primer corte y una siembra o renovación. Al registrar un corte real, la tarea automática pendiente se completa y se crea o actualiza el próximo corte usando la fecha real más `intervaloCorteObjetivoDias`.

Las tareas usan:

- `moduloOrigen = Potreros`
- `categoriaAutomatica = CORTE_FORRAJE` o `SIEMBRA_FORRAJE`
- `referenciaId` y `potrero` con el identificador del banco
- `creadoAutomaticamente = true`

Las asignaciones cambiadas manualmente se conservan. Las tareas completadas no se reescriben. La fase lunar es información visual y nunca modifica automáticamente una fecha. El calendario lunar está disponible en todos los planes.

## Planes

`bancosForrajeros` está habilitado en Esencial, Gestión, Pro y Premium. Todos pueden crear bancos, registrar cortes, consultar historial, producción individual, materia seca y próximas tareas.

La analítica agregada usa `analiticaProductiva`, por lo que inicia en Gestión. El endpoint protegido es:

`GET /api/reportes/forrajes/rendimiento`

Filtros: `fechaInicio`, `fechaFin`, `areaId` y `forrajeId`.

El reporte devuelve rendimiento observado, sin afirmar causalidad ni declarar un forraje como mejor. Diferencia producción acumulada por hectárea de promedio kg/ha/corte y devuelve `null` cuando faltan datos.

## Endpoints operativos

- `GET /api/pastos?uso=CORTE`
- `GET /api/potreros?tipoArea=BANCO_FORRAJERO`
- `GET /api/potreros/:id/cobertura`
- `POST|PUT /api/potreros/:id/cobertura`
- `GET /api/potreros/:id/cortes`
- `POST /api/potreros/:id/cortes`

## Importación y migración

La hoja `POTREROS` acepta `TIPO_AREA`, `PASTO_PRINCIPAL`, `FECHA_ESTABLECIMIENTO_PASTO`, `DIAS_DESCANSO_OBJETIVO` e `INTERVALO_CORTE_OBJETIVO_DIAS`. Los nombres de forraje se resuelven contra el catálogo sin perder textos desconocidos.

La migración controlada de áreas existentes se ejecuta con:

`npm run migrate:tipos-area:check`

Después de revisar el conteo:

`npm run migrate:tipos-area`

Solo asigna `PASTOREO` a documentos sin `tipoArea`; nunca infiere bancos forrajeros.

## Preparación futura

`MovimientoFinanciero` ya permite asociar un movimiento a `potrero`, pero este sprint no calcula costos por kg. El destino del corte prepara una relación posterior con lotes, alimentación y engorde, sin asumir que lo cosechado fue consumido.
