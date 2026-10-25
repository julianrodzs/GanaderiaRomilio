# Índices productivos de finca

Revisión de código: **2026-10-21**. Evidencias y pendientes en [AUDIT_MODULO_REPORTES.md](../../AUDIT_MODULO_REPORTES.md). Describe implementación actual, no validación científica de las metas.

Los índices se calculan bajo demanda para el período seleccionado. No se guardan en `Animal` y no se presentan como calificaciones individuales.

## Conceptos separados

- indicador interno de cría bovina: conserva la fórmula histórica y excluye porcinos.
- ICRP: índice interno de cría porcina basado en camadas con destete cerrado.
- ICP: crecimiento porcino de la finca contra metas por etapa.
- IEE: eficiencia del engorde bovino, porcino o consolidado de finca.

ICP e IEE pertenecen a la capacidad `analiticaProductiva`, disponible desde Gestión.

## Configuración productiva

`ConfiguracionProductiva` conserva metas editables por organización:

- GMD porcina para Fase 1, Fase 2, Fase 3, Desarrollo y Engorde.
- Peso objetivo porcino de engorde.
- Metas porcinas de nacidos vivos por camada, destetados por camada y supervivencia predestete.
- GMD y peso objetivo bovinos de engorde.
- Días para considerar un pesaje reciente.

Los valores iniciales son metas internas de negocio y no estándares veterinarios universales. Solo un administrador puede editarlos.

Endpoints:

```text
GET /api/reportes/configuracion-productiva
PUT /api/reportes/configuracion-productiva
GET /api/reportes/porcinos/crecimiento?fechaInicio=&fechaFin=
GET /api/reportes/engorde?fechaInicio=&fechaFin=&especie=Todos|Bovino|Porcino
```

## Datos productivos explícitos

`Animal.objetivoProductivo = ENGORDE` identifica los animales de engorde sin inferirlo por sexo ni categoría. `REPRODUCCION` reúne el antiguo objetivo `Cría` y `Reproducción`; la categoría describe únicamente edad y sexo.

`Animal.etapaProductiva` registra la etapa porcina actual. `Pesaje.etapaProductiva` conserva la etapa en el momento del pesaje. Cada intervalo entre pesajes consecutivos usa la etapa del primero; si falta, toma la del segundo, la actual del animal o una categoría reconocida como etapa. No se subdivide el intervalo en la fecha exacta de un cambio de etapa. Si no existe etapa utilizable, se reporta como `sinMetaProductiva` y no se normaliza.

No se asignan fases mediante rangos de peso arbitrarios.

El reporte historico de crecimiento por pesajes reutiliza el mismo helper de GMD. De esta forma, un intervalo de cero dias no se cuenta como crecimiento valido y una perdida de peso conserva su signo en todos los reportes.

## ICP

Cada intervalo válido entre pesajes calcula:

```text
GMD real = ganancia kg / días
cumplimiento = GMD real / GMD objetivo de etapa * 100
```

El ICP de finca pondera el cumplimiento por animal-días. Las pérdidas de peso se conservan. Pesajes del mismo día, valores inválidos, animales con un solo pesaje e intervalos sin meta no se convierten en crecimiento cero.

Sin observaciones suficientes, `icp` es `null` y `datosInsuficientes` es `true`.

Clasificación interna:

- 105 o más: Por encima del objetivo.
- 95 a menos de 105: En objetivo.
- 80 a menos de 95: Bajo objetivo.
- Menos de 80: Requiere revisión.

## ICRP

El Índice de Cría Porcina usa únicamente camadas con destete cerrado. Una camada activa no se interpreta como mortalidad ni como un destete en cero.

El helper considera cerrada una camada con `fechaDesteteReal` o estado Destetada/Vendida/Cerrada. La consulta selecciona por fecha de nacimiento; no representa necesariamente todos los destetes ejecutados en ese período. No excluye explícitamente una camada cancelada que conserve fecha de destete: su tratamiento necesita revisión. El resumen básico de camadas sí incluye abiertas y sus porcentajes no son equivalentes al ICRP.

```text
30% cumplimiento de nacidos vivos por camada
45% cumplimiento de destetados por camada
25% cumplimiento de supervivencia predestete
```

Cada componente se compara con la meta interna de la organización y se limita a 100 antes de ponderarse. El mayor peso corresponde a los animales realmente destetados. Sin al menos una camada cerrada con nacidos vivos, `icrp` es `null` y el resultado declara datos insuficientes.

Clasificación interna:

- 100: Meta alcanzada.
- 85 a menos de 100: Cerca de la meta.
- 70 a menos de 85: Bajo la meta.
- Menos de 70: Requiere revisión.

Las variables elegidas corresponden a indicadores habituales de desempeño reproductivo porcino, pero la ponderación es una decisión interna de GanaderiaRomilio y no una calificación veterinaria universal.

