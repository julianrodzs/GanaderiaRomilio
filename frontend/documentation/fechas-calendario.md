# Fechas de calendario en Potreros y Finanzas

## Causa

Los inputs `date` y MongoDB intercambian el dia como `YYYY-MM-DD` o como
`YYYY-MM-DDT00:00:00.000Z`. Los formularios recuperaban el dia UTC mediante
`toISOString().slice(0, 10)`, pero las tablas usaban `toLocaleDateString()` sin
zona explicita. En Costa Rica, la medianoche UTC corresponde a las 18:00 del
dia anterior. Por eso un formulario mostraba 07/11 y la tabla 06/11.

## Contrato

- `utils/fechasCalendario.mjs` obtiene el mismo dia UTC que los formularios
  existentes y lo presenta como `DD/MM/YYYY`, sin conversion horaria local.
- Se utiliza en las rotaciones, mantenimiento y detalles de potreros, historial
  de cobertura, cortes de forraje, movimientos financieros y operaciones
  financieras multi-finca. El filtro de rango comparte esa misma clave.
- Valores vacios o invalidos se presentan como `--` y no entran al filtro.
- La fecha inicial de un nuevo movimiento financiero usa el dia local al abrir
  el formulario, no el dia UTC ni el dia en que se cargo el modulo.
- No aplicar este helper a instantes como `createdAt`, auditoria o fecha/hora
  de envio: estos conservan su conversion de zona horaria correspondiente.
- No se alteran registros, esquemas, periodos, estados ni calculos del backend.
  No es necesaria una migracion ni cambiar Render o MongoDB.

## Verificacion

`npm test` incluye la reproduccion del 07/11/2026 y 12/11/2026, ida y vuelta del
formulario, filtros inclusivos, datos invalidos y procesos con cinco zonas
horarias, cambios de horario, fin de anio y anio bisiesto.

`node tests/operacionesMultifinca.navegador.mjs` verifica las fechas de una
operacion ficticia en Edge con zonas UTC-6 y UTC+14 y cinco anchos de pantalla.
La prueba no usa MongoDB, correos ni servicios de produccion.
