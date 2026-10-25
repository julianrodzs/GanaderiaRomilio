# Auditoría de reportes, indicadores y consolidación

Fecha: 2026-10-21. Base: `dcb214c` más los cambios locales presentes al iniciar la auditoría, incluida la remediación de lotes. Instrucción aplicada: [Agents.md](Agents.md). La revisión evalúa ese árbol de trabajo, no solamente HEAD.

## 1. Resumen ejecutivo

El módulo está implementado y tiene barreras de plan en sus rutas avanzadas, pero **no debe certificarse como matemáticamente correcto todavía**. Se identifican **20 hallazgos: 14 P1 y 6 P2; ningún P0 confirmado**. Los problemas principales son datos programados contados como realizados, denominadores históricos calculados con inventario actual, gastos extrapolados fuera del período y pérdidas de información monetaria en dashboard/cierres.

Se revisaron rutas reales, controladores, modelos, aislamiento Mongoose, servicios de cálculo, consumidores React y exportadores. No se usaron datos de producción. Las reproducciones ejecutan código real con repositorios en memoria; las verificaciones de consultas comprueban su construcción, no la ejecución del motor MongoDB. No hubo prueba de carga con 5.000 animales ni recorrido de navegador autenticado. La ausencia de P0 confirmado no equivale a una certificación de seguridad integral.

Validación:

- Backend: `npm.cmd test`, **282 aprobadas**, sin fallos ni omitidas.
- Auditoría: `node documentation/auditoria-reportes.repro.cjs` desde backend; **16 reproducciones/controles**, sin conexión a MongoDB. Las aserciones de defectos pasan precisamente al reproducir el comportamiento incorrecto; no certifican su corrección.
- Frontend: `npm.cmd run build` aprobado, 116 módulos. El primer intento falló por lectura de directorios superiores restringida por sandbox; la ejecución autorizada completó. Advertencia de chunk JS de 947,62 kB, superior a 500 kB.
- No se modificó código operativo en esta auditoría. Se entregan informe, reproducciones y documentación corregida.

Correcciones previas que sí están presentes: F07 prioriza `montoCompra`; ventas nuevas guardan el precio efectivo ajustado; lotes proyectan métricas por plan; LE-13 reutiliza `calcularResumenPesajes` en detalle y consolidado. La reproducción del último caso devuelve **1,000 kg/día en ambos**, excluyendo un pesaje anterior al ingreso. El detalle de cierres históricos existe: no es solo un encabezado.

## 2. Catálogo exhaustivo de rutas de reportes activas

Fuente: [backend/routes/reporte.js](backend/routes/reporte.js). Se cotejaron las **44 rutas** del router con las 44 filas de la tabla. Prefijo de todas las filas: `/api/reportes`. `B` = autenticación, finca autorizada y `reportes.ver`; `P` = B + `requireFeature('analiticaProductiva')`; `E` = B + `analiticaEconomica`; `M` = B + `reportesMultiFinca`; `C` = además `reportes.configurar`. Los guards avanzados comprueban también suscripción vigente. La columna Guard constituye la matriz por endpoint; la sección 7 detalla su alcance.

