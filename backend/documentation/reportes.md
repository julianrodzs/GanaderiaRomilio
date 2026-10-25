# Reportes - Variables, origen y transformaciones

Revisión de implementación: **2026-10-21**. Catálogo completo de rutas, guards, evidencias y pendientes: [AUDIT_MODULO_REPORTES.md](../../AUDIT_MODULO_REPORTES.md). Esta documentación describe el comportamiento actual; los hallazgos RP pendientes no se consideran corregidos por documentarlos.

## Disponibilidad por plan

Los resumenes operativos de inventario, potreros, sanidad, finanzas, ventas, productos, dron, camadas y tareas por camada son reportes basicos disponibles desde Esencial.

La analitica productiva requiere Gestion o superior: indicador interno de cria bovina, productividad reproductiva porcina, vacas a revisar, partos por vaca y ano, crecimiento por pesajes, reproduccion porcina avanzada y rendimiento de potreros.

ICP e IEE se documentan en `indices-productivos.md`. Ambos son indicadores de finca calculados por periodo. ICP normaliza crecimiento porcino por etapa; IEE normaliza el engorde bovino y porcino contra metas propias antes de consolidarlo por animal-dias.

La analitica economica requiere Pro o superior: finanzas y sustentabilidad de cria, compras avanzadas, economia por camada, ventas por origen y rotacion del inventario vendido. Los endpoints protegidos responden `403 PLAN_FEATURE_NOT_AVAILABLE` cuando el plan no incluye la capacidad.

Los reportes comunes se calculan siempre para la finca activa recibida en `X-Finca-Id`. Premium habilita además el panel comparativo y consolidado multi-finca descrito al final de este documento.

Este documento explica de donde salen los datos de los reportes de GanaderiaRomilio, que variables usa cada uno y como se transforman.

## Convenciones generales

### Filtros de fechas

La mayoría acepta `fechaInicio` y `fechaFin`, pero no hay un contrato temporal único:

- `crearFiltroFechas` convierte inicio con `new Date` y fija fin a `23:59:59.999` **UTC**. No valida rango invertido/fecha inválida.
- Índices y multi-finca normalizan ambos extremos UTC y validan el rango.
- El reporte de lotes usa `setHours`, dependiente de la zona del servidor.
- Potreros recorta intervalos por días civiles UTC; la fecha fin del período es inclusiva y las salidas se tratan como límite exclusivo.

Para timestamps reales, octubre UTC excluye las últimas seis horas del 31 de octubre en Costa Rica e incluye seis horas del 30 de septiembre. Para fechas civiles almacenadas convencionalmente a medianoche UTC no debe aplicarse una conversión indiscriminada. **RP-15**: definir por campo fecha civil o instante y normalizar en consecuencia. `toLocaleDateString('es-CR')` fija idioma, no zona horaria.

`especie` no se aplica a todos los bloques: finanzas de cría/sustentabilidad no lo leen; raza representa inventario actual. No se admiten filtros universales de sexo/lote/potrero en todos los endpoints. Véase RP-19.

### Redondeo

Funcion:

```js
redondear(valor, decimales = 2)
```

En el controlador general convierte valores nulos a `0` y aplica `toFixed`. No es una convención universal: destete, ICP/IEE y lotes conservan `null` para varios indicadores sin evidencia. No interpretar falta de datos como rendimiento cero.

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
- `partosFechaInicio`
- `partosFechaFin`
- `diio`
- `especie`

Frontend:

```js
obtenerResumenReportes({
  fechaInicio,
  fechaFin,
  partosFechaInicio,
  partosFechaFin,
  diio,
  especie
})
```

Regla de fechas:

- `fechaInicio` y `fechaFin` son el rango general del reporte. Afectan finanzas, drone y otros resumenes por periodo.
- `partosFechaInicio` y `partosFechaFin` solo afectan el bloque `Partos por vaca y año`.
- Si no se envian fechas de partos, el backend usa `fechaInicio` y `fechaFin` como respaldo.

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

- `totalAnimales`: `Animal.countDocuments()` filtrado por especie.
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

Nota:

- Si `especie=Porcino`, la distribucion corresponde a porcinos.
- Si `especie` viene vacio o `Todos`, la tarjeta `Distribucion del ganado` usa Bovinos por defecto para no mezclar chanchas con ganado bovino.

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

Reporte sanitario ampliado:

```txt
GET /api/reportes/sanidad?fechaInicio=&fechaFin=&especie=
```

Fuentes:

- `AplicacionSanitaria` para contar exclusivamente aplicaciones realizadas.
- `TratamientoSanitario` para estados y proximas aplicaciones.
- `PlanSanitario` para aplicaciones recurrentes proximas o vencidas.

Respuesta:

```js
totalAplicaciones
aplicacionesPorNaturaleza
tratamientosPorEstado
productosMasAplicados
animalesMasTratados
proximosTratamientos
proximosPlanes
```

Reglas:

- Crear un plan o tratamiento no incrementa `totalAplicaciones`.
- `aplicacionesPorNaturaleza` diferencia `Plan sanitario`, `Tratamiento` y `Aplicación única`.
- Los productos se cuentan por documento de aplicacion real.
- Para animales con mas tratamientos se expanden los animales de aplicaciones cuya naturaleza es `Tratamiento`.
- Las proximas aplicaciones de tratamientos solo incluyen tratamientos `Activo` con `proximaAplicacion`.

### Finanzas generales

Respuesta:

```js
finanzas.porNaturaleza
finanzas.porTipo
finanzas.porCategoria
finanzas.porMes
finanzas.gastosPorMes
```

Origen:

- `MovimientoFinanciero`

Filtro:

- Usa `MovimientoFinanciero.fecha` con `fechaInicio` y `fechaFin`.

Variables:

- `porNaturaleza`: agrupa por `naturaleza` y `moneda` (CRC por defecto).
- `porTipo`: agrupa por `tipoMovimiento` y `moneda`.
- `porCategoria`: agrupa por `categoria` y `moneda`, ordena por total y limita a 8.
- `porMes`: agrupa por año, mes de `fecha` y moneda.
- `gastosPorMes`: agrupa solo movimientos con `naturaleza = 'Egreso'` por año, mes y moneda. Las filas devueltas incluyen `moneda`; el consumidor debe conservarla.

Transformaciones:

```js
total = suma(monto)
cantidad = cantidad de documentos
```

Uso visual:

- `Gastos por categoria`: barras por categoria financiera.
- `Gastos por mes`: grafico lineal basado en `finanzas.gastosPorMes`; obedece al rango general `fechaInicio` / `fechaFin`.
- `Destino de uso`: barras por `destinoUso`, cargadas desde `GET /api/finanzas/destinos-resumen`.

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

## Productividad reproductiva por especie

Endpoint:

```txt
GET /api/reportes/productividad
```

Query:

- `fechaInicio`
- `fechaFin`
- `especie=Bovino|Porcino`

Frontend:

```js
obtenerProductividadCria({ fechaInicio, fechaFin, especie })
```

### Bovinos

La respuesta bovina conserva el indicador interno de cria y nunca incorpora porcinos. Cuando la seleccion es `Todos`, este bloque sigue siendo exclusivamente bovino; los resultados porcinos se presentan en su propio reporte.

Variables de salida:

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

### Limitaciones confirmadas del ICB

- `fechaDestete` de RegistroReproductivo es programada/calculada desde parto: este contador no demuestra destete ejecutado (RP-03).
- «Terneros nacidos» cuenta partos, no número de crías nacidas.
- Gestantes no exige ciclo activo ni diagnóstico positivo; FPP conservada en ciclo cancelado puede contar (RP-04).
- Mortalidad usa `updatedAt`, aunque IEE ya utiliza `fechaMuerte` (RP-05).
- Denominadores usan inventario/edad actuales, no cohorte al corte; finca vacía recibe ICB cero/Deficiente (RP-06).

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

### Porcinos

No se calcula IPG con datos porcinos. La respuesta usa `Camada.fechaNacimiento` para el periodo y devuelve:

```js
totalCamadas
camadasDestetadas
madresConParto
nacidosVivos
destetados
promedioNacidosVivosPorCamada
promedioDestetadosPorCamada
supervivenciaPredestete
mortalidadPredesteteRegistrada
camadasPorMadreConParto
destetadosPorMadre
```

Los indicadores de destete solo usan camadas con `fechaDesteteReal` o estado `Destetada`, `Vendida` o `Cerrada`:

```txt
promedioDestetadosPorCamada = destetados / camadas con destete cerrado
supervivenciaPredestete = destetados / nacidos vivos de camadas con destete cerrado * 100
```

Las camadas activas sin destete no se convierten en mortalidad ni reducen artificialmente la supervivencia.

## Finanzas de cria

`GET /api/reportes/finanzas-cria?fechaInicio=&fechaFin=`. Requiere Pro (`analiticaEconomica`) y `reportes.ver`. `especie` no se aplica.

Fuentes: MovimientoFinanciero (histórico y período) y Animal de la finca activa.

