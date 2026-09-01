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

## Reporte de camadas porcinas

Endpoint:

```txt
GET /api/reportes/porcinos/camadas
```

Query:

- `fechaInicio`
- `fechaFin`

Frontend:

```js
obtenerReporteCamadas({ fechaInicio, fechaFin })
```

### Origen de datos

- `Camada`
- `Animal` poblado en `madre`

### Filtro

Usa:

```js
crearFiltroFechas('fechaNacimiento', fechaInicio, fechaFin)
```

Es decir, el periodo se evalua por `Camada.fechaNacimiento`.

### Variables de salida

```js
resumen.totalCamadas
resumen.camadasActivas
resumen.camadasDestetadas
resumen.nacidosTotales
resumen.nacidosVivos
resumen.nacidosMuertos
resumen.momias
resumen.destetados
resumen.muertosPreDestete
resumen.criasParaFinca
resumen.criasParaVenta
resumen.criasParaEngorde
resumen.promedioVivosPorCamada
resumen.promedioDestetadosPorCamada
resumen.tasaDestete
resumen.mortalidadPreDestete
porEstado
porDestino
camadas
```

### Transformaciones

Totales:

```txt
nacidosTotales = suma(Camada.nacidosTotales)
nacidosVivos = suma(Camada.nacidosVivos)
nacidosMuertos = suma(Camada.nacidosMuertos)
momias = suma(Camada.momias)
destetados = suma(Camada.destetados)
muertosPreDestete = suma(Camada.muertosPreDestete)
criasParaFinca = suma(Camada.criasParaFinca)
criasParaVenta = suma(Camada.criasParaVenta)
criasParaEngorde = suma(Camada.criasParaEngorde)
```

Promedios:

```txt
promedioVivosPorCamada = nacidosVivos / totalCamadas
promedioDestetadosPorCamada = destetados / totalCamadas
```

Porcentajes:

```txt
tasaDestete = destetados / nacidosVivos * 100
mortalidadPreDestete = muertosPreDestete / nacidosVivos * 100
```

Agrupaciones:

- `porEstado`: agrupa por `Camada.estado`.
- `porDestino`: agrupa por `Camada.destino`.

Por cada camada se devuelve:

```js
codigoCamada
madre
fechaNacimiento
fechaDesteteEstimada
fechaDesteteReal
nacidosTotales
nacidosVivos
nacidosMuertos
momias
destetados
muertosPreDestete
criasParaFinca
criasParaVenta
criasParaEngorde
destino
estado
tasaDestete
mortalidadPreDestete
pesoPromedioNacimiento
pesoPromedioDestete
pesoTotalDestete
```

## Reporte reproductivo porcino

Endpoint:

```txt
GET /api/reportes/porcinos/reproduccion
```

Query:

- `fechaInicio`
- `fechaFin`

Frontend:

```js
obtenerReporteReproductivoPorcino({ fechaInicio, fechaFin })
```

### Origen de datos

- `RegistroReproductivo`
- `Camada`
- `Animal` poblado en `animal` o `madre`

### Filtros

Registros reproductivos:

```js
especie: 'Porcino'
fechaInseminacion dentro del periodo
```

Camadas:

```js
fechaNacimiento dentro del periodo
```

### Variables de salida

```js
resumen.ciclosRegistrados
resumen.ciclosActivos
resumen.ciclosNoPrenada
resumen.partosRegistrados
resumen.nacidosVivos
resumen.destetados
resumen.tasaPartoPorCiclo
resumen.tasaDestete
madres
```

### Transformaciones

`ciclosRegistrados`:

```txt
cantidad de RegistroReproductivo con especie Porcino e inseminacion en el periodo
```

`ciclosActivos`:

```txt
cantidad de registros donde estadoCiclo es Activo o no existe
```

`ciclosNoPrenada`:

```txt
cantidad de registros con estadoCiclo = No preñada
```

`partosRegistrados`:

```txt
cantidad de Camada con fechaNacimiento en el periodo
```

`nacidosVivos` y `destetados`:

```txt
suma de Camada.nacidosVivos y Camada.destetados del periodo
```

Formulas:

```txt
tasaPartoPorCiclo = partosRegistrados / ciclosRegistrados * 100
tasaDestete = destetados / nacidosVivos * 100
```

### Por madre

El reporte une ciclos reproductivos y camadas por madre.