No se publica todavía "lechones destetados por cerda por año": ese KPI requiere el promedio histórico de cerdas productivas durante el período y la aplicación aún no conserva snapshots de inventario reproductor. Usar únicamente el inventario actual produciría una cifra aparentemente precisa pero sesgada.

Referencias metodológicas consultadas:

- [Teagasc National Pig Herd Performance Report 2023](https://teagasc.ie/media/website/publications/2024/Pig-Herd-Performance-Report-2023.pdf).
- [Animal Welfare Committee: breeding technologies in livestock agriculture](https://www.gov.uk/government/publications/animal-welfare-committee-awc-opinion-on-breeding-and-breeding-technologies-in-commercial-livestock-agriculture/animal-welfare-committee-awc-opinion-on-breeding-and-breeding-technologies-in-commercial-livestock-agriculture).

## IEE

Primera versión:

```text
60% cumplimiento GMD
25% eficiencia del tiempo
15% supervivencia
```

Cada especie se normaliza primero contra su propia meta. Los componentes superiores a 100 se limitan a 100 al ponderar. Un componente sin datos queda en `null`; los demás se reponderan por su peso disponible. Sin meta o cumplimiento GMD no se publica un IEE basado únicamente en supervivencia.

El IEE general usa animal-días para ponderar bovinos y porcinos. Nunca compara directamente sus kg/día.

La eficiencia de tiempo usa proyección para animales activos y duración observada para animales finalizados. Toda fecha estimada se comunica como proyección.

Clasificación interna:

- 95 o más: Excelente desempeño.
- 85 a menos de 95: Buen desempeño.
- 70 a menos de 85: Desempeño medio.
- Menos de 70: Requiere revisión.

## Supervivencia y limitaciones

En **IEE**, las muertes se asignan al período únicamente mediante `fechaMuerte`. Un animal con `estado = Muerto` sin fecha se reporta en `muertesSinFechaConfiable`, pero no se imputa silenciosamente usando `updatedAt`. Esto no describe el ICB: su controlador aún atribuye muertes por `updatedAt` (RP-05).

La aplicación no conserva todavía el inicio histórico del objetivo Engorde. Para datos anteriores a este cambio se considera la información productiva actual y las fechas de entrada/salida disponibles.

No se incluyen conversión alimenticia ni eficiencia económica. Comprar alimento no demuestra consumo. El servicio anuncia `conversionAlimenticia` y `eficienciaEconomica` como extensiones futuras sin incorporarlas al cálculo actual.

## Dashboard

El dashboard consulta `Finca.lineasProductivas` y presenta como máximo cuatro índices:

- ICB para bovinos con objetivo `REPRODUCCION`.
- ICRP para porcinos con objetivo `REPRODUCCION`.
- IEE-B para bovinos con objetivo `ENGORDE`.
- IEE-P para porcinos con objetivo `ENGORDE`.

No se infiere el propósito a partir del sexo, categoría o cantidad de animales. Una finca mixta con ambos objetivos ve los cuatro; una finca especializada ve solo los aplicables.

Esta selección corresponde a tarjetas según `Finca.lineasProductivas`; no implica que el cálculo de ICB filtre `Animal.objetivoProductivo`. Su denominador usa hembras actuales de ≥24 meses o con registro reproductivo. Los contadores generales de vacas del dashboard tampoco filtran especie (RP-02).

## Límites auditados y relación con otros reportes

- ICB usa partos como «nacidos», fecha de destete programada de RegistroReproductivo, gestaciones por FPP sin validar ciclo vigente y denominadores actuales. Con finca vacía devuelve cero/Deficiente. Son pendientes RP-03 a RP-06; no confundirlo con índices que devuelven null por insuficiencia.
- El GMD de crecimiento por pesajes es una media de GMD individuales. Detalle de lote y consolidado de protocolos comparten cálculo por pertenencia y ponderación por animal-días; LE-13 está corregido en el árbol local auditado. El IEE de finca usa objetivo de engorde y período, no pertenencia al lote.
- Peso equivalente bovino a 205 días: `PN + (PD − PN) × 205 / edad`, admitiendo 160–250 días. No incorpora ajuste por edad de madre, sexo ni grupo contemporáneo. Sin datos completos queda null. Los factores porcinos a 21 días no son una calificación clínica individual.
- Índices normalizan fechas en UTC. Para eventos con hora real no representan automáticamente el día de Costa Rica (RP-15); distinguirlos de fechas civiles almacenadas a medianoche UTC.
- El dashboard consulta APIs reales; no usa valores de ejemplo. Sus tarjetas de gastos/margen leen un contrato financiero antiguo y pueden mostrar cero (RP-01). Los estados de carga/error y actualización por cambio de alcance requieren revisión (RP-20).
