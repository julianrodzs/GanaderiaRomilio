# Reportes - Variables, origen y transformaciones

Este documento explica de donde salen los datos de los reportes de GanaderiaRomilio, que variables usa cada uno y como se transforman.

## Convenciones generales

### Filtros de fechas

La mayoria de reportes aceptan:

- `fechaInicio`
- `fechaFin`

El backend usa `crearFiltroFechas(campo, fechaInicio, fechaFin)`.

Regla:

- Si viene `fechaInicio`, usa `$gte`.
- Si viene `fechaFin`, ajusta la fecha al final del dia `23:59:59.999` y usa `$lte`.

Ejemplo:

```txt
fecha >= fechaInicio
fecha <= fechaFin 23:59:59.999
```

### Redondeo

Funcion:

```js
redondear(valor, decimales = 2)
```

Convierte valores nulos a `0` y aplica `toFixed`.

### Porcentaje

Funcion:

```js
porcentaje(numerador, denominador)
```

Regla:

- Si el denominador es `0`, devuelve `0`.
- Si hay datos, calcula `(numerador / denominador) * 100`.
- Limita el resultado entre `0` y `100`.

### Edad en meses

Funcion:

```js
calcularEdadMeses(fechaNacimiento)
```

Fuente:

- `Animal.fechaNacimiento`

Transformacion:

- Calcula meses completos desde nacimiento hasta la fecha actual.
- Si no hay fecha valida, devuelve `null`.

### Dias entre fechas

Funcion:

```js
calcularDiasEntre(fechaInicio, fechaFin = new Date())
```

Transformacion:

- Diferencia en dias completos.
- Si alguna fecha es invalida, devuelve `null`.

### Meses entre fechas

Funcion:

```js
calcularMesesEntre(fechaInicio, fechaFin)
```

Transformacion:

- Usa dias entre fechas.
- Divide entre `30.4375`.
- Redondea.

## Reporte general

Endpoint:

```txt
GET /api/reportes/resumen
```

Query:

- `fechaInicio`
- `fechaFin`
- `diio`

Frontend:

```js
obtenerResumenReportes({ fechaInicio, fechaFin, diio })
```

### Inventario

Respuesta:

```js
inventario.totalAnimales
inventario.porSexo
inventario.porEstado
inventario.pesoPromedio
inventario.animalesConPeso
```

Origen:

- Modelo `Animal`.

Variables:

- `totalAnimales`: `Animal.countDocuments()`.
- `porSexo`: agrupacion por `Animal.sexo`.
- `porEstado`: agrupacion por `Animal.estado`.
- `pesoPromedio`: promedio de `Animal.pesoActual` donde `pesoActual > 0`.
- `animalesConPeso`: cantidad de animales usados para el promedio.

Transformaciones:

- Agrupaciones con `$group`.
- Peso promedio con `$avg`.

Uso visual:

- Tarjetas generales del dashboard/reportes.
- Distribucion de inventario.

### Potreros

Respuesta:

```js
potreros.totalPotreros
potreros.porEstado
potreros.rotacionesActivas
```

Origen:

- `Potrero`
- `RotacionPotrero`

Variables:

- `totalPotreros`: `Potrero.countDocuments()`.
- `porEstado`: agrupacion por `Potrero.estado`.
- `rotacionesActivas`: `RotacionPotrero.find({ estado: 'Activa' })`.

Transformaciones:

- Agrupa potreros por estado.
- Popula `potrero` en rotaciones activas.
- Ordena rotaciones activas por `fechaEntrada` descendente.
- Limita a 8.

### Sanidad

Respuesta:

```js
sanidad.porEstado
sanidad.alertas
```

Origen:

- `PlanSanitario`

Variables:

- `porEstado`: agrupacion por `PlanSanitario.estado`.
- `alertas`: planes con `estado` en `['Próximo', 'Vencido']`.

Transformaciones:

- Ordena alertas por `proximaAplicacion` ascendente.
- Limita a 8.

### Finanzas generales

Respuesta:

```js
finanzas.porNaturaleza
finanzas.porTipo
finanzas.porCategoria
finanzas.porMes
```

Origen:

- `MovimientoFinanciero`

Filtro:

- Usa `MovimientoFinanciero.fecha` con `fechaInicio` y `fechaFin`.

Variables:

- `porNaturaleza`: agrupa por `naturaleza`.
- `porTipo`: agrupa por `tipoMovimiento`.
- `porCategoria`: agrupa por `categoria`, ordena por total y limita a 8.
- `porMes`: agrupa por ano y mes de `fecha`.

Transformaciones:

```js
total = suma(monto)
cantidad = cantidad de documentos
```

### Drone

Respuesta:

```js
drone.totalConteos
drone.porEstado
```

Origen:

- `ConteoDrone`

Filtro:

- Usa `ConteoDrone.fechaVuelo` con `fechaInicio` y `fechaFin`.

Variables:

- `totalConteos`: conteos en el periodo.
- `porEstado`: agrupacion por `ConteoDrone.estado`.

### Reproduccion: partos

Respuesta:

```js
reproduccion.partos
```

Este objeto se construye con `crearReportePartos`.

Ver seccion "Partos por vaca y ano".

## Productividad de cria - IPG

Endpoint:

```txt
GET /api/reportes/productividad
```

Query:

- `fechaInicio`
- `fechaFin`

Frontend:

```js
obtenerProductividadCria({ fechaInicio, fechaFin })
```

### Variables de salida

```js
ipg
clasificacion
tasaNatalidad
tasaDestete
tasaGestacion
tasaSupervivencia
ternerosNacidosPeriodo
ternerosDestetadosPeriodo
vacasReproductoras
vacasGestantes
muertesPeriodo
totalAnimales
recomendaciones
```

### Origen de datos

`vacasReproductoras`:

- Modelo `Animal`.
- Filtra hembras.
- Excluye `Muerto` y `Vendido`.
- Considera reproductora si:
  - sexo es `Hembra`.
  - edad calculada es `>= 24 meses`.
  - o tiene al menos un `RegistroReproductivo`.

`ternerosNacidosPeriodo`:

- Modelo `RegistroReproductivo`.
- Cuenta registros con `fechaPartoReal` existente dentro del periodo.

`ternerosDestetadosPeriodo`:

- Modelo `RegistroReproductivo`.
- Cuenta registros con `fechaDestete` existente dentro del periodo.

`vacasGestantes`:

- Modelo `RegistroReproductivo`.
- Cuenta animales unicos con:
  - `fechaPartoEstimada` existente.
  - sin `fechaPartoReal`.

`muertesPeriodo`:

- Modelo `Animal`.
- Cuenta animales con `estado: 'Muerto'`.
- Si hay fechas, filtra por `updatedAt`.

`totalAnimales`:

- `Animal.countDocuments()`.

### Formulas

```txt
tasaNatalidad = ternerosNacidosPeriodo / vacasReproductoras * 100
tasaDestete = ternerosDestetadosPeriodo / ternerosNacidosPeriodo * 100
tasaGestacion = vacasGestantes / vacasReproductoras * 100
tasaSupervivencia = (1 - muertesPeriodo / totalAnimales) * 100
```

IPG:

```txt
ipg = tasaNatalidad * 0.40
    + tasaDestete * 0.25
    + tasaGestacion * 0.20
    + tasaSupervivencia * 0.15
```

### Clasificacion

- `>= 95`: Excelente
- `>= 85`: Muy bueno
- `>= 75`: Bueno
- `>= 60`: Regular
- `< 60`: Deficiente

### Recomendaciones

Se generan con base en:

- ausencia de vacas reproductoras.
- ausencia de partos.
- nacimientos sin destetes.
- ausencia de gestantes.
- muertes en el periodo.
- natalidad baja.
- destete bajo.
- gestacion baja.
- supervivencia baja.

## Finanzas de cria

Endpoint:

```txt
GET /api/reportes/finanzas-cria
```

Query:

- `fechaInicio`
- `fechaFin`

Frontend:

```js
obtenerFinanzasCria({ fechaInicio, fechaFin })
```

### Variables de salida