Por cada madre devuelve:

```js
animalId
diio
nombre
ciclos
activos
cerrados
noPrenada
partos
nacidosVivos
destetados
tasaDestete
ultimoParto
camadas
```

`ultimoParto`:

```txt
fechaNacimiento mas reciente entre camadas de esa madre
```

Orden:

- primero madres con mas partos.
- luego madres con mas nacidos vivos.

## Reporte de actividades/tareas por camada

Endpoint:

```txt
GET /api/reportes/porcinos/tareas-camadas
```

Query:

- `fechaInicio`
- `fechaFin`

Frontend:

```js
obtenerReporteTareasCamadas({ fechaInicio, fechaFin })
```

### Origen de datos

- `Camada`
- `Tarea`

### Filtros

Primero selecciona camadas por:

```js
Camada.fechaNacimiento dentro del periodo
```

Luego busca tareas con:

```js
referenciaId: { $in: camadaIds }
moduloOrigen: 'Reproduccion'
creadoAutomaticamente: true
```

### Variables de salida

```js
resumen.camadasConTareas
resumen.totalTareas
resumen.pendientes
resumen.enProceso
resumen.completadas
resumen.canceladas
resumen.vencidas
porCategoria
camadas
```

### Transformaciones

`camadasConTareas`:

```txt
camadas del periodo que tienen al menos una tarea automatica asociada
```

Estados:

```txt
pendientes = tareas con estado Pendiente
enProceso = tareas con estado En proceso
completadas = tareas con estado Completada
canceladas = tareas con estado Cancelada
```

`vencidas`:

```txt
tareas cuya fechaProgramada es anterior a hoy
y cuyo estado no es Completada ni Cancelada
```

`porCategoria`:

```txt
agrupa por Tarea.categoriaAutomatica
```

Por cada camada:

```js
camada resumida
tareas
resumenTareas.total
resumenTareas.pendientes
resumenTareas.completadas
resumenTareas.canceladas
```

Cada tarea incluye:

```js
titulo
tipo
estado
prioridad
fechaProgramada
categoriaAutomatica
claveAutomatica
```

## Reporte economico por camada

Endpoint:

```txt
GET /api/reportes/porcinos/economia-camadas
```

Query:

- `fechaInicio`
- `fechaFin`

Frontend:

```js
obtenerReporteEconomicoCamadas({ fechaInicio, fechaFin })
```

### Origen de datos

- `Camada`
- `MovimientoFinanciero`

### Filtros

Camadas:

```js
fechaNacimiento dentro del periodo
```

Movimientos financieros directos:

```js
MovimientoFinanciero.fecha dentro del periodo
referenciaId en ids de camadas
```

Movimientos porcinos por texto:

```js
MovimientoFinanciero.fecha dentro del periodo
y alguno de estos campos contiene porc/chan/cerd/lech/camada:
  categoria
  descripcion
  producto
  observaciones
o referenciaModelo = 'Camada'
```

Los movimientos directos y los detectados por texto se deduplican por `_id`.

### Variables de salida

```js
resumen.camadasEvaluadas
resumen.movimientosPorcinos
resumen.ingresosPorcinos
resumen.egresosPorcinos
resumen.balancePorcino
resumen.costoPromedioPorCamada
resumen.ingresoPromedioPorCamada
resumen.costoPorCriaViva
resumen.costoPorCriaDestetada
camadas
```

### Transformaciones

Ingresos:

```txt
movimientos donde naturaleza = Ingreso
```

Egresos:

```txt
movimientos donde naturaleza = Egreso
```

Totales:

```txt
ingresosPorcinos = suma monto de ingresos
egresosPorcinos = suma monto de egresos
balancePorcino = ingresosPorcinos - egresosPorcinos
```

Prorrateos:

```txt
costoPromedioPorCamada = egresosPorcinos / camadasEvaluadas
ingresoPromedioPorCamada = ingresosPorcinos / camadasEvaluadas
costoPorCriaViva = egresosPorcinos / total nacidos vivos
costoPorCriaDestetada = egresosPorcinos / total destetados
```

Si el denominador es `0`, se usa `1` internamente para evitar division invalida y devolver un valor estable.

### Por camada

Para cada camada:

```js
ingresosDirectos
egresosDirectos
costoEstimado
ingresoEstimado
margenEstimado
costoPorCriaViva
costoPorCriaDestetada
movimientosDirectos
```