| Endpoint / método | Plan mínimo | Backend | Frontend | Guard | Exactitud / alcance | Madurez |
|---|---|---|---|---|---|---|
| GET `/resumen` | Esencial | Implementado | Reportes | B + proyección P | Inventario actual, flujos por fecha, partos avanzados | Parcial |
| GET `/lotes` | Esencial | Implementado | Reportes | B | Peso/cobertura; sin GMD avanzado; consulta pesada | Parcial |
| GET `/lotes/analitica` | Gestión | Implementado | Reportes | P | GMD por pertenencia y animal-días; RP-16 | Funcional |
| GET `/productividad` | Gestión | Implementado | Reportes/dashboard | P | ICB e ICRP; RP-03 a RP-06 | Parcial |
| GET `/finanzas-cria` | Pro | Implementado | Reportes | E | CRC/USD separados; inventario inicial incorrecto RP-09 | Parcial |
| GET `/sustentabilidad-cria` | Pro | Implementado | Reportes/dashboard | E | Estimación, extrapolación RP-10 | Parcial |
| GET `/vacas-improductivas` | Gestión | Implementado | Reportes | P | RP-07/RP-08 | Parcial |
| GET `/crecimiento-pesajes` | Gestión | Implementado | Reportes | P | Media de GMD individuales, activos actuales | Funcional con límites |
| GET `/porcinos/crecimiento` | Gestión | Implementado | ReporteIndicesProductivos | P | ICP ponderado por animal-días | Funcional con límites |
| GET `/engorde` | Gestión | Implementado | ReporteIndicesProductivos/dashboard | P | IEE por objetivo productivo, no por lote | Funcional con límites |
| GET `/potreros/rendimiento` | Gestión | Implementado | ReporteRendimientoPotreros | P | Ocupación, descanso y animal-días; no GMD causal | Funcional |
| GET `/potreros/por-pasto` | Gestión | Implementado | ReporteRendimientoPotreros | P | Usa tramos de cobertura histórica | Funcional |
| GET `/forrajes/rendimiento` | Gestión | Implementado | ReporteRendimientoForrajes | P | Cortes reales, área actual y datos de MS incompletos | Funcional con límites |
| GET `/bovinos/razas` | Gestión | Implementado | Reportes vía API racial | P | Inventario racial actual | Funcional |
| GET `/razas` | Gestión | Alias del anterior | Reportes | P | Admite especie; no histórico por fechas | Funcional |
| GET `/bovinos/descendencia` | Gestión | Implementado | Reportes | P | Genealogía interna/DIIO, nacimientos y partos | Funcional con límites |
| GET `/destete/peso` | Esencial | Implementado | Reportes | B | Destetes reales Animal/Camada, cobertura | Funcional |
| GET `/destete/peso/analitica` | Gestión | Implementado | Reportes | P | Equivalencia 205/21 días, no evaluación genética | Funcional |
| GET `/configuracion-productiva` | Gestión | Implementado | ReporteIndicesProductivos | P | Metas de organización | Funcional |
| PUT `/configuracion-productiva` | Gestión | Implementado | Configuración de índices | P+C | Solo administrador; no altera hechos históricos | Funcional |
| GET `/productos/resumen` | Esencial | Implementado | Reportes | B | Agrupaciones por moneda y cantidades | Funcional con límites |
| GET `/productos/por-producto` | Esencial | Implementado | Reportes | B | Paginación y unidades normalizadas | Funcional |
| GET `/productos/por-categoria` | Esencial | Implementado | Reportes | B | Importes por moneda | Funcional |
| GET `/productos/combustibles` | Esencial | Implementado | Reportes | B | Compras normalizadas; no consumo medido | Funcional con límites |
| GET `/productos/precio-promedio` | Esencial | Implementado | Sin llamada en carga principal | B | Promedios condicionados por unidad/moneda | API disponible |
| GET `/productos/proveedores` | Esencial | Implementado | Reportes | B | Agregación por proveedor/moneda | Funcional |
| GET `/productos/destinos` | Esencial | Implementado | Panel usa finanzas/destinos-resumen | B | Destinos financieros | API disponible |
| GET `/productos/top` | Esencial | Implementado | Sin llamada en carga principal | B | Ranking limitado | API disponible |
| GET `/porcinos/camadas` | Esencial | Implementado | Reportes | B | Cohorte por nacimiento, incluye camadas abiertas | Funcional con límites |
| GET `/porcinos/reproduccion` | Gestión | Implementado | Reportes | P | Servicios/partos y camadas, ventanas diferentes | Funcional con límites |
| GET `/porcinos/tareas-camadas` | Esencial | Implementado | Reportes | B | Fecha de programación y estados de tareas | Funcional |
| GET `/porcinos/economia-camadas` | Pro | Implementado | Reportes | E | Asignación directa + indirecta por moneda; RP-11 | Parcial |
| GET `/sanidad` | Esencial | Implementado | Reportes | B | Aplicaciones registradas y tratamientos; no eficacia clínica | Funcional con límites |
| GET `/compras-animales` | Pro | Implementado | Reportes | E | Monto final distribuido, seguimiento de compras | Funcional |
| GET `/multi-finca` | Premium | Implementado | ReporteMultiFinca | M | Flujos por período e inventario actual; RP-12/RP-13 | Parcial |
| GET `/multi-finca/exportar` | Premium | XLSX | ReporteMultiFinca | M | Cinco hojas, desglose monetario | Funcional con límites |
| GET `/multi-finca/detalle` | Premium | Implementado | ReporteMultiFinca | M | Máximo 200 sin paginación; RP-18 | Parcial |
| GET `/multi-finca/metas` | Premium | Implementado | GestionConsolidacionPremium | M | Organización/finca, comparación financiera CRC | Funcional con límites |
| POST `/multi-finca/metas` | Premium | Implementado | GestionConsolidacionPremium | M+C | Configuración, no reporte | Funcional |
| DELETE `/multi-finca/metas/:id` | Premium | Implementado | GestionConsolidacionPremium | M+C | Alcance autorizado | Funcional |
| GET `/multi-finca/cierres` | Premium | Implementado | GestionConsolidacionPremium | M | Filtra acceso a todas las fincas del cierre | Funcional |
| POST `/multi-finca/cierres` | Premium | Implementado | GestionConsolidacionPremium | M+C | Snapshot, no reconstrucción al corte; RP-12 | Parcial |
| GET `/multi-finca/cierres/:id` | Premium | Implementado | Modal con resumen y fincas | M | JSON conserva monedas; UI incompleta RP-14 | Parcial |
| GET `/multi-finca/cierres/:id/exportar` | Premium | PDF/XLSX | GestionConsolidacionPremium | M | RP-14/RP-17 | Parcial |

Integraciones fuera de ese router:

| Ruta / componente | Plan / guard efectivo | Cálculo y estado |
|---|---|---|
| `GET /api/ventas/resumen` | `ventas.ver`; `tieneFeature('analiticaEconomica')` para bloques avanzados | Ventas por fecha, monto final, origen y rotación proyectados desde servidor |
| `GET /api/finanzas/destinos-resumen` | `reportes.ver` | Disponible a Consulta y Contador; no confundir con `finanzas.ver` |
| `/api/finanzas/resumen`, `/consumo`, `/planilla-resumen`, `/inversiones-resumen`, `/revision-datos` | `finanzas.ver` | Resúmenes operativos de Finanzas, no analytics Pro por sí solos |
| `GET /api/protocolos-engorde/metricas/consolidado` | `protocolosEngorde` + `reportesMultiFinca` + `reportes.ver` | GMD compartido con detalle de lote; LE-13 corregido localmente |
| `GET /api/iatf/metricas/consolidado` | Guard de IATF + `reportesMultiFinca` + `reportes.ver` | Tasas calculadas desde sumas, no promedio simple de porcentajes |
| Consolidado de protocolos porcinos (`protocoloPorcinoRoutes.js`) | Guard de protocolos porcinos + `reportesMultiFinca` + `reportes.ver` | Bandas, preñez, nacidos y destetados; complemento del consolidado general |
| `ListaUsuario.js` | `dashboard.ver` (Administrador) y features por tarjeta | Dashboard calculado en cliente; no endpoint agregado específico |
| `/api/importar/plantilla`, `/excel`, `/excel/confirmar` | `importar.gestionar` | Revisión parcial: XLSX, preview/confirmación y límite de archivo 10 MB; importación no es exportación de reportes |

No existen en este router `/produccion`, `/reproduccion`, `/fertilidad`, `/economia-camadas` sin prefijo porcino, ni `/api/exportar/*`. Tampoco se encontró un `dashboardController` dedicado ni exportación general CSV/PDF de cada gráfico. Son nombres orientativos de la instrucción, no funcionalidades implementadas.

## 3. Diagnóstico del dashboard

Fuente: [ListaUsuario.js](frontend/src/Components/ListaUsuario.js), efecto `cargarMetricas`.

- Tiene diez posiciones en `Promise.all`: seis peticiones básicas y hasta cuatro condicionales. Descarga animales, potreros, planes sanitarios, registros reproductivos, lotes activos y alimentación; agrega ICB, ICRP, IEE y sustentabilidad según perfil/plan.
- `animalesActivos` excluye `Muerto` y `Vendido`. El enum actual de Animal no contiene `Descartado`; no se atribuye al contador un defecto por un estado inexistente. Las crías porcinas colectivas no son filas Animal y deben identificarse por separado si se desea un inventario total de cabezas.
- No hay datos mock sustituyendo registros. Sí hay valores iniciales cero que persisten si falla cualquier petición; el error solo se escribe en consola. No se informa antigüedad del KPI ni se actualiza por cada operación realizada en otras vistas (RP-20).
- RP-01: la API devuelve `monedas.CRC.gastosOperativosPeriodo` y `monedas.USD...`, pero la tarjeta lee `sustentabilidadMes.gastosOperativosPeriodo`. Con CRC 500 reales, el dashboard obtiene cero. Sucede también con el margen. El formateador está fijado a CRC. No existe la supuesta tarjeta genérica «Total ingresos del mes» de la instrucción.
- RP-02: las «vacas reproductivas» no filtran especie; una cerda con registro reproductivo entra en el contador. Preñadas/próximos partos cuentan ciclos, no animales distintos. `Próxima a parto` depende de estado persistido cuyo modelo usa **15 días**, sin ventana explícita 0–30 en el dashboard; no es una alerta de los próximos 30 días ni garantiza actualización diaria.
- Para 5.000 animales se descargan colecciones y se repiten cálculos. El informe de lotes sigue ejecutando detalle completo por cada lote aunque el listado operativo ya fue aligerado. No se midió latencia real (RP-16).

## 4. Exactitud matemática por módulo

### 4.1 Cría bovina y reproducción

Fuente: [reporte-controller.js](backend/controllers/reporte-controller.js), `getProductividadCria`, `obtenerVacasReproductoras`, `obtenerVacasGestantes`, `getVacasImproductivas`; [RegistroReproductivo.js](backend/models/RegistroReproductivo.js).

```text
natalidad = partos registrados en período / reproductoras actuales × 100
destete = registros con fechaDestete en período / partos del período × 100
gestación = animales con FPP y sin parto / reproductoras actuales × 100
supervivencia = (1 − muertes atribuidas al período / total animales actual) × 100
ICB (campo ipg) = 0,40 natalidad + 0,25 destete + 0,20 gestación + 0,15 supervivencia
```

Los porcentajes se limitan a 0–100. «Reproductora» es hembra no vendida/muerta de edad actual ≥24 meses **o con registro reproductivo**, sin exigir objetivo `REPRODUCCION`.