```js
inversionAcumulada
gastosOperativosPeriodo
ingresosPeriodo
balanceOperativo
valorEstimadoHato
crecimientoHato
animalesInicioPeriodo
animalesActuales
patrimonioGanaderoEstimado
```

### Origen de datos

- `MovimientoFinanciero`
- `Animal`

### Clasificacion de movimientos

Inversion:

```js
tipoMovimiento === 'Inversion'
```

o texto relacionado en:

- `tipoMovimiento`
- `categoria`
- `descripcion`
- `observaciones`

Palabras consideradas inversion:

- ganado
- animal
- animales
- novillo
- vaca
- toro
- ternero
- finca
- infraestructura
- cerca
- corral
- maquinaria
- inversion

Gasto operativo:

- `naturaleza === 'Egreso'`.
- No debe ser inversion.
- Debe ser:
  - `tipoMovimiento === 'Planilla'`
  - o `tipoMovimiento === 'Compra'`
  - o contener categorias operativas.

Palabras operativas:

- vacuna
- desparasitante
- sales
- medicamento
- salario
- mano de obra
- combustible
- mantenimiento
- veterinario
- sanidad
- alimentacion

Ingreso:

```js
naturaleza === 'Ingreso'
```

### Transformaciones

`inversionAcumulada`:

```txt
suma de todos los movimientos no ingreso clasificados como inversion
```

No usa filtro de periodo. Es acumulada historica.

`gastosOperativosPeriodo`:

```txt
suma de gastos operativos dentro del periodo
```

`ingresosPeriodo`:

```txt
suma de movimientos con naturaleza Ingreso dentro del periodo
```

`balanceOperativo`:

```txt
ingresosPeriodo - gastosOperativosPeriodo
```

`animalesActuales`:

```txt
cantidad de animales cuyo estado no es Muerto ni Vendido
```

`animalesInicioPeriodo`:

```txt
animales activos cuyo createdAt <= inicioPeriodo
```

`crecimientoHato`:

```txt
animalesActuales - animalesInicioPeriodo
```

`valorEstimadoHato`:

Usa animales activos.

Funcion:

```js
calcularValorAnimal(animal)
```

Reglas actuales:

1. Si existe `animal.valorEstimado`, usa ese valor.
2. Si existe `animal.montoCompra`, usa ese valor.
3. Si existe `animal.pesoActual` y algun precio estimado (`precioEstimadoKg`, `precioKg`, `valorKg`), multiplica.
4. Si nada existe, devuelve `0`.

Nota: algunos campos como `valorEstimado`, `precioEstimadoKg`, `precioKg` o `valorKg` no forman parte fuerte del modelo actual de `Animal`; por eso hoy normalmente este valor puede quedar en `0` o depender de `montoCompra`.

`patrimonioGanaderoEstimado`:

```txt
valorEstimadoHato + inversionAcumulada
```

## Sustentabilidad de cria

Endpoint:

```txt
GET /api/reportes/sustentabilidad-cria
```

Query:

- `fechaInicio`
- `fechaFin`

Frontend:

```js
obtenerSustentabilidadCria({ fechaInicio, fechaFin })
```

### Objetivo

Estimar si la finca puede sostenerse con ventas de animales, considerando:

- venta por kilo.
- compra por kilo.
- costo operativo por animal.
- meses que el animal estuvo en finca.

### Variables de salida

```js
montoVentasAnimales
montoComprasAnimales
gastosOperativosPeriodo
costoProduccionAsignado
costoProduccionMensualPorAnimal
margenSustentabilidad
utilidadPerdida
animalesCompradosPeriodo
animalesVendidosPeriodo
animalesActivosCosto
mesesPeriodo
precioVentaPromedioKg
precioCompraPromedioKg
pesoCompraTotal
pesoVentaTotal
duracionPromedioMeses
detalleAnimales
animalesIgnorados
formula
criterioFechas
```

### Origen de datos

- `Animal`
- `MovimientoFinanciero`

### Animales activos para costo

Funcion:

```js
esAnimalConsideradoActivoEnPeriodo(animal, fechaInicio, fechaFin)
```

Reglas:

- Excluye `estado === 'Muerto'`.
- Usa como fecha de ingreso:
  - `fechaCompra`
  - o `fechaNacimiento`
  - o `createdAt`
