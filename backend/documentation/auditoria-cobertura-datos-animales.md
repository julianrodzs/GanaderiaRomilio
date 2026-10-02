# Auditoría de cobertura de datos bovinos y porcinos

Fecha de revisión: 02/10/2026.

## Alcance

Esta es una auditoría estática del modelo `Animal`, las vistas de inventario/detalle y los endpoints bajo `/api/reportes`. Distingue entre datos con reporte, datos usados parcialmente en cálculos y datos que solo se consultan en pantalla. No mide todavía la completitud de los registros de cada cliente.

## Cobertura actual

| Dato | Bovinos | Porcinos | Cobertura de reporte | Estado |
| --- | --- | --- | --- | --- |
| Especie, sexo, categoría y estado general | Inventario y detalle | Inventario y detalle | Resumen de inventario y distribución | Cubierto |
| Pesos y pesajes | Detalle e historial | Detalle e historial | Crecimiento, engorde e índices productivos | Cubierto |
| Compra y venta | Detalle/origen | Detalle/origen | Compras de animales, ventas, rotación y finanzas | Cubierto |
| Lote y potrero actual | Inventario y detalle | Inventario y detalle | Lotes, carga, movimientos y rendimiento de potreros | Cubierto |
| Aplicaciones y tratamientos sanitarios | Sanidad y bitácora | Sanidad y bitácora | Aplicaciones, naturaleza, productos y tratamientos | Cubierto |
| Raza y composición | Detalle y formulario | Detalle y formulario | `/api/reportes/razas` por especie, grupo y detalle | Cubierto con este cambio |
| Nacimiento y destete | Detalle y reproducción | Camadas y detalle | Productividad bovina y reportes de camadas | Cubierto |
| Genealogía y descendencia | Padres, árbol y detalle | Padres, camada origen y detalle | Descendencia dedicada solo para bovinos; camadas cubren el origen productivo porcino | Parcial |
| Objetivo productivo | Inventario, filtro, lote y formularios | Inventario, filtro, lote y formularios | Se usa para seleccionar engorde y validar lotes, pero no existe distribución completa por objetivo | Brecha alta |
| Estado sanitario actual | Inventario, filtro y detalle | Inventario, filtro y detalle | Sanidad reporta hechos y tratamientos, no el corte actual Sano/Observación/Enfermo/Recuperación | Brecha alta |
| Etapa productiva porcina | Inventario, pesajes y lotes | Formulario y detalle operativo | Se usa en índices de engorde, pero no existe distribución ni transición por fase | Brecha media |
| Registro y observaciones genealógicas | Detalle | Detalle | No existe listado/exportación específica | Brecha baja |
| Descripción y observaciones generales | Detalle | Detalle | No tienen reporte; son texto operativo no comparable | Sin KPI recomendado |
| Fotografía | Detalle | Detalle | No corresponde a un reporte tabular o indicador | Sin reporte necesario |

## Hallazgos prioritarios

1. **Distribución por objetivo productivo.** Falta responder cuántos animales activos están en `ENGORDE`, `REPRODUCCION`, `REEMPLAZO`, `OTRO` y `SIN_DEFINIR`, separados por especie, sexo, categoría y lote. También serviría como control de calidad para reducir `SIN_DEFINIR`.
2. **Estado sanitario actual.** El reporte sanitario histórico está bien separado de la condición presente, pero falta una fotografía actual por especie y estado sanitario, con acceso a animales afectados y distinción de tratamiento activo.
3. **Etapas porcinas.** Conviene reportar existencias y peso promedio por `Fase 1`, `Fase 2`, `Fase 3`, `Desarrollo` y `Engorde`. Una futura versión puede medir días y transiciones por fase si se crea historial; el valor actual de `Animal.etapaProductiva` por sí solo no permite reconstruir transiciones.
4. **Genealogía porcina individual.** La camada cubre gran parte del análisis porcino, pero los porcinos individualizados no tienen un equivalente al reporte de descendencia bovina. Debe decidirse si aporta valor antes de duplicar el reporte.

## Datos que no deben forzarse a un KPI

`observaciones`, `observacionesGenealogicas`, nombres externos y fotografías son evidencia contextual. Deben conservarse, buscarse y eventualmente exportarse, pero agregarlos como conteos no produciría una decisión productiva confiable.

## Siguiente orden recomendado

1. Reporte de objetivo productivo y pendientes `SIN_DEFINIR`.
2. Corte actual de estado sanitario y tratamiento activo.
3. Inventario porcino por etapa productiva.
4. Validar con usuarios si necesitan descendencia porcina individual o si camada + genealogía de reproductores es suficiente.
