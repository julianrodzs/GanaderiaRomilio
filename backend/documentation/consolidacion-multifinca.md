# Consolidación multi-finca

Revisión de implementación: **2026-10-21**. Ver [AUDIT_MODULO_REPORTES.md](../../AUDIT_MODULO_REPORTES.md) para pruebas, catálogo y pendientes. Las limitaciones descritas todavía no están remediadas en código.

## Alcance comercial

La operación multi-finca está disponible desde Gestión. Permite trasladar animales, consultar su pertenencia histórica, registrar transferencias financieras internas y repartir gastos. Premium agrega comparación simultánea, metas, cierres inmutables, detalle por finca y exportación consolidada.

Esencial no ofrece estas operaciones porque admite una sola finca. Pro puede operar sus fincas y analizarlas individualmente; el consolidado simultáneo continúa reservado a Premium.

## Traslado de animales

`POST /api/fincas/traslados` recibe la finca destino, fecha, motivo y animales. La finca origen siempre es la finca activa autenticada.

La operación se ejecuta en una transacción:

1. comprueba acceso a origen y destino;
2. exige animales activos de la finca origen;
3. valida que especie y objetivo estén habilitados en destino;
4. evita colisiones del identificador interno en destino;
5. cierra la pertenencia al lote de origen;
6. limpia lote y potrero actual;
7. cambia `Animal.fincaId` sin duplicar el animal;
8. crea `TrasladoFinca`, `HistorialFincaAnimal` y eventos de salida/entrada.

Compras, ventas, genealogía, pesajes, reproducción y sanidad históricos no se reescriben. Conservan la finca donde fueron registrados. La bitácora puede atravesar únicamente las fincas autorizadas para el usuario.

El peso de traslado es una fotografía del `pesoActual`; no crea un pesaje nuevo. El usuario puede registrar el pesaje formal antes del traslado si necesita precisión de báscula.

## Historial inicial

Los animales existentes se preparan con una pertenencia inicial idempotente, sin crear ruido en `EventoAnimal`:

```bash
npm run migrate:historial-fincas:check
npm run migrate:historial-fincas
```

El primer comando no escribe. El segundo crea únicamente historias ausentes y puede repetirse. Debe ejecutarse después de un snapshot de MongoDB y antes de usar traslados en producción.

## Finanzas internas y compartidas

Una transferencia interna crea dos movimientos enlazados por `grupoConsolidacion`: un egreso en origen y un ingreso en destino. Ambos usan `alcanceFinanciero = TRANSFERENCIA_INTERNA` y `excluirConsolidacion = true`. Son visibles por finca, pero se eliminan del ingreso, egreso y balance consolidados.

Un gasto compartido se convierte en un movimiento real por finca. Puede distribuirse en partes iguales, porcentajes que sumen 100 o montos cuya suma coincida exactamente con el total. Los ajustes de centavos se asignan a la última finca, evitando pérdida o duplicación.

Los movimientos históricos sin `alcanceFinanciero` se consideran externos por compatibilidad. No requieren migración.

## Monedas

El cálculo consolidado agrupa CRC y USD por separado y no convierte automáticamente. Los bloques `monedas` conservan los importes; los campos escalares ingresos/egresos/balance son alias de **CRC**. Una conversión futura requerirá tipo de cambio, fecha y fuente explícitos.

El XLSX vivo incluye desglose por moneda. En cambio, el modal, el PDF y las hojas Resumen/Fincas del XLSX **histórico** leen solo alias CRC y omiten USD en esos totales, sin etiquetado suficiente (RP-14). El snapshot JSON y su evolución pueden contener USD: la omisión está en su presentación, no en la suma del servicio. Las metas y participaciones financieras escalares también usan CRC, sin metas diferenciadas por moneda.

## Reporte Premium