- Si ingreso es posterior al fin del periodo, no cuenta.
- Si no tiene `fechaVenta`, cuenta.
- Si tiene venta, cuenta si la venta fue despues o durante el inicio del periodo.

### Gastos operativos

Fuente:

- `MovimientoFinanciero` dentro del periodo.
- Usa la misma funcion `esMovimientoGastoOperativo`.

Formula:

```txt
costoProduccionMensualPorAnimal =
  gastosOperativosPeriodo / animalesActivosCosto / mesesPeriodo
```

Si no hay animales activos, el costo queda `0`.

### Animales vendidos analizados

Fuente:

- `Animal`

Filtros:

- `estado === 'Vendido'`
- `fechaVenta` dentro del periodo.
- `pesoVenta > 0`
- `precioVentaPorKg > 0`

Si falta `pesoVenta` o `precioVentaPorKg`, el animal aparece en `animalesIgnorados`.

### Compra del animal

Funcion:

```js
calcularTotalCompraAnimal(animal)
```

Reglas:

- Si no tiene `fechaCompra`, devuelve `0`.
- Si tiene `pesoCompra` y `precioCompraPorKg`, usa:

```txt
pesoCompra * precioCompraPorKg
```

- Si no, usa `montoCompra`.

Para animales nacidos en finca, la compra es `0`.

### Venta del animal

Funcion:

```js
calcularTotalVentaAnimal(animal)
```

Regla:

```txt
pesoVenta * precioVentaPorKg
```

Si falta alguno, devuelve `0`.

### Duracion en finca

Fuente:

- fecha de ingreso:
  - `fechaCompra`
  - o `fechaNacimiento`
  - o `createdAt`
- fecha salida:
  - `fechaVenta`

Formula:

```txt
duracionMeses = dias(fechaIngreso, fechaVenta) / 30.4375
```

### Costo asignado por animal

```txt
costoProduccionAsignado =
  costoProduccionMensualPorAnimal * duracionMeses
```

### Utilidad/perdida por animal

```txt
utilidadPerdida =
  totalVenta - totalCompra - costoProduccionAsignado
```

### Totales

```txt
montoVentasAnimales = suma(totalVenta)
montoComprasAnimales = suma(totalCompra)
costoProduccionAsignado = suma(costoProduccionAsignado de cada animal)
margenSustentabilidad = montoVentasAnimales - montoComprasAnimales - costoProduccionAsignado
```

`utilidadPerdida` es igual a `margenSustentabilidad`.

### Promedios por kilo

```txt
precioVentaPromedioKg = montoVentasAnimales / pesoVentaTotal
precioCompraPromedioKg = montoComprasAnimales / pesoCompraTotal
```

Si el peso total es cero, devuelve `0`.

## Partos por vaca y ano

Este reporte se devuelve dentro de:

```txt
GET /api/reportes/resumen
```

Campo:

```js
reproduccion.partos
```

Tambien usa:

- `fechaInicio`
- `fechaFin`
- `diio`

### Origen de datos

- `RegistroReproductivo`
- `Animal`

### Registros considerados

Filtro:

- `fechaPartoReal` existente.
- `fechaPartoReal` dentro del periodo.

Si viene `diio`:

- Busca animales cuyo `diio` o `identificadorFinca` coincida parcialmente.
- Filtra partos solo de esos animales.

### Variables de salida

```js
anios
resumen.totalPartos
resumen.vacasConPartos
resumen.vacasCumplen
resumen.vacasBajoObjetivo
resumen.vacasRevisar
porVaca
```

Por cada vaca:

```js
animalId
diio
nombre
fechaNacimiento
edadMeses
totalPartos
ultimoParto
partosPorAnio
promedioAnual
aniosCumplidos
aniosSinParto
aniosRevisar
estado
```

### Transformaciones

`anios`:

- Si hay `fechaInicio` y `fechaFin`, usa ese rango.
- Si no, deriva los anos desde los partos encontrados.

`partosPorAnio`:

```txt
cantidad de fechaPartoReal por vaca y ano
```

`promedioAnual`:

```txt
totalPartos / cantidad de anos evaluados
```