- **RP-03 (P1): destetes programados contados como reales.** `RegistroReproductivo.fechaDestete` se genera desde el parto; `countDocuments` lo cuenta sin comprobar intervención ni `Animal.fechaDestete`. «Terneros nacidos» cuenta documentos de parto, no crías efectivas. Cambiar a hechos de nacimiento/destete, con cohorte explícita.
- **RP-04 (P1): gestaciones sin ciclo vigente.** Basta FPP no nula y parto ausente. No exige `estadoCiclo`, diagnóstico positivo, `activoParaAlertas` ni animal activo. Un ciclo cancelado con FPP conservada aumenta la tasa. Reproducción aislada confirma filtro y conteo.
- **RP-05 (P1): muertes por `updatedAt`.** Editar después un animal muerto cambia el período atribuido a su muerte. IEE ya usa `fechaMuerte`; ICB no. Adoptar fecha del hecho e informar cobertura de fechas confiables.
- **RP-06 (P1): denominadores históricos y ausencia de datos.** Tasas de meses pasados cambian al vender/trasladar hembras hoy; nacimientos y destetes del mismo período no necesariamente son la misma cohorte. Finca vacía recibe `ipg: 0`, «Deficiente», en vez de falta de datos. No certifica natalidad/supervivencia histórica.
- **RP-07 (P1): «días abiertos» mide parto–corte.** No termina en concepción; se calcula incluso para gestantes. Una hembra a diez días posparto entra por «Sin gestación activa»: no existe el resguardo de 45 días solicitado por la instrucción. Último parto/edad usan información posterior al corte, y destetes bajos vinculan únicamente `madreDiio`. Separar «días desde parto» de intervalo parto–concepción, parametrizar ventana operativa y usar vínculos canónicos.
- **RP-08 (P1): búsqueda elimina filtro bovino.** El `$or` de DIIO/nombre reemplaza el `$or` de especie. Al buscar puede aparecer una porcina adulta. Componer condiciones mediante `$and`; no afecta aislamiento de organización, sí exactitud del conjunto.

Estas fórmulas son indicadores internos; esta auditoría no valida umbrales veterinarios ni transforma recomendaciones automáticas en diagnósticos.

### 4.2 Pesajes, engorde, destete y genealogía

- GMD elemental: `(peso final − inicial) / días`, conserva pérdidas, no divide intervalos nulos. `crecimiento-pesajes` promedia GMD individuales; lote/consolidado ponderan por animal-días. Son poblaciones/ponderaciones distintas, no cifras necesariamente iguales.
- LE-13 está corregido en el árbol local: detalle y protocolos consolidados filtran pesajes desde `pertenencia.fechaEntrada` y hasta salida cuando existe. El consolidado consulta pertenencias activas. IEE de `/engorde` opera por objetivo `ENGORDE` y fechas de permanencia, no por membresía de lote: no confundir estos dos reportes.
- ICP normaliza intervalos por meta de etapa y pondera por animal-días. La etapa se toma del primer pesaje del intervalo, luego del último o del animal como respaldo; **no subdivide automáticamente un intervalo en la fecha exacta de un cambio de etapa**.
- IEE: 60% cumplimiento GMD, 25% eficiencia de tiempo y 15% supervivencia; repondera componentes disponibles y requiere crecimiento utilizable. No incorpora conversión alimenticia ni margen económico.
- Peso bovino equivalente: `PN + (PD − PN) × 205 / edadDestete`, solo entre 160–250 días con datos completos. Ejemplo PN30, PD230 a 200 días: **235 kg**. No ajusta por sexo, edad de madre o grupo contemporáneo. La UI debe conservar «equivalente», no prometer mérito genético.
- Porcinos: peso de camada a 21 días mediante tabla 14–28 días; promedio individual ponderado por destetados con peso. Sin registros/peso, los promedios son `null`, sin división inválida.
- Raza describe inventario presente; descendencia usa vínculos internos y DIIO de respaldo, no prueba de paternidad. Animales sin nacimiento no generan edad confiable; algunos reportes los omiten, no existe una convención universal «Sin dato».

### 4.3 Finanzas y camadas

Fuente: `getFinanzasCria`, `getSustentabilidadCria`, `getReporteEconomicoCamadas` y [finanzas-calculos-service.js](backend/services/finanzas-calculos-service.js).

- CRC/USD se separan en `monedas`; no hay conversión automática. Patrimonio mostrado es valor estimado del hato activo, separado de inversión operativa histórica. La corrección evita sumar dos veces compra del hato/inversión.
- F07 está corregido: compra prioriza `montoCompra`, incluso cero. Ventas nuevas guardan `precioVentaPorKg = montoAsignado / peso`, de modo que multiplicarlo recupera el ajuste. No se confirma una pérdida de descuentos en ventas nuevas. Para datos importados/antiguos inconsistentes, el helper no prioriza `montoVenta`; queda como riesgo de calidad de datos, no como fallo confirmado del flujo actual.
- **RP-09 (P1): inventario inicial financiero incorrecto.** `animalesInicioPeriodo` excluye vendidos/muertos actuales y usa `createdAt`. Un animal comprado antes del inicio y vendido el 15 de octubre desaparece del inventario del 1 de octubre. El «crecimientoHato» no reconstruye entradas/salidas históricas.
- **RP-10 (P1): margen extrapolado.** Costo mensual = gastos operativos del período / animales considerados / meses del período. Luego se multiplica por **toda** la permanencia del vendido. Caso aislado: CRC100 de octubre asigna más de CRC900 a un animal ingresado en enero. No es margen bruto contable ni costo real de alimentación; incluye compras/planilla consideradas operativas, no consumo efectivo. Se necesita historial de costos o etiqueta inequívoca de proyección y cobertura.
- **RP-11 (P1): economía de camadas cruza cohortes.** Camadas por nacimiento, movimientos por fecha financiera; un gasto directo de otra camada entra por `referenciaModelo: Camada`/texto y se trata como indirecto de las seleccionadas. El costo se distribuye igualitariamente entre camadas, no por días de maternidad/lactancia. Con cero destetados devuelve cero; puede ocultar ausencia del denominador. Mantener directos fuera de cohorte separados y explicitar criterio de indirectos/cobertura.
- La deduplicación de movimientos por `_id` y distribución de centavos sí están implementadas. No persiste el antiguo fallback «directo || promedio» de la documentación.
- ICRP usa camadas con fecha de destete real o estado Destetada/Vendida/Cerrada. Pondera 30/45/25 el cumplimiento de nacidos vivos, destetados y supervivencia respecto a metas. El resumen básico incluye abiertas y no equivale al ICRP. Las consultas por fecha de nacimiento no excluyen sistemáticamente camadas canceladas: revisar su tratamiento antes de interpretar resultados históricos.