```js
monedas.CRC.inversionOperativaHistorica
monedas.CRC.gastosOperativosPeriodo
monedas.CRC.ingresosPeriodo
monedas.CRC.balanceOperativo
monedas.USD // mismos campos, sin conversión
valorEstimadoHato
patrimonioGanaderoEstimado
animalesInicioPeriodo
animalesActuales
crecimientoHato
metodologiaPatrimonio
```

La inversión operativa histórica exige egreso y tipo `Inversion` o categoría de infraestructura/maquinaria; excluye referencias CompraAnimal, compra de animales y categorías de hato. El gasto operativo exige egreso de tipo Compra/Planilla, excluyendo inversión según `esMovimientoInversion`. Los ingresos son movimientos de naturaleza Ingreso. No se clasifica gasto operativo mediante palabras de descripción.

```text
balanceOperativo[moneda] = ingresosPeriodo[moneda] − gastosOperativosPeriodo[moneda]
valorEstimadoHato = suma valor de animales actuales no vendidos/muertos
patrimonioGanaderoEstimado = valorEstimadoHato
```

La valoración usa valorEstimado, montoCompra o pesoActual × precio estimado disponible; no es tasación de mercado. No suma inversión histórica al valor del ganado.

**RP-09:** animalesInicioPeriodo usa `createdAt <= inicio` y excluye animales vendidos/muertos hoy. animalesActuales es inventario actual, no al fin seleccionado. crecimientoHato es su diferencia y no reconstruye movimientos históricos. Un vendido a mitad del período falta incorrectamente en el inventario inicial.

## Sustentabilidad de cria

`GET /api/reportes/sustentabilidad-cria?fechaInicio=&fechaFin=`. Requiere Pro. Es una **estimación por animal vendido**, no margen bruto contable con consumo real. La selección global de especie no se aplica aquí.

### Contrato monetario

```js
monedas.CRC // y monedas.USD
// Dentro de cada moneda:
montoVentasAnimales
montoComprasAnimales
gastosOperativosPeriodo
costoProduccionAsignado
costoProduccionMensualPorAnimal
margenSustentabilidad
```

La raíz conserva montoVentasAnimales/montoComprasAnimales (CRC), conteos, kilos, precios medios, mesesPeriodo, duracionPromedioMeses, detalleAnimales, animalesIgnorados, formula y criterioFechas. **No hay gastosOperativosPeriodo ni margenSustentabilidad monetarios en la raíz.** Los detalles contienen `costosProduccionAsignados` y `utilidadPerdidaPorMoneda`.

### Cálculo vigente

- Se incluyen vendidos del período con pesoVenta y precioVentaPorKg positivos. Los incompletos aparecen en animalesIgnorados.
- Compra: si hay fechaCompra, prioriza montoCompra, incluido cero; solo si falta usa pesoCompra × precioCompraPorKg. F07 está corregido.
- Venta: pesoVenta × precioVentaPorKg. El flujo actual de ventas guarda precio efectivo = monto final asignado / peso, conservando ajustes. Para datos históricos/importados inconsistentes no se prioriza montoVenta.
- Permanencia: compra o nacimiento hasta venta, en meses de 30,4375 días. Animales muertos se excluyen del conjunto de costo.

```text
costoMensual[moneda] = gastosOperativosPeriodo[moneda] / animalesConsiderados / mesesPeriodo
costoAsignadoAnimal[moneda] = costoMensual[moneda] × mesesTotalesEnFinca
utilidadAnimal.CRC = venta − compra − costoAsignadoAnimal.CRC
utilidadAnimal.USD = −costoAsignadoAnimal.USD
```

USD no se convierte a CRC; compras/ventas animales de este cálculo se atribuyen a CRC. El margen consolidado suma los resultados de animales analizados. Los promedios por kg usan totales monetarios/pesos, no promedio simple de precios.

**RP-10:** se extrapolan gastos del período a toda la vida del animal en finca. Con CRC100 de gasto de octubre y un animal ingresado en enero, el costo asignado puede superar CRC900. No demuestra alimentación consumida ni costos históricos devengados. Etiquetar la proyección y diseñar atribución temporal antes de usarlo como rentabilidad realizada.

**RP-01:** el dashboard aún lee campos antiguos de raíz y muestra cero en tarjetas de gastos/margen aunque monedas contenga importes. Reportes.js sí lee los bloques monetarios.

## Analisis de compras de animales

Endpoint:

```txt
GET /api/reportes/compras-animales
```

Query:

- `fechaInicio`
- `fechaFin`
- `especie`: `Bovino`, `Porcino` o vacio para todos.
- `sexo`: `Macho`, `Hembra` o vacio.
- `proveedor`: coincidencia parcial.
- `raza`: coincidencia parcial.

Frontend:

```js
obtenerReporteComprasAnimales({
  fechaInicio,
  fechaFin,
  especie,
  sexo,
  proveedor,
  raza
})
```

Archivos principales:

- `backend/services/reporteComprasAnimales-service.js`
- `frontend/src/Components/ReporteComprasAnimales.js`

### Origen de datos

- `CompraAnimal`: compra, proveedor, especie, peso, precio registrado, monto calculado y monto final.
- `Animal`: estado actual, sexo, categoria, monto de venta y fechas de salida.
- `Pesaje`: ultimo peso real posterior a la compra.
- `TratamientoSanitario`: tratamientos iniciados durante los primeros 60 dias posteriores a la compra.

Solo se consideran compras con:

```txt
estado = Confirmada
fechaCompra dentro del rango solicitado
```

Los registros bovinos antiguos sin `especie` se consideran `Bovino` por compatibilidad.

### Distribucion del monto final

El precio registrado por animal produce un subtotal:

```txt
subtotalCalculado = pesoCompraKg * precioKg
```

Cuando la compra tiene un `montoFinal`, el costo oficial de cada animal se distribuye segun su participacion en el monto calculado:

```txt
proporcionAnimal = subtotalCalculadoAnimal / montoCalculadoCompra
montoAsignadoAnimal = montoTotalCompra * proporcionAnimal
ajusteAsignadoAnimal = montoAsignadoAnimal - subtotalCalculadoAnimal
```

Esta regla permite filtrar por sexo o raza sin atribuir a los animales filtrados el monto completo de la compra.

### Indicadores de inversion y precio

```txt
totalInvertido = suma(montoAsignadoAnimal)
totalKg = suma(pesoCompraKg)
precioEfectivoKg = totalInvertido / totalKg
costoPromedioAnimal = totalInvertido / cantidadAnimales
pesoPromedioEntrada = totalKg / cantidadAnimales
ajusteMonto = totalInvertido - montoCalculado
porcentajeAjuste = ajusteMonto / montoCalculado * 100
```

`precioEfectivoKg` es ponderado por peso. No es un promedio simple de los precios por animal.

### Seguimiento posterior

Para animales vendidos se usa:

- `Animal.pesoVenta`
- `Animal.fechaVenta`
- `Animal.montoVenta`

Para animales activos o muertos se usa el ultimo `Pesaje` registrado entre la compra y la fecha actual o de muerte.

```txt
gananciaKg = pesoFinal - pesoCompraKg
gananciaDiaria = gananciaKg / diasDesdeCompra
margenBruto = montoVenta - montoAsignadoCompra
```

El margen bruto no incluye alimentacion, sanidad, mano de obra ni otros gastos operativos. No debe interpretarse como utilidad neta.

`tratadoPrimeros60Dias` indica que el animal estuvo asociado a un `TratamientoSanitario` cuya `fechaInicio` cayo entre la fecha de compra y los siguientes 60 dias.

### Analisis por sexo

`porSexo` separa machos y hembras y devuelve para cada grupo:

- animales y porcentaje del total.
- kilos e inversion.
- peso promedio de entrada.
- precio efectivo por kg.
- costo promedio por animal.
- ganancia diaria promedio cuando existen pesajes posteriores.
- tratamientos en los primeros 60 dias.
- mortalidad.
- margen bruto de animales vendidos.

La comparacion por sexo siempre debe leerse junto con especie, rango de peso y proveedor. Diferencias de composicion pueden afectar el precio y el crecimiento.

### Proveedores, meses y rangos de peso

La respuesta tambien incluye:

```js
porMes
porEspecie
proveedores
rangosPeso
puntosPesoPrecio
compras
```

- `porMes`: inversion, animales, kilos, precio efectivo y ajuste por mes.
- `porEspecie`: mantiene separados peso, precio, crecimiento, sexo y mortalidad de bovinos y porcinos cuando el filtro general usa `Todos`.
- `proveedores`: costo de entrada y resultado posterior por proveedor.
- `rangosPeso`: compara grupos de peso propios de bovinos y porcinos.
- `puntosPesoPrecio`: relacion visual entre peso de entrada y precio efectivo por animal.
- `compras`: seguimiento por documento de compra, utilizado como lote de ingreso.

Rangos bovinos:

- menos de 200 kg.
- 200 a 299 kg.
- 300 a 399 kg.
- 400 kg o mas.

Rangos porcinos:

- menos de 25 kg.
- 25 a 59 kg.
- 60 a 99 kg.
- 100 kg o mas.

No se mezclan bovinos y porcinos cuando se selecciona una especie. La opcion `Todos` muestra inversion total y un resumen separado por especie; la interfaz pide seleccionar una especie antes de graficar tendencias de precio o la relacion peso-precio.

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

**Limitaciones vigentes (RP-07/RP-08):** `diasAbierta` es parto–fecha de corte, no parto–concepción. No hay exclusión posparto de 45 días; una hembra a diez días puede aparecer por «Sin gestación activa». Último parto/edad no reconstruyen estado al corte; destete bajo usa madreDiio. Al buscar por DIIO/nombre se reemplaza el `$or` de especie y pueden entrar porcinas. No interpretar esta lista como diagnóstico clínico.

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
estado: 'Activo'
especie: 'Bovino'
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

El GMD global de este reporte promedia GMD individuales. Lotes y consolidado de protocolos ponderan por animal-días y usan el período de pertenencia. `/engorde` calcula IEE por objetivo productivo, no el mismo conjunto del lote: no comparar las tres cifras sin igualar cohorte, fechas y ponderación. La remediación local LE-13 sí comparte el helper del lote con el consolidado de protocolos.

Endpoint:

```txt
GET /api/reportes/crecimiento-pesajes
```

Query:

- `fechaInicio`
- `fechaFin`
- `animalId`
- `diasSinPesaje`
- `especie=Bovino|Porcino`

Frontend:

```js
obtenerReporteCrecimientoPesajes({
  fechaInicio,
  fechaFin,
  animalId,
  diasSinPesaje,
  especie
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
- Aplica el filtro de especie antes de consultar los pesajes; un reporte porcino no puede incluir pesajes bovinos y viceversa.
- La categoria se obtiene con el servicio central de categorias por edad, sexo y especie. El bloque de crias muestra terneros/terneras para bovinos y lechones/lechonas para porcinos.

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
montoTotal = suma monto asignado desde el total oficial de la venta
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

`GET /api/reportes/porcinos/economia-camadas?fechaInicio=&fechaFin=`. Requiere Pro (`analiticaEconomica`).

Fuentes: Camada por fechaNacimiento y MovimientoFinanciero por fecha financiera. Se unen movimientos con referenciaId de las camadas seleccionadas y movimientos identificados como porcinos por referenciaModelo Camada o texto porc/chan/cerd/lech/camada en categoría, descripción, producto u observaciones. La unión deduplica por `_id`.

### Respuesta y distribución

`resumen` incluye conteos y `monedas.CRC`/`monedas.USD`. Los indicadores monetarios pertenecen a esos bloques, no a campos escalares sin moneda. Cada elemento de `camadas` también incluye `monedas`.

```text
costoEstimadoCamada[moneda] = egresosDirectos + egresoIndirectoAsignado
ingresoEstimadoCamada[moneda] = ingresosDirectos + ingresoIndirectoAsignado
margenEstimado[moneda] = ingresoEstimado − costoEstimado
costoPorCriaDestetada[moneda] = costo / destetados
```

Los indirectos se distribuyen entre todas las camadas seleccionadas, incluso las que tienen directos; se conservan centavos. No existe ya la fórmula `directo || promedio`. Totales, balance y promedios se calculan separadamente por moneda. Si falta denominador, el código devuelve cero: no representa costo demostrado cero.

**RP-11:** un directo de camada fuera de la cohorte seleccionada puede entrar por referenciaModelo/texto y terminar prorrateado como indirecto entre otras camadas. La cohorte es por nacimiento, no por fecha de destete ni días de maternidad/lactancia; no debe presentarse como costeo exacto por fase. Las consultas no excluyen sistemáticamente camadas canceladas. Se requiere definición de alcance, cobertura y conciliación por moneda.

## Estandarizacion financiera usada por reportes

Los reportes financieros trabajan sobre `MovimientoFinanciero`.

Desde la fase de estandarizacion se conservan los datos principales y se usan catalogos administrables para ordenar reportes sin perder trazabilidad.

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

### Campos normalizados y derivados

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

### Categoria oficial

Fuente:

```js
categoria
```

Regla actual:

- `categoria` es la fuente oficial de negocio.
- El usuario la elige desde el catalogo financiero activo.
- Los reportes, filtros y conteos usan `categoria`.
- `categoriaNormalizada` queda como campo legado sincronizado con `categoria`.
- No se infiere categoria desde producto, descripcion, observaciones o tipoMovimiento.

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
categoria = Combustible
categoriaNormalizada = Combustible
```