`GET /api/reportes/multi-finca` incluye inventario y participación por finca, peso ponderado, resultado externo por moneda, operaciones internas, reproducción, sanidad, traslados, evolución mensual y metas.

Los destetes **individuales** se atribuyen usando `HistorialFincaAnimal` para encontrar la finca vigente en la fecha real del destete, con respaldo en finca actual si falta historia. El consolidado consulta `Animal.fechaDestete`; no incorpora destetes colectivos de `Camada` (RP-13). Los demás hechos conservan el `fincaId` con el que se registraron.

Inventario, pesoActual y tratamientos activos son del momento de consulta. Finanzas, partos y aplicaciones usan el período. `especie` afecta los conjuntos animales/sanitarios, pero no segrega movimientos financieros. Las fechas se normalizan UTC; para timestamps reales difieren del día de Costa Rica (RP-15).

`GET /api/reportes/multi-finca/detalle` permite navegar a animales, finanzas, partos, destetes, aplicaciones o tratamientos de una finca autorizada.

El detalle limita a 200 documentos sin total/cursor. Finanzas incluye operaciones internas marcadas para exclusión aunque el KPI externo las descarta: no concilia por simple suma del detalle (RP-18).

## Metas y cierres

Las metas pueden pertenecer a toda la organización o a una finca, con período y valores para inventario, peso, finanzas, partos, destetes y sanidad.

Un cierre guarda el reporte calculado y no se recalcula. La clave combina fechas, especie y fincas ordenadas; esto impide cerrar dos veces exactamente el mismo alcance. No hay ruta de edición del snapshot. Cambios posteriores no recalculan el documento histórico.

**RP-12:** eso no equivale a reconstruir existencias al cierre: un cierre de 2020 creado hoy contiene el inventario actual y flujos de 2020. Las consultas que construyen el reporte tampoco comparten una lectura snapshot transaccional. Distinguir fecha de captura y fecha de corte antes de certificar el cierre como histórico.

El detalle histórico está implementado: muestra resumen y tabla de fincas, además de ofrecer PDF/XLSX. La API devuelve el snapshot. Listado, detalle y exportación exigen acceso a todas las fincas del cierre mediante la selección de fincas activas; inactivar una finca puede impedir consultar su cierre con esa política.

Endpoints Premium:

- `GET/POST /api/reportes/multi-finca/metas`
- `DELETE /api/reportes/multi-finca/metas/:id`
- `GET/POST /api/reportes/multi-finca/cierres`
- `GET /api/reportes/multi-finca/cierres/:id`
- `GET /api/reportes/multi-finca/cierres/:id/exportar?formato=pdf|xlsx`
- `GET /api/reportes/multi-finca/exportar`

La exportación XLSX **viva** contiene cinco hojas: resumen, desglose por finca, finanzas por finca y moneda, evolución mensual y metas. Incluye período, especie y fincas usadas como criterios del reporte.

El XLSX histórico contiene cuatro hojas, sin Finanzas por moneda. PDFKit genera el PDF de cierre en A4 horizontal. Se confirmaron encabezados desalineados, altura fija de filas y falta de encabezados al cambiar de página (RP-17). Fechas de cierre se exportan como cadenas localizadas; las metas del XLSX vivo pasan como Date. Falta un contrato uniforme de fechas/tipos y zona horaria; `es-CR` no fija la zona.

Todas estas rutas requieren autenticación, `reportes.ver` y `reportesMultiFinca` de un plan Premium vigente. Escrituras de metas/cierres añaden `reportes.configurar`. IDs de fincas no accesibles se rechazan; agregaciones multi-finca mantienen el aislamiento de organización aunque omitan el de finca individual. No existe una ruta pública alternativa de exportación.

## Infraestructura

Traslados y operaciones financieras pares usan transacciones de MongoDB. Producción debe utilizar un replica set, como MongoDB Atlas. Si la transacción falla, no queda un animal a medio trasladar ni una transferencia financiera con una sola contraparte.