### 4.4 Potreros, forraje, sanidad y productos

- Potrero: usa rotaciones Activa/Finalizada, recorta tramos al período y separa Planificada. Densidad = animales promedio / ha; presión acumulada = animal-días / ha. No son intercambiables. Cobertura se segmenta históricamente; área y otros atributos del potrero siguen siendo actuales. Los datos históricos solapados requieren saneamiento: la suma de ocupaciones no hace unión geométrica de intervalos.
- Forraje: kilos verdes reales de cortes; materia seca solo donde existe dato. Rendimiento del período divide por superficie actual de bancos con cortes, no por toda la superficie de finca ni una superficie histórica. Promedio de rendimiento por corte es simple. No equivale a consumo, digestibilidad ni crecimiento del ganado.
- Sanidad: cuenta aplicaciones/documentos y animales vinculados, no dosis equivalentes ni eficacia. Tratamientos y próximos planes tienen ventanas distintas del flujo de aplicaciones. `$lookup` de animales no añade por sí mismo filtros tenant; ver defensa pendiente en sección 7.
- Productos: importes por moneda; cantidad física por normalización de presentación/unidad. Comprar insumos no prueba consumo ni costo atribuible a un animal. Agrupar categorías/unidades heterogéneas exige interpretar cantidades por unidad, no sumar «kg + litros» como magnitud física.

### 4.5 Fechas y filtros

- **RP-15 (P1): límites UTC para instantes locales.** `crearFiltroFechas`, índices y multi-finca cierran el día en UTC. Octubre incluye 30-septiembre 20:00 CR y excluye 31-octubre 20:00 CR. Para campos que representan una fecha civil guardada convencionalmente a medianoche UTC, el filtrado puede ser coherente: el defecto afecta su uso indistinto con timestamps reales. Definir el contrato por campo antes de migrar datos.
- En lotes, el reporte usa `setHours` del servidor; otros servicios usan UTC y las operaciones recientes de lotes convierten desde Costa Rica. Cambiar TZ del servidor no resuelve todos los formatos.
- Índices/multi-finca rechazan rangos inválidos con 400; el helper genérico no valida y puede provocar 500 de casting o devolver vacío en rango invertido.
- **RP-19 (P2): filtros aparentes.** El frontend envía `especie` a finanzas/sustentabilidad pero los controladores solo leen fechas. Raza es inventario actual. No hay contrato universal para `loteId`, `potreroId`, sexo y período: enviar parámetros ignorados no filtra. Documentar soporte por endpoint y rechazar filtros incompatibles. Un `loteId` ajeno ignorado no demuestra acceso a ese lote.

## 5. Exportaciones

Fuentes: [consolidacionMultiFinca-controller.js](backend/controllers/consolidacionMultiFinca-controller.js), [cierreConsolidado-export-service.js](backend/services/cierreConsolidado-export-service.js), `GestionConsolidacionPremium.js`.

| Salida | Implementación | Evaluación |
|---|---|---|
| Consolidado vivo XLSX | `xlsx`, cinco hojas | Incluye Finanzas por moneda y evolución; columnas CRC explícitas por finca. Resumen aún contiene alias escalares sin etiqueta monetaria además de filas por moneda |
| Cierre histórico XLSX | `xlsx`, cuatro hojas | Resumen/Fincas solo alias CRC; omite desglose USD allí. Evolución puede conservar USD; no afirmar que desaparezca de todo el archivo |
| Cierre histórico PDF | `pdfkit`, A4 horizontal | Nombre del cierre y período, comparativo con nombres de finca; faltan identificación explícita de organización, moneda y fecha de generación |
| CSV / PDF de reportes individuales | No encontrado | No documentarlo como disponible |

**RP-14 (P1): presentación histórica financiera incompleta.** El snapshot JSON sí conserva `.monedas`; exportadores de cierre y modal leen `.ingresos/.egresos/.balance` (alias CRC). Con CRC100/USD250, el resumen solo muestra 100 sin moneda. No es suma CRC+USD: es omisión y etiquetado ambiguo. Reutilizar el desglose del consolidado vivo en ambos exportadores y UI.

**RP-17 (P2): maquetación PDF.** Cada título de columna usa `documento.y` después del anterior: los ocho encabezados quedan a ocho alturas distintas, reproducido con PDFKit real instrumentado. Las filas tienen incremento fijo 18 aunque el nombre envuelva varias líneas. Hay salto de página a y>520, pero sin repetir encabezados ni medir altura de fila. El caso simple genera PDF y termina; no se demuestra bucle infinito.

