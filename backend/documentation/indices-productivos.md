# Índices productivos de finca

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

`Animal.etapaProductiva` registra la etapa porcina actual. `Pesaje.etapaProductiva` conserva la etapa en el momento del pesaje. Esto permite dividir intervalos que atraviesan cambios de etapa. Los datos antiguos sin etapa se apoyan en la etapa actual del animal; si tampoco existe, se reportan como `sinMetaProductiva` y no se normalizan.

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

Las muertes se asignan al período únicamente mediante `fechaMuerte`. Un animal con `estado = Muerto` sin fecha se reporta en `muertesSinFechaConfiable`, pero no se imputa silenciosamente usando `updatedAt`.

La aplicación no conserva todavía el inicio histórico del objetivo Engorde. Para datos anteriores a este cambio se considera la información productiva actual y las fechas de entrada/salida disponibles.

No se incluyen conversión alimenticia ni eficiencia económica. Comprar alimento no demuestra consumo. El servicio anuncia `conversionAlimenticia` y `eficienciaEconomica` como extensiones futuras sin incorporarlas al cálculo actual.

## Dashboard

El dashboard consulta `Finca.lineasProductivas` y presenta como máximo cuatro índices:

- ICB para bovinos con objetivo `REPRODUCCION`.
- ICRP para porcinos con objetivo `REPRODUCCION`.
- IEE-B para bovinos con objetivo `ENGORDE`.
- IEE-P para porcinos con objetivo `ENGORDE`.

No se infiere el propósito a partir del sexo, categoría o cantidad de animales. Una finca mixta con ambos objetivos ve los cuatro; una finca especializada ve solo los aplicables.