Reglas:

- Si hay movimientos directos ligados por `referenciaId`, usa esos valores.
- Si no hay movimientos directos, usa el ingreso/costo prorrateado del periodo.

Formulas:

```txt
costoEstimado = egresosDirectos || costoPromedioPorCamada
ingresoEstimado = ingresosDirectos || ingresoPromedioPorCamada
margenEstimado = ingresoEstimado - costoEstimado
costoPorCriaViva = costoEstimado / nacidosVivos
costoPorCriaDestetada = costoEstimado / destetados
```

## Estandarizacion financiera usada por reportes

Los reportes financieros trabajan sobre `MovimientoFinanciero`.

Desde la fase de estandarizacion se conservan los datos originales y se agregan campos calculados para ordenar reportes sin perder trazabilidad.

### Campos originales conservados

```js
categoria
descripcion
producto
cantidad
unidad
monto
precioUnitario
proveedor
observaciones
tipoMovimiento
naturaleza
```

### Campos normalizados

```js
categoriaNormalizada
unidadNormalizada
factorUnidad
cantidadFisica
precioUnitarioFisico
```

Origen:

- `backend/services/normalizacionFinanciera-service.js`
- hooks del modelo `MovimientoFinanciero`
- controlador de movimientos financieros al crear.
- importador de Excel de finanzas.
- controladores de compras y ventas de animales.

### Categoria normalizada

Fuente:

```js
categoria
```

Transformacion:

- Normaliza mayusculas, acentos y espacios.
- Si coincide con una categoria del catalogo base, asigna esa categoria canonica.
- No infiere categoria desde producto, descripcion o tipoMovimiento.
- Si no coincide, conserva la categoria original o usa `Otros`.

Categorias actuales:

- `Alimentación`
- `Sanidad`
- `Combustible`
- `Mano de obra`
- `Potreros`
- `Infraestructura`
- `Herramientas`
- `Maquinaria`
- `Mantenimiento`
- `Ganado`
- `Porcinos`
- `Ventas`
- `Compras de animales`
- `Otros`

Ejemplos:

```txt
categoria = combustible
categoriaNormalizada = Combustible
```

```txt
categoria = sanidad
categoriaNormalizada = Sanidad
```

```txt
categoria = alimentacion
categoriaNormalizada = Alimentación
```

```txt
categoria = ventas
categoriaNormalizada = Ventas
```

### Unidad y cantidad fisica

Fuente:

```js
cantidad
unidad
```

Transformacion:

1. Se intenta detectar si `unidad` trae factor interno.
2. Se normaliza la unidad base.
3. Se calcula `cantidadFisica`.

Ejemplos:

```txt
cantidad = 1
unidad = 70 L
unidadNormalizada = L
factorUnidad = 70
cantidadFisica = 70
precioUnitarioFisico = monto / 70
```

```txt
cantidad = 3
unidad = 2 KG
unidadNormalizada = KG
factorUnidad = 2
cantidadFisica = 6
precioUnitarioFisico = monto / 6
```

```txt
cantidad = 5
unidad = unidad
unidadNormalizada = UNIDAD
factorUnidad = 1
cantidadFisica = 5
```

Unidades actuales:

- `L`
- `KG`
- `G`
- `ML`
- `UNIDAD`
- `SACO`
- `GALON`
- `M`
- `DOSIS`

Nota:

- `GALON` aun no se convierte automaticamente a litros.
- Si la unidad viene vacia o como `-`, puede quedar sin unidad normalizada.

### Reportes afectados directamente

#### Finanzas generales

Usa:

- `categoriaNormalizada || categoria`
- `naturaleza`
- `tipoMovimiento`
- `monto`
- `fecha`

Transforma:

- Totales por categoria ya usan la categoria normalizada cuando existe.

#### Productos e insumos

Usa:

- `producto`
- `categoriaNormalizada || categoria`
- `destinoUso`
- `unidadNormalizada`
- `cantidad`
- `factorUnidad`
- `cantidadFisica`
- `monto`
- `precioUnitario`
- `proveedor`
- `fecha`

Transforma:

```txt
precioPromedio = montoTotal / cantidadFisicaTotal
```

Cuando un movimiento viejo no tiene `cantidadFisica`, el pipeline intenta calcularla usando `cantidad` y `unidad`.