Las fechas de resumen/cierre se exportan como cadenas localizadas, no como celdas Date; las de metas del XLSX vivo pasan como Date a `xlsx`. No existe política homogénea de tipo/formato. `toLocaleDateString('es-CR')` selecciona idioma, **no fija zona horaria**. Revisar tanto la fecha civil como el instante antes de formatear (RP-15/RP-17).

Toda exportación encontrada está tras autenticación + `reportes.ver` + Premium. No hay ruta pública alternativa ni bypass Esencial confirmado.

## 6. Consolidación multi-finca

Fuente: [reporteMultiFinca-service.js](backend/services/reporteMultiFinca-service.js), [accesoFinca-service.js](backend/services/accesoFinca-service.js), controlador de consolidación y `CierreConsolidado`.

- La membresía autenticada determina fincas activas accesibles. IDs solicitados no accesibles son rechazados. La omisión de aislamiento de finca en agregaciones mantiene aislamiento de organización y añade selección explícita de fincas.
- Inventario pondera peso por animales con dato. Finanzas agrupa finca+moneda y respeta `excluirConsolidacion` en ingresos/egresos/evolución. Transferencias se muestran aparte, sin sumar ambas piernas al resultado externo.
- **RP-12 (P1): cierre no representa inventario al corte.** Seleccionar 2020 consulta `Animal.estado: Activo` y `pesoActual` hoy; tratamientos activos también son actuales. Crear un cierre guarda esa mezcla de stocks actuales y flujos de 2020. Además, el reporte se arma con consultas paralelas sin lectura snapshot transaccional. Un snapshot persistido es estable después de guardado, pero no prueba una fotografía consistente al cierre económico.
- **RP-13 (P1): destetes porcinos colectivos ausentes.** La consolidación usa `Animal.fechaDestete`; no consulta Camada. Diez lechones destetados colectivamente pueden verse en reporte porcino y cero en Premium. La reproducción prueba que el camino solo consulta Animal; no se simula una base de datos completa. Definir agregado por especie y evitar duplicación al individualizar.
- La finca del destete individual usa `HistorialFincaAnimal` vigente en esa fecha; si falta historia se usa finca actual. Su cobertura condiciona exactitud histórica.
- Participación financiera y metas numéricas de ingresos/egresos usan alias CRC; no hay meta por moneda. Finanzas no filtra especie aunque el inventario sí. Traslados consolidados suman entradas de fincas seleccionadas, no todos los movimientos de salida de ese subconjunto.
- Cierres: guardan datos, listan sin el bloque pesado y ofrecen detalle, PDF y XLSX. No tienen ruta de edición del snapshot. La clave única incluye alcance y período. Se exige acceso a **todas** sus fincas para detalle/exportación. Si una finca deja de estar activa, su cierre puede dejar de ser accesible mediante la selección actual: revisar política histórica.
- **RP-18 (P2): detalle limitado y no conciliable.** Máximo 200 registros sin total/cursor/aviso; finanzas incluye movimientos `excluirConsolidacion` que el KPI excluye. El detalle no permite auditar por suma el total mostrado. Añadir paginación, total y criterio externo/interno explícito.

## 7. Seguridad, planes y rendimiento

La tabla de la sección 2 cubre cada ruta y guard. Resumen de resultados:

| Superficie | Protección efectiva | Resultado de revisión |
|---|---|---|
| Reportes básicos | Sesión + finca autorizada + reportes.ver | No es fuga de plan mostrar resúmenes operativos previstos en Esencial |
| Analítica productiva | Lo anterior + feature productiva y vigencia | No se encontró ruta avanzada sin guard |
| Analítica económica | Lo anterior + feature económica y vigencia | No se encontró bypass Esencial por URL |
| Multi-finca y exportaciones | Premium vigente + membresía/fincas autorizadas | Sin P0 confirmado; falta prueba HTTP contra MongoDB en esta auditoría |
| Metas/cierres/configuración, escritura | Además reportes.configurar | Administrador |
| Roles de lectura | Administrador, Contador, Consulta | Consulta sí puede leer destinos-resumen: usa reportes.ver, no finanzas.ver |
| Resumen general | Proyección de partos avanzados por feature | Revisada en backend, no solo pestaña oculta |
| Lotes operativos | proyectarDetalleLotePorPlan en listado/detalle/mutaciones locales | La corrección existente evita GMD/metas avanzadas en Esencial |
| Resumen de ventas | Proyección servidor por analiticaEconomica | Origen/rotación bloqueados sin Pro |
| Contexto Mongoose | Plugin añade organización y finca a find/count/aggregate | Hook agregado verificado aisladamente; contexto proviene de autenticación |

El primer `$match` visible en cada controlador no tiene por qué contener tenant: el hook `aplicarOrganizacionAggregate` lo antepone en ejecución (excepto posición 1 si hay `$geoNear`). No reportar falsa fuga por inspeccionar únicamente el pipeline declarado. `omitirAislamientoFinca` no elimina `organizacionId`.