`estado`:

- `Cumple`: todos los anos evaluados tienen 1 parto.
- `Bajo objetivo`: al menos un ano tiene 0 partos.
- `Revisar`: al menos un ano tiene mas de 1 parto.

Nota:

- Este reporte solo evalua vacas con partos registrados en el periodo. Vacas sin ningun parto se analizan mejor en "Vacas improductivas".

## Vacas improductivas o a revisar

Endpoint:

```txt
GET /api/reportes/vacas-improductivas
```

Query:

- `fechaInicio`
- `fechaFin`
- `diio`
- `mesesSinParto`
- `diasAbiertos`
- `pesoDesteteMin`

Frontend:

```js
obtenerVacasImproductivas({
  fechaInicio,
  fechaFin,
  diio,
  mesesSinParto,
  diasAbiertos,
  pesoDesteteMin
})
```

Valores por defecto:

- `mesesSinParto = 12`
- `diasAbiertos = 120`
- `pesoDesteteMin = 140`

### Origen de datos

- `Animal` para hembras.
- `RegistroReproductivo` para gestacion y partos.
- `Animal` para terneros relacionados por `madreDiio`.

### Hembras consideradas

Filtro:

```js
sexo: 'Hembra'
estado: { $in: ['Activo', 'En tratamiento'] }
```

Luego se descartan hembras menores de 24 meses o sin edad calculable.

Si viene `diio`, filtra por:

- `diio`
- `identificadorFinca`
- `nombre`

### Variables calculadas

`fechaCorte`:

- `fechaFin` si existe.
- Si no, fecha actual.

`limiteParto`:

```txt
fechaCorte - mesesSinParto
```

`ultimoParto`:

- Registro reproductivo mas reciente con `fechaPartoReal`.

`gestacionActiva`:

Existe un registro con:

- `fechaPartoEstimada`
- sin `fechaPartoReal`
- `fechaPartoEstimada >= fechaCorte`

`diasAbierta`:

```txt
dias entre ultimoParto.fechaPartoReal y fechaCorte
```

`destetesBajos`:

Busca terneros cuyo `madreDiio` coincida con:

- `vaca.diio`
- o `vaca.identificadorFinca`

Y que:

- tengan `pesoDestete`.
- `pesoDestete < pesoDesteteMin`.
- si hay fechas, `fechaDestete` o `updatedAt` dentro del periodo.

### Motivos

Una vaca aparece en el reporte si tiene al menos un motivo:

- `Sin parto reciente`
- `Sin gestación activa`
- `Muchos días abiertos`
- `Destete bajo`

Reglas:

`Sin parto reciente`:

```txt
no tiene ultimoParto
o ultimoParto.fechaPartoReal < limiteParto
```

`Sin gestación activa`:

```txt
gestacionActiva === false
```

`Muchos días abiertos`:

```txt
tiene ultimoParto
y no tiene gestacionActiva
y diasAbierta > diasAbiertos
```

`Destete bajo`:

```txt
destetesBajos.length > 0
```

### Resumen

```js
totalVacasRevisar
sinPartoReciente
sinGestacionActiva
muchosDiasAbiertos
destetesBajos
```

## Crecimiento por pesajes

Endpoint:

```txt
GET /api/reportes/crecimiento-pesajes
```

Query:

- `fechaInicio`
- `fechaFin`
- `animalId`
- `diasSinPesaje`

Frontend:

```js
obtenerReporteCrecimientoPesajes({
  fechaInicio,
  fechaFin,
  animalId,
  diasSinPesaje
})
```

Valor por defecto:

- `diasSinPesaje = 60`

### Origen de datos

- `Pesaje`
- `Animal`

### Datos considerados

Pesajes:

- Filtra `Pesaje.fecha` por periodo.
- Si viene `animalId`, filtra por ese animal.
- Ordena por fecha ascendente.

Animales:

- Solo animales cuyo estado no esta en:
  - `Muerto`
  - `Vendido`

### Analisis por animal

Funcion:

```js
crearAnalisisPesajesAnimal(animal, pesajes)
```

Ordena pesajes del animal por fecha.

Variables:

```js
pesoInicial = primer pesaje.peso
pesoActual = ultimo pesaje.peso
fechaInicial = primer pesaje.fecha
fechaUltimoPesaje = ultimo pesaje.fecha
cantidadPesajes = cantidad de pesajes
diasTranscurridos = dias entre fechaInicial y fechaUltimoPesaje
gananciaTotal = pesoActual - pesoInicial
gananciaDiariaPromedio = gananciaTotal / diasTranscurridos
gananciaMensualPromedio = gananciaDiariaPromedio * 30.44
```

Si no hay dias suficientes, la ganancia diaria queda `0`.

### Categoria del animal

Funcion:

```js
calcularCategoriaAnimal(animal)
```

Reglas:

- Si edad < 12 meses: `Ternero`.
- Si es hembra y edad >= 24: `Vaca`.
- Si es hembra y edad < 24: `Novilla`.
- Si es macho y edad >= 24: `Toro`.
- Si es macho y edad < 24: `Novillo`.

### Resumen

```js
animalesConPesajes
totalPesajes
animalesConCrecimiento
animalesSinPesajesRecientes
gananciaPromedioDiaria
gananciaDiariaPromedio
gananciaPromedioMensual
gananciaMensualPromedio
sinPesajesRecientes
```

`animalesConCrecimiento`:

- animales con al menos 2 pesajes.

`gananciaDiariaPromedio`:

```txt
promedio de gananciaDiariaPromedio entre animales con al menos 2 pesajes
```

`gananciaMensualPromedio`:

```txt
promedio de gananciaMensualPromedio entre animales con al menos 2 pesajes
```

### Mejores y menores crecimientos

`mejoresCrecimientos`:

- Ordena animales con crecimiento por `gananciaDiariaPromedio` descendente.
- Toma top 10.

`menoresCrecimientos`:

- Ordena por `gananciaDiariaPromedio` ascendente.
- Toma top 10.

### Animales sin pesajes recientes

`fechaLimiteReciente`:

```txt
hoy - diasSinPesaje
```

Un animal aparece si:

- no tiene pesajes.
- o su ultimo pesaje es anterior a `fechaLimiteReciente`.

### Crecimiento de terneros

Filtra analisis donde `categoria === 'Ternero'`.

Agrega:

```js
pesoNacimiento = Animal.pesoNacimiento || 0
gananciaDesdeNacimiento = pesoActual - pesoNacimiento
```

## Ventas por periodo, mes, origen y rotacion

Endpoint:

```txt
GET /api/ventas/resumen
```

Aunque se visualiza en Reportes, tecnicamente viene del controlador de ventas.

Query:

- `fechaInicio`
- `fechaFin`

Frontend:

```js
obtenerResumenVentas({ fechaInicio, fechaFin })
```

### Origen de datos

- `VentaAnimal`
- `Animal` poblado en `animales.animal`

### Ventas consideradas

Filtro:

```js
estado: 'Confirmada'
```

Si hay fechas:

- filtra por `VentaAnimal.fechaVenta`.

### Variables principales

```js
totalVendido
totalKgVendidos
precioPromedioKg
ingresosGenerados
totalVentas
totalAnimalesVendidos
```

Transformaciones:

```txt
totalVendido = suma(VentaAnimal.montoTotal)
totalKgVendidos = suma(VentaAnimal.pesoTotalKg)
precioPromedioKg = totalVendido / totalKgVendidos
ingresosGenerados = totalVendido
totalVentas = cantidad de ventas confirmadas
totalAnimalesVendidos = cantidad total de items en ventas.animales
```

### Ventas por periodo

```js
ventasPorPeriodo.totalVendido
ventasPorPeriodo.totalKgVendidos
ventasPorPeriodo.totalVentas
ventasPorPeriodo.totalAnimalesVendidos
ventasPorPeriodo.ventaPromedioPorAnimal
ventasPorPeriodo.ticketPromedioVenta
```

Formulas:

```txt
ventaPromedioPorAnimal = totalVendido / totalAnimalesVendidos
ticketPromedioVenta = totalVendido / totalVentas
```

### Precio por kilo

```js
precioKg.promedio
precioKg.minimo
precioKg.maximo
```