`precioUnitarioFisico` queda guardado en cada movimiento nuevo o editado. Sirve para auditar el precio real por unidad fisica:

```txt
precioUnitarioFisico = monto / cantidadFisica
```

Esto evita confundir el precio por linea con el precio por litro, kilo, saco, unidad, etc.

#### Destinos de uso

Usa:

- `destinoUso`
- `monto`
- `moneda`
- `producto`
- `fecha`

Transforma:

- Si `destinoUso` existe, agrupa con ese valor.
- Si `destinoUso` viene vacio, agrupa como `Otro`.
- No infiere destino desde producto, descripcion o categoria.

Endpoint financiero directo:

```txt
GET /api/finanzas/destinos-resumen?fechaInicio=&fechaFin=
```

Respuesta:

- `destinoUso`
- `registros`
- `totales` por moneda.
- hasta 5 `productos` relacionados.

### Revision de datos financieros

Endpoint:

```txt
GET /api/finanzas/revision-datos?fechaInicio=&fechaFin=
```

Objetivo:

- detectar datos que conviene corregir antes de analizar reportes.

Reglas actuales:

- movimientos sin `destinoUso`.
- movimientos con categoria `General` u `Otros`.
- compras sin `producto`.
- compras sin `cantidad` o `unidad`.
- movimientos sin `proveedor`.
- compras con cantidad/unidad pero sin `precioUnitarioFisico`.

La pantalla de Finanzas muestra un resumen de estos casos y permite abrir la edicion del movimiento.

#### Combustibles

Usa:

- `categoria = Combustible`
- o `categoriaNormalizada = Combustible`.
- `cantidadFisica`
- `monto`

Transforma:

```txt
litrosTotales = suma(cantidadFisica)
precioPromedioLitro = montoTotal / litrosTotales
```

#### Sustentabilidad de cria

Usa:

- `Animal.fechaCompra`
- `Animal.fechaNacimiento`
- `Animal.fechaVenta`
- `Animal.pesoCompra`
- `Animal.precioCompraPorKg`
- `Animal.pesoVenta`
- `Animal.precioVentaPorKg`
- movimientos clasificados como gastos operativos.

Transforma:

```txt
gasto operativo mensual por animal =
  gastosOperativosPeriodo / animalesActivosCosto / mesesPeriodo
```

```txt
utilidad/perdida =
  ventas - compras - costoProduccionAsignado
```

#### Compras y ventas de animales

Compras de animales generan `MovimientoFinanciero` con:

```js
tipoMovimiento = 'Compra de animales'
naturaleza = 'Egreso'
categoria = 'Compra de animales'
producto = 'Bovinos comprados' | 'Porcinos comprados'
cantidad = pesoTotalKg
unidad = 'KG'
precioUnitario = montoTotal / pesoTotalKg
referenciaModelo = 'CompraAnimal'
referenciaId = compra._id
```

Ventas de animales generan `MovimientoFinanciero` con:

```js
tipoMovimiento = 'Venta de animales'
naturaleza = 'Ingreso'
categoria = 'Ventas'
producto = 'Bovinos vendidos' | 'Porcinos vendidos'
cantidad = pesoTotalKg
unidad = 'KG'
precioUnitario = montoTotal / pesoTotalKg
referenciaModelo = 'VentaAnimal'
referenciaId = venta._id
```

Esto permite auditar desde Finanzas el movimiento que nacio en compra/venta.

Nota:

- La cantidad de animales queda en el documento `CompraAnimal` o `VentaAnimal`.
- En `MovimientoFinanciero`, `cantidad` usa kilos para que `precioUnitario` represente precio por kg.

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
obtenerReporteProductosResumen(filtrosProductos)
obtenerReporteProductosPorProducto(filtrosProductos)
obtenerReporteProductosPorCategoria(filtrosProductos)
obtenerReporteProductosCombustibles(filtrosProductos)
obtenerReporteProductosProveedores(filtrosProductos)
obtenerReporteCamadas(filtrosGenerales)
obtenerReporteReproductivoPorcino(filtrosGenerales)
obtenerReporteTareasCamadas(filtrosGenerales)
obtenerReporteEconomicoCamadas(filtrosGenerales)
```

Filtros generales:

- `fechaInicio`
- `fechaFin`
- `especie`

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

Filtros de productos:

- `fechaInicio`
- `fechaFin`
- `producto`
- `categoria`
- `proveedor`

Los reportes de productos usan `categoriaNormalizada`, `unidadNormalizada`, `factorUnidad` y `cantidadFisica` cuando existen. Si un movimiento viejo no tiene esos campos, el reporte usa `categoria`, `unidad` y calcula la cantidad fisica en el pipeline como respaldo.

Filtros porcinos:

- `fechaInicio`
- `fechaFin`

Nota:

- Los reportes porcinos de camadas usan `fechaNacimiento` como fecha principal.
- El reporte reproductivo porcino combina ciclos por `fechaInseminacion` y camadas por `fechaNacimiento`.

## Riesgos o puntos a vigilar

- `valorEstimadoHato` depende de campos estimados que no siempre existen en el modelo actual.
- `muertesPeriodo` usa `Animal.updatedAt`, no `fechaMuerte`; si se quiere precision historica, conviene cambiarlo a `fechaMuerte`.
- `partos por vaca y ano` solo analiza animales Bovinos con partos registrados en el periodo; no incluye Porcinos aunque el filtro global este en Todos.
- `sustentabilidad` ignora animales vendidos sin `pesoVenta` o `precioVentaPorKg`.
- `precioKg.minimo` puede tomar `0` si algun item vendido no trae precio por kg.
- `animalesInicioPeriodo` usa `createdAt`, no fecha nacimiento/compra.
- El reporte de gastos operativos depende de clasificacion por texto; conviene estandarizar categorias cada vez mas.
- El reporte economico por camada es mas exacto cuando los movimientos financieros se ligan directamente a la camada con `referenciaId`.
- Si los gastos porcinos no estan ligados a camada, el reporte economico los detecta por texto y los prorratea entre camadas del periodo.
- El reporte de tareas por camada solo considera tareas automaticas con `referenciaId` de camada; no incluye tareas manuales sueltas.

## Pendientes de estandarizacion financiera

Pendientes tecnicos:

- Categorias financieras y destinos de uso ya son catalogos administrables desde Finanzas. Se guardan en `CatalogoFinanciero`, pueden activarse/desactivarse y solo se eliminan si no tienen movimientos asociados.
- El endpoint publico `GET /api/finanzas/catalogos` devuelve solo categorias y destinos activos para formularios.
- El endpoint administrativo `GET /api/finanzas/catalogos/admin` devuelve activos e inactivos con conteo de usos y bandera `puedeEliminar`.
- Renombrar un catalogo puede actualizar movimientos existentes si el usuario confirma la migracion.
- Desactivar un catalogo no cambia reportes historicos; solo evita que aparezca en nuevos registros.
- Definir si el usuario podra corregir `categoriaNormalizada` manualmente sin perder `categoria` original.
- Migrar movimientos viejos que no tienen `producto`, `cantidad`, `unidadNormalizada` o `cantidadFisica`.
- Convertir unidades equivalentes si se decide hacerlo, por ejemplo `GALON` a `L`.
- Definir reglas de tipo de cambio para reportes mixtos `CRC` y `USD`.
- Mantener `precioUnitario` como valor de linea/importacion y usar `precioUnitarioFisico` para costo real por litro, kilo, unidad, saco, etc.
- Crear validaciones mas fuertes para evitar movimientos de compra de productos sin `producto`, `cantidad` o `unidad`.
- Crear exportacion de reportes financieros a Excel/PDF.

Pendientes de negocio:

- Revisar movimientos clasificados como `General` u `Otros`.
- Definir catalogo oficial definitivo de categorias y destinos con el cliente, aunque la app ya permite administrarlos.
- Separar formalmente gasto operativo, inversion capitalizable, compra de animales, venta de animales y gasto personal si aparece.
- Definir destinos de uso oficiales finales: chapia, tractor, sanidad, potrero, mantenimiento, alimentacion, camada, animal, finca, galera, cortadora, cerca, rancho, aguas, administracion, etc.
- Asociar gastos porcinos directamente a camada cuando se quiera medir rentabilidad por camada.
- Asociar gastos bovinos a animal, potrero o tarea cuando aplique.
- Definir tratamiento de impuestos, descuentos, fletes y ajustes en compras/ventas.
- Definir si planillas se registran por empleado, por corte, por tarea o por periodo completo.
- Definir depreciacion real para inversiones en maquinaria, infraestructura o equipo.