Pendientes de defensa, **sin explotación confirmada**: `$lookup` hacia animales en reporte sanitario no hereda automáticamente el plugin del modelo unido; con referencias corruptas debe probarse rechazo/filtrado de la unión. El último pesaje global usado para alertas de crecimiento omite finca para IDs de animales actuales; conviene especificar acceso a información histórica de una finca anterior no autorizada. Ambos requieren pruebas de datos y política, no se clasifican como P0 observado.

**RP-16 (P2): costo de consulta.** Dashboard descarga arrays completos; `Reportes.js` arma 22 posiciones en `Promise.all` (no siempre 22 HTTP, según features/especie) y luego solicita lotes. Cada lote del reporte calcula detalle, pertenencias, pesajes y otros bloques. Varios análisis cargan historial completo y agrupan en Node sin paginación. No se encontró timeout de reporte o caché compartida. No afirmar que «todas las consultas son find({}) global»: están aisladas por plugin, pero pueden ser ilimitadas dentro de la finca.

Hay índices tenant simples y `{organizacionId,fincaId,createdAt}`, más índices específicos en pesajes/fechas/estado. Eso no garantiza un plan eficiente para cada `$match` por tenant+fecha del hecho. Validar `explain('executionStats')` con datos representativos antes de agregar índices compuestos. El listado por producto ya pagina: evitar generalizar que ningún reporte lo hace.

**RP-20 (P2): manejo de fallos/actualización.** Un rechazo de `Promise.all` impide aplicar las otras respuestas. Dashboard solo registra consola; Reportes muestra error general, sin aislar panel afectado. Puede conservar datos previos mientras cambia finca/período. Separar estado de carga/error por panel, invalidar datos al cambiar alcance y mostrar fecha de actualización.

## 8. Plan de acción priorizado

| ID | Prioridad | Acción y criterio de aceptación |
|---|---|---|
| RP-01 | P1 | Adaptar tarjetas a monedas; CRC500 y USD20 se muestran separados y nunca como cero por contrato roto |
| RP-02 | P2 | Contadores por especie/animal único y ventana explícita FPP; cerda no cuenta como vaca, límites temporales probados |
| RP-03 | P1 | Nacimientos/destetes reales; una fecha programada sin ejecución no aumenta KPI |
| RP-04 | P1 | Excluir ciclos cancelados/no gestantes e inactivos; probar FPP conservada tras cancelar |
| RP-05 | P1 | fechaMuerte y cobertura; editar animal no cambia el mes de mortalidad |
| RP-06 | P1 | Cohortes/denominadores históricos y null sin evidencia; vender hoy no altera tasa histórica |
| RP-07 | P1 | Parto–concepción, corte histórico y ventana posparto configurada; no confundir días desde parto |
| RP-08 | P1 | Componer especie y búsqueda con AND; búsqueda de DIIO porcino no entra en bovinos |
| RP-09 | P1 | Reconstruir inventario inicial/final con hechos; vendido a mitad del período sí existe al inicio |
| RP-10 | P1 | Costo observado por período o proyección explícita; no presentar extrapolación como margen realizado |
| RP-11 | P1 | Separar directos fuera de cohorte y definir indirectos; conciliación por moneda y cobertura de destetados |
| RP-12 | P1 | Separar stocks actuales del cierre al corte y lectura consistente; mismo corte produce inventario histórico correcto |
| RP-13 | P1 | Agregar destetes colectivos sin duplicación; comparar Camada, Animal y Premium |
| RP-14 | P1 | Monedas en modal/PDF/XLSX históricos; mismos totales CRC/USD que snapshot |
| RP-15 | P1 | Contrato fecha civil/instante y validación uniforme; probar ambas medianoches de Costa Rica y rango invertido |
| RP-16 | P2 | Resumen agregado, paginación, presupuestos de consulta y carga medida con 5.000 animales |
| RP-17 | P2 | PDF con filas de altura dinámica/encabezados repetidos y XLSX con fechas/monedas tipadas |
| RP-18 | P2 | Detalle paginado con total y filtro conciliable con KPI |
| RP-19 | P2 | Filtros soportados explícitos en API/UI; rechazo o explicación cuando especie/lote no aplica |
| RP-20 | P2 | Estados por panel, invalidación de datos y actualización visible al cambiar finca/período |

Orden sugerido: contrato de datos dashboard → hechos reproductivos → cálculos/cohortes financieros → stocks/cierres/monedas → fechas → UX y rendimiento. Convertir reproducciones a regresiones con expectativas corregidas a medida que se remedie. Ejecutar además integración HTTP con dos organizaciones, dos fincas y los cuatro planes, incluyendo IDs ajenos, suscripción suspendida y acceso histórico; esta auditoría no sustituye esa integración.

Documentación sincronizada: [reportes.md](backend/documentation/reportes.md), [indices-productivos.md](backend/documentation/indices-productivos.md) y [consolidacion-multifinca.md](backend/documentation/consolidacion-multifinca.md). Los cambios documentales describen implementación y pendientes; no declaran los hallazgos resueltos.

## Estado de remediación