```txt
categoria = Sanidad
categoriaNormalizada = Sanidad
```

```txt
categoria = Alimentación
categoriaNormalizada = Alimentación
```

```txt
categoria = Ventas
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

- `categoria`
- `naturaleza`
- `tipoMovimiento`
- `monto`
- `fecha`

Transforma:

- Totales por categoria usan la categoria oficial del catalogo.

#### Productos e insumos

Usa:

- `producto`
- `categoria`
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
categoria = 'Ganado' para bovinos | 'Porcinos' para porcinos
destinoUso = 'Finca'
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
destinoUso = 'Finca'
producto = 'Bovinos vendidos' | 'Porcinos vendidos'
cantidad = pesoTotalKg
unidad = 'KG'
precioUnitario = montoTotal / pesoTotalKg
referenciaModelo = 'VentaAnimal'
referenciaId = venta._id
```

En ventas, `montoTotal` es el total oficial:

```txt
montoCalculado = suma de subtotales por animal/camada
montoFinal = monto editable indicado por el usuario
montoTotal = montoFinal si existe; si no, montoCalculado
ajusteMonto = montoTotal - montoCalculado
```

Si existe ajuste, reportes, inventario y bitacora distribuyen el monto oficial de forma proporcional sobre los animales o camadas de la venta.

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
obtenerResumenReportes({
  ...filtrosGenerales,
  partosFechaInicio,
  partosFechaFin,
  diio
})
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
obtenerResumenDestinosFinancieros(filtrosGenerales)
obtenerReporteCamadas(filtrosGenerales)
obtenerReporteReproductivoPorcino(filtrosGenerales)
obtenerReporteTareasCamadas(filtrosGenerales)
obtenerReporteEconomicoCamadas(filtrosGenerales)
obtenerReportePesoDestete(filtrosGenerales)
obtenerReportePesoDesteteAvanzado(filtrosGenerales)
```

Filtros generales:

- `fechaInicio`
- `fechaFin`
- `especie`

Filtros de partos:

- `partosFechaInicio`
- `partosFechaFin`
- `diio`

Estos filtros no deben reemplazar el rango general. Solo afectan el reporte `Partos por vaca y año`.

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

Los reportes de productos usan `categoria`, `unidadNormalizada`, `factorUnidad` y `cantidadFisica` cuando existen. Si un movimiento viejo no tiene campos de unidad normalizada, el reporte usa `unidad` y calcula la cantidad fisica en el pipeline como respaldo.

## Rendimiento de potreros y cobertura

```text
GET /api/reportes/potreros/rendimiento?fechaInicio=&fechaFin=
GET /api/reportes/potreros/por-pasto?fechaInicio=&fechaFin=&agruparPor=pasto
```

Fuentes: `Potrero`, `RotacionPotrero`, `CatalogoPasto` e `HistorialCoberturaPotrero`.

La primera ruta compara potreros e incluye la cobertura actual y el descanso real frente a `diasDescansoObjetivo`. La segunda acepta `agruparPor=pasto` o `agruparPor=especieBase` y devuelve:

- cantidad de potreros y area observada.
- dias ocupados, porcentaje de tiempo ocupado y numero de rotaciones.
- animales promedio, densidad promedio durante el pastoreo en animales por hectarea, animal-dias y animal-dias por hectarea.
- descanso promedio, minimo, maximo, objetivo y diferencia.
- detalle comparable de los potreros incluidos en el grupo.

La asignacion es historica: si una rotacion cruza un cambio de cobertura, el servicio reparte sus dias y animal-dias entre ambos periodos. La primera cobertura comienza en `fechaEstablecimientoPasto` cuando esa fecha es anterior a la creación del historial. Si la fecha se agregó posteriormente en otra entrada consecutiva del mismo pasto, también se aplica al primer tramo. No se extiende a través de un cambio real de pasto. Como compatibilidad con potreros legados sin ningun documento de historial, se usa la cobertura actual y se marca como `sin historial previo`. Una descripcion importada sin catalogar aparece como pendiente de revision.

El porcentaje de tiempo ocupado es `dias ocupados / dias del periodo`; no aumenta por tener mas animales. La densidad durante el pastoreo es el promedio ponderado de `numeroAnimales / areaHa` en los tramos ocupados. `animal-dias / ha` conserva la presion acumulada al incorporar tambien la duracion. No se publican UA/ha sin peso historico de los animales en cada rotacion.

Estos reportes describen desempeno observado. No califican un pasto como mejor, no atribuyen causalidad y no mezclan GMD con la evaluacion de cobertura.

## Razas bovinas y porcinas

```text
GET /api/reportes/razas?especie=Bovino|Porcino|Todos
GET /api/reportes/bovinos/razas
```

Fuente: inventario animal. Usa especie y `grupoRacial` para el primer nivel, y la combinación de fracción, `razaPrincipal` y `razaSecundaria` para el detalle. Los animales históricos sin estructura aparecen como pendientes de normalización y no se reinterpretan destructivamente. La ruta bovina se mantiene por compatibilidad.

## Descendencia bovina

```text
GET /api/reportes/bovinos/descendencia?fechaInicio=&fechaFin=
```

Las crías se derivan de `Animal.madre` y `Animal.padre`. Cuando no hay referencia interna se usa `madreDiio` o `padreDiio` como respaldo. Los partos se cuentan separadamente desde `RegistroReproductivo.fechaPartoReal`.

El período filtra la fecha real del parto y la fecha de nacimiento de la cría. Una vaca puede mostrar más crías que partos si hubo un parto múltiple. El reporte de toros muestra utilización registrada (`crías` y `madres diferentes`), no una calificación genética.

## Peso al destete bovino y porcino

```text
GET /api/reportes/destete/peso?fechaInicio=&fechaFin=&especie=
GET /api/reportes/destete/peso/analitica?fechaInicio=&fechaFin=&especie=
```

El primer endpoint es un reporte basico disponible en todos los planes. Usa únicamente datos reales registrados:

- Bovinos: `Animal.fechaNacimiento`, `fechaDestete`, `pesoNacimiento`, `pesoDestete`, `sexo` y `madre`.
- Porcinos: `Camada.fechaNacimiento`, `fechaDesteteReal`, `nacidosVivos`, `destetados`, `pesoPromedioNacimiento`, `pesoPromedioDestete`, `pesoTotalDestete` y `madre`.
- El periodo se aplica sobre la fecha real de destete.
- Los pesos ausentes no se convierten en cero; se informan mediante la cobertura del dato.
- El promedio porcino por lechon se pondera por la cantidad de destetados, para que una camada pequena no pese igual que una numerosa.

El segundo endpoint requiere `analiticaProductiva` y agrega comparabilidad por edad:

- Bovinos: calcula peso equivalente a 205 dias con `((pesoDestete - pesoNacimiento) / edadDias) * 205 + pesoNacimiento`, únicamente para destetes entre 160 y 250 dias. También calcula ganancia media diaria predestete.
- Porcinos: ajusta el peso total de la camada a 21 dias con factores para edades reales de 14 a 28 dias. También calcula peso promedio ajustado por lechon, ganancia media diaria y supervivencia al destete.
- Los registros fuera de rango o incompletos se conservan en el detalle, pero no entran al indicador normalizado.

Los resultados por madre son comparaciones operativas y no evaluaciones geneticas completas. En bovinos no se corrige todavía por edad de la madre, raza o grupo contemporaneo. En porcinos no se corrige por paridad ni transferencias de lechones entre camadas.

Fuentes metodologicas:

- Beef Improvement Federation, `Guidelines for Uniform Beef Improvement Programs`, seccion de peso al destete.
- Pork Information Gateway, `Swine Nutrition Guide`, factores de ajuste del peso de camada a 21 dias.

## Comparativo y consolidado multi-finca

`GET /api/reportes/multi-finca?fechaInicio=&fechaFin=&especie=&fincaIds=` requiere Premium, reportes.ver y acceso a todas las fincas seleccionadas. `fincaIds` acepta lista separada por comas; omitirlo selecciona las fincas activas accesibles. No se acepta una finca ajena a la membresía.

El inventario/peso y los tratamientos activos son **actuales**; finanzas, partos y aplicaciones corresponden al período. Peso consolidado = suma pesos / animales con dato. Finanzas excluye excluirConsolidacion de resultados externos y separa moneda. Los campos escalares ingresos/egresos/balance son alias CRC; usar monedas para presentar todos los importes. El filtro especie no segrega movimientos financieros.

Destetes usa Animal.fechaDestete y la finca histórica de HistorialFincaAnimal; no incluye destetes colectivos de Camada (RP-13). El detalle de métrica limita a 200 sin paginación ni total; finanzas puede incluir internos que el KPI excluye (RP-18).

Metas y cierres están implementados. Los cierres guardan una fotografía del reporte sin recalcularla, pero no reconstruyen inventario al fin del período ni usan una lectura snapshot de todos sus componentes (RP-12). El detalle sí muestra resumen y fincas; sus importes visibles son alias CRC, aunque el JSON contiene ambas monedas (RP-14).

- XLSX vivo: cinco hojas, incluida Finanzas por moneda.
- XLSX histórico: cuatro hojas; resumen/fincas omiten desglose USD.
- PDF histórico: PDFKit; problemas de alineación/altura de filas y encabezados por página (RP-17).
- No hay exportación general CSV o PDF de cada reporte individual.

Rutas, permisos, límites y criterios completos: [consolidacion-multifinca.md](consolidacion-multifinca.md) y [auditoría](../../AUDIT_MODULO_REPORTES.md).

## Dashboard y carga de reportes

ListaUsuario.js calcula KPIs en cliente con seis peticiones básicas y hasta cuatro condicionales; usa perfil productivo de la finca para seleccionar índices. No hay endpoint dashboard agregado ni datos mock. Un fallo de Promise.all puede dejar ceros/datos previos sin aviso visible; no se refresca con cada operación en otra vista (RP-20).

Las tarjetas financieras aún leen la estructura anterior a monedas (RP-01). Contadores de vacas no filtran especie y alertas de parto usan estado calculado con 15 días, no ventana explícita de próximos 30 (RP-02).

Reportes.js usa 22 posiciones en Promise.all, varias resueltas localmente cuando no aplica especie/feature, y luego consulta lotes. Su ruta financiera destinos-resumen requiere reportes.ver: Consulta y Contador están autorizados. Un fallo HTTP sí afecta la carga conjunta; no debe confundirse con un permiso inexistente.

Hay paginación de productos; muchos otros conjuntos y el reporte de lotes siguen siendo pesados (RP-16). No se ha certificado carga real de 5.000 animales.

## Riesgos o puntos a vigilar

- `valorEstimadoHato` depende de campos estimados que no siempre existen en el modelo actual.
- ICB: `muertesPeriodo` aún usa Animal.updatedAt (RP-05); IEE ya usa fechaMuerte. No extender esa limitación a todos los índices.
- `partos por vaca y ano` solo analiza animales Bovinos con partos registrados en el periodo; no incluye Porcinos aunque el filtro global este en Todos.
- `sustentabilidad` ignora animales vendidos sin `pesoVenta` o `precioVentaPorKg`.
- `precioKg.minimo` puede tomar `0` si algun item vendido no trae precio por kg.
- `animalesInicioPeriodo` usa createdAt y estado actual; omite vendidos/muertos posteriores al inicio (RP-09).
- El reporte de gastos operativos usa `tipoMovimiento`, `naturaleza` y categorias financieras estandarizadas; ya no clasifica por texto libre de descripcion u observaciones.
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
- Mantener `categoriaNormalizada` como campo legado sincronizado con `categoria`; no exponerlo como categoria editable separada.
- Migrar movimientos viejos que no tienen `producto`, `cantidad`, `unidadNormalizada` o `cantidadFisica`.
- Convertir unidades equivalentes si se decide hacerlo, por ejemplo `GALON` a `L`.
- Definir reglas de tipo de cambio para reportes mixtos `CRC` y `USD`.
- Mantener `precioUnitario` como valor de linea/importacion y usar `precioUnitarioFisico` para costo real por litro, kilo, unidad, saco, etc.
- Crear validaciones mas fuertes para evitar movimientos de compra de productos sin `producto`, `cantidad` o `unidad`.
- Completar exportación financiera individual; Premium ya tiene XLSX vivo y PDF/XLSX históricos, con pendientes monetarios/visuales RP-14/RP-17.

Pendientes de negocio:

- Revisar movimientos clasificados como `General` u `Otros`.
- Definir catalogo oficial definitivo de categorias y destinos con el cliente, aunque la app ya permite administrarlos.
- Separar formalmente gasto operativo, inversion capitalizable, compra de animales, venta de animales y gasto personal si aparece.
- Definir destinos de uso oficiales finales: chapia, tractor, sanidad, potrero, mantenimiento, alimentacion, camada, animal, finca, galera, cortadora, cerca, rancho, aguas, administracion, etc.
- Asociar gastos porcinos directamente a camada cuando se quiera medir rentabilidad por camada.
- Asociar gastos bovinos a animal, potrero o tarea cuando aplique.
- Completar reglas para impuestos/fletes y trazabilidad de datos antiguos. Los ajustes de monto final en compras/ventas ya se implementan; F07 no debe figurar como pendiente sin evidencia nueva.
- Definir si planillas se registran por empleado, por corte, por tarea o por periodo completo.
- Definir depreciacion real para inversiones en maquinaria, infraestructura o equipo.
