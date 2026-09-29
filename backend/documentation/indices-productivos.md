# Índices productivos de finca

Los índices se calculan bajo demanda para el período seleccionado. No se guardan en `Animal` y no se presentan como calificaciones individuales.

## Conceptos separados

- IPG: productividad de cría bovina existente.
- ICP: crecimiento porcino de la finca contra metas por etapa.
- IEE: eficiencia del engorde bovino, porcino o consolidado de finca.

ICP e IEE pertenecen a la capacidad `analiticaProductiva`, disponible desde Gestión.

## Configuración productiva

`ConfiguracionProductiva` conserva metas editables por organización:

- GMD porcina para Fase 1, Fase 2, Fase 3, Desarrollo y Engorde.
- Peso objetivo porcino de engorde.
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

`Animal.objetivoProductivo` permite identificar Engorde sin inferirlo por sexo. Para porcinos existentes, `categoria = Engorde` se conserva como equivalencia cuando no existe objetivo explícito.

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