| Hallazgo | Corrección aplicada | Archivos | Prueba que lo cubre |
|---|---|---|---|
| RP-01 | Dashboard consume `monedas.CRC/USD`, oculta monedas vacías y diferencia ausencia de movimientos de cero real. | `ListaUsuario.js`, `finanzas-calculos-service.js` | `dashboard recibe contrato de sustentabilidad por moneda y sin extrapolación` |
| RP-02 | Vacas y cerdas se cuentan por separado; preñadas y próximos partos son bovinos únicos, activos, confirmados y con ventana de 30 días. | `ListaUsuario.js` | Contrato validado por build y suite de reportes/especies. |
| RP-03 | Destetes bovinos usan `Animal.fechaDestete`; porcinos exigen `Camada.fechaDesteteReal` dentro del período. | `reporte-controller.js`, `productividadCria-service.js` | `el endpoint de productividad porcina calcula camadas sin mezclar bovinos` |
| RP-04 | La preñez exige diagnóstico positivo y ciclo activo; cancelar limpia confirmación y FPP residual. | `reporte-controller.js`, `reproduccion-service.js` | `un diagnóstico VACIA cierra el ciclo y no recalcula una fecha de parto` |
| RP-05 | Mortalidad usa `fechaMuerte`; migración idempotente recupera solo fechas respaldadas por EventoAnimal. | `reporte-controller.js`, `completarFechaMuerteDesdeEventos.js` | `migración de fecha de muerte usa solo eventos confiables y es idempotente` |
| RP-06 | Tasas bovinas usan población histórica y animales-día; sin denominador devuelven falta de datos. | `reporte-controller.js`, `poblacionHistorica-service.js` | `la población histórica no cambia por una venta posterior al corte` |
| RP-07 | Espera posparto configurable, 45 días por defecto, con grupo separado y datos solo hasta el corte. | `ConfiguracionProductiva.js`, `configuracionProductiva-service.js`, `ReporteIndicesProductivos.js`, `reporte-controller.js` | Suite de reportes y build frontend. |
| RP-08 | Filtro bovino y búsqueda se componen con `$and`; la maternidad admite vínculo canónico o DIIO legado. | `reporte-controller.js` | Suite `reporteEspecies-controller.test.js`. |
| RP-09 | Inventarios inicial/final se reconstruyen al corte; entradas/salidas se concilian y cualquier diferencia se advierte. | `reporte-controller.js`, `poblacionHistorica-service.js`, `Reportes.js` | `animales-día reparte exactamente la presencia entre fincas` |
| RP-10 | Se eliminó la extrapolación vitalicia; quedan costo por animal del período, animales-día y balance real por moneda. | `reporte-controller.js`, `Reportes.js`, `ListaUsuario.js` | `dashboard recibe contrato de sustentabilidad por moneda y sin extrapolación` |
| RP-11 | Directos de camadas fuera de cohorte se excluyen; indirectos y cobertura quedan explícitos; sin destetes el costo unitario es `null`. | `finanzas-calculos-service.js`, `reporte-controller.js`, `Reportes.js` | `economía de camadas no reparte directos de otra cohorte` |
| RP-12 | Inventario multi-finca se calcula a fecha final y se congela; cierres nuevos son `historico-v2`, legados solo se regeneran por acción administrativa. | `reporteMultiFinca-service.js`, `CierreConsolidado.js`, `consolidacionMultiFinca-controller.js`, `GestionConsolidacionPremium.js` | `la exportación histórica usa exclusivamente el snapshot guardado` |
| RP-13 | Premium suma destetes colectivos y omite individuales cuyo `camadaOrigen` ya está representado. | `reporteMultiFinca-service.js` | Suite `reporte-multi-finca.test.js` y detalle conciliable. |
| RP-14 | Modal, XLSX y PDF muestran bloques/columnas CRC y USD, incluyendo compatibilidad con cierres legados. | `cierreConsolidado-export-service.js`, `GestionConsolidacionPremium.js` | `la exportación histórica usa exclusivamente el snapshot guardado` |
| RP-15 | Se separó fecha civil de instante local CR, con rangos invertidos como 400 y formato UTC estable para fechas civiles. | `fechaZonaHoraria-service.js`, controladores de reportes | `fechas civiles e instantes locales tienen contratos distintos y validan rangos` |
| RP-16 | Reportes carga el bloque inicial y difiere complementarios hasta acercarse al viewport; cada lote máximo usa cuatro peticiones. | `Reportes.js` | Build frontend y revisión de `Promise.allSettled`. |
| RP-17 | Filas PDF miden altura máxima, comparten coordenada, repiten encabezado; XLSX conserva fechas reales y monedas tipadas. | `cierreConsolidado-export-service.js` | `todos los encabezados PDF usan la misma coordenada vertical` |
| RP-18 | Detalle admite página/límite/total, usa inventario al corte y excluye finanzas fuera de consolidación. | `consolidacionMultiFinca-controller.js` | Suite `consolidacion-multifinca.test.js`. |
| RP-19 | Finanzas deja de recibir especie no atribuible y declara alcance de finca; filtros productivos conservan especie. | `Reportes.js` | Build frontend y contratos por endpoint. |
| RP-20 | Datos previos se invalidan al cambiar alcance; fallos se aíslan por panel, admiten reintento y muestran hora de actualización. | `Reportes.js` | Build frontend; un rechazo ya no cancela las respuestas restantes. |
