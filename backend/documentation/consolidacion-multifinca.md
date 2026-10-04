# Consolidación multi-finca

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

CRC y USD nunca se suman entre sí ni se convierten automáticamente. El consolidado, la evolución y el Excel mantienen totales separados por moneda. Una conversión futura requerirá tipo de cambio, fecha y fuente explícitos.

## Reporte Premium

`GET /api/reportes/multi-finca` incluye inventario y participación por finca, peso ponderado, resultado externo por moneda, operaciones internas, reproducción, sanidad, traslados, evolución mensual y metas.

Los destetes se atribuyen usando `HistorialFincaAnimal` para encontrar la finca vigente en la fecha real del destete. Los demás hechos conservan el `fincaId` con el que se registraron.

`GET /api/reportes/multi-finca/detalle` permite navegar a animales, finanzas, partos, destetes, aplicaciones o tratamientos de una finca autorizada.

## Metas y cierres

Las metas pueden pertenecer a toda la organización o a una finca, con período y valores para inventario, peso, finanzas, partos, destetes y sanidad.

Un cierre guarda una fotografía completa del reporte y no se recalcula. La clave combina fechas, especie y fincas ordenadas; esto impide cerrar dos veces exactamente el mismo alcance. Cambios posteriores no alteran el documento histórico.

Endpoints Premium:

- `GET/POST /api/reportes/multi-finca/metas`
- `DELETE /api/reportes/multi-finca/metas/:id`
- `GET/POST /api/reportes/multi-finca/cierres`
- `GET /api/reportes/multi-finca/cierres/:id`
- `GET /api/reportes/multi-finca/exportar`

La exportación XLSX contiene resumen, desglose por finca, finanzas por finca y moneda, evolución mensual y metas. Incluye período, especie y fincas usadas como criterios del reporte.

## Infraestructura

Traslados y operaciones financieras pares usan transacciones de MongoDB. Producción debe utilizar un replica set, como MongoDB Atlas. Si la transacción falla, no queda un animal a medio trasladar ni una transferencia financiera con una sola contraparte.