Formulas:

```txt
promedio = totalVendido / totalKgVendidos
minimo = menor precioKg en animales vendidos
maximo = mayor precioKg en animales vendidos
```

### Ventas por mes

Agrupa ventas por:

```txt
YYYY-MM de fechaVenta
```

Por cada mes:

```js
mes
total
pesoTotalKg
animales
ventas
precioPromedioKg
```

Formulas:

```txt
total = suma montoTotal del mes
pesoTotalKg = suma pesoTotalKg del mes
animales = suma totalAnimales del mes
ventas = cantidad de ventas del mes
precioPromedioKg = total / pesoTotalKg
```

### Compradores frecuentes

Agrupa por:

```txt
VentaAnimal.comprador
```

Devuelve:

```js
comprador
cantidad
```

### Animales vendidos por categoria

Usa el sexo del animal vendido:

- `Hembras` si `sexo === 'Hembra'`.
- `Machos` si `sexo === 'Macho'`.
- `Sin definir` si no hay sexo.

### Ventas por origen

Origen:

```js
obtenerOrigenAnimal(animal)
```

Regla:

- Si `animal.fechaCompra` existe: `Comprado`.
- Si no: `Nacido en finca`.

Fecha de ingreso:

```js
animal.fechaCompra || animal.fechaNacimiento || animal.createdAt
```

Por cada origen:

```js
origen
animales
pesoTotalKg
montoTotal
precioPromedioKg
mesesPromedioEnFinca
```

Formulas:

```txt
pesoTotalKg = suma pesoVentaKg
montoTotal = suma subtotal
precioPromedioKg = montoTotal / pesoTotalKg
mesesPromedioEnFinca = promedio de meses entre fechaIngreso y fechaVenta
```

### Rotacion de inventario vendido

Por animal vendido:

```js
animalId
diio
nombre
origen
fechaIngreso
fechaVenta
mesesEnFinca
pesoVentaKg
precioKg
subtotal
comprador
```

Solo incluye animales donde se pudo calcular `mesesEnFinca`.

Resumen:

```js
duracionPromedioMeses
animalesConDuracion
menorDuracion
mayorDuracion
detalle
```

Formulas:

```txt
duracionPromedioMeses = promedio(mesesEnFinca)
menorDuracion = minimo(mesesEnFinca)
mayorDuracion = maximo(mesesEnFinca)
```

## Como se usan en el frontend

Archivo:

```txt
frontend/src/Components/Reportes.js
```

El componente carga en paralelo:

```js
obtenerResumenReportes(filtrosPartos)
obtenerProductividadCria(filtrosGenerales)
obtenerFinanzasCria(filtrosGenerales)
obtenerSustentabilidadCria(filtrosGenerales)
obtenerVacasImproductivas(filtrosImproductivas)
obtenerReporteCrecimientoPesajes(...)
obtenerResumenVentas(filtrosGenerales)
```

Filtros generales:

- `fechaInicio`
- `fechaFin`

Filtros de partos:

- `partosFechaInicio`
- `partosFechaFin`
- `diio`

Filtros de vacas improductivas:

- `fechaInicio`
- `fechaFin`
- `diio`
- `mesesSinParto`
- `diasAbiertos`
- `pesoDesteteMin`

Filtros de crecimiento:

- `fechaInicio`
- `fechaFin`
- `diasSinPesaje`

## Riesgos o puntos a vigilar

- `valorEstimadoHato` depende de campos estimados que no siempre existen en el modelo actual.
- `muertesPeriodo` usa `Animal.updatedAt`, no `fechaMuerte`; si se quiere precision historica, conviene cambiarlo a `fechaMuerte`.
- `partos por vaca y ano` solo analiza vacas con partos registrados en el periodo.
- `sustentabilidad` ignora animales vendidos sin `pesoVenta` o `precioVentaPorKg`.
- `precioKg.minimo` puede tomar `0` si algun item vendido no trae precio por kg.
- `animalesInicioPeriodo` usa `createdAt`, no fecha nacimiento/compra.
- El reporte de gastos operativos depende de clasificacion por texto; conviene estandarizar categorias cada vez mas.
