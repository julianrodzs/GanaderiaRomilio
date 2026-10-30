# Banco de semen por finca

## Inspeccion y decisiones de arquitectura

El inventario anterior no estaba aislado por campana: `InsumoReproductivo` ya tenia
aislamiento por organizacion/finca. Las campanas descontaban directamente de esa
existencia compartida. Crear un insumo no generaba un movimiento financiero.

| Modelo/endpoint anterior | Adaptacion |
| --- | --- |
| `InsumoReproductivo`, `/api/iatf/insumos` | Conserva hormonas y dispositivos. Rechaza nuevas altas/ediciones SEMEN y las remite al banco. |
| Categoria SEMEN legada | Se conserva para compatibilidad y migracion; no se borra. `bancoSemenId` identifica el origen ya migrado. |
| `consumirSemen` | Resuelve el banco y descuenta reserva de campana o gaveta reproductiva. Mantiene compatibilidad individual con existencias no migradas. |
| `RegistroReproductivo` | Agrega referencia de banco sin cambiar referencias antiguas; snapshot conserva costo, moneda, DIIO y paternidad. |
| `CampanaIATF` | Reserva explicita de uno o varios sementales. Finalizacion/cancelacion devuelve sobrantes en transaccion. |
| Metricas IATF | Usa unidades realmente utilizadas de asignaciones y costo aplicado; mantiene fallback de snapshots historicos no migrados. |
| Herencia de paternidad | Usa `toroId` de la ficha interna; para externos conserva nombre/DIIO sin vincular por coincidencia a otro macho. |
| Finanzas | Venta de pajillas genera ingreso automatico protegido; anular crea contramovimiento sin borrar original. |

No se crea una bodega general, un documento por pajilla ni un segundo inventario
activo de semen. `BancoSemen` reemplaza el concepto SEMEN; los otros cuatro modelos
representan entradas, reservas, movimientos y ventas, no existencias duplicadas.
El lote de semen identifica una entrada de producto, no un lote de animales.

## Planes, permisos y ubicacion

- Banco, reservas y ventas requieren `iatfReproductivo`, habilitado hoy en Pro/Premium.
- IATF > Banco de semen: consulta y ficha; entradas/ajustes segun permiso de configurar IATF.
- Detalle de campana > Semen asignado / devolver sobrantes: cantidades por toro y moneda.
- Ventas > Pajillas: gaveta comercial, movimientos, venta y anulacion segun permiso de ventas.
- Reproduccion individual y bandas porcinas pueden consumir la gaveta reproductiva.
- Anular una inseminacion requiere permiso, motivo y consumo trazable. Se rechaza
  si hay resultados posteriores; no debe confundirse con cancelar un ciclo que si ocurrio.

## Saldos y costos

Se comprueba en cada escritura:

```
totalIngresado = stockReproductivo + stockComercial + asignadoCampanas
              + totalUsadasIATF + totalVendidas + totalMermas
```

Los acumulados son netos de sus reversiones; los movimientos originales permanecen.
`totalUsadasIATF` incluye uso reproductivo individual/porcino para mantener el mismo
invariante, aunque la etiqueta tecnica provenga de IATF.

Los saldos y valores se separan en CRC/USD. El costo promedio se calcula por gaveta
y moneda; las reservas congelan el costo de esa asignacion. Reponer posteriormente
no cambia costos de inseminaciones anteriores. Una venta puede cobrarse en USD
usando existencias cuyo costo esta en CRC: no se convierte ni suma ambas monedas.
Si hay stock de ambos costos, es obligatorio indicar `monedaStock`.

La entrada registra costo de existencias, no acredita un pago ni genera otro egreso
automatico. Para compras/colectas con gastos, usar el movimiento real en Finanzas;
se puede vincular su ID con `movimientoFinancieroId`, verificando finca/moneda.
No debe duplicarse un gasto por registrarlo tambien como entrada al banco.

Traslados, consumos, ventas, reversiones y ajustes operan en transaccion. Descuentos
condicionales impiden saldos negativos. Las reservas toman un bloqueo de escritura
en campana para impedir que un cierre concurrente deje unidades atrapadas.
Los movimientos son inmutables y tienen idempotencia parcial solo para claves string.
El frontend mantiene la clave del formulario al reintentar; las operaciones del banco
requieren conexion, no se agregan a la cola de edicion offline.

## API

| Metodo y ruta | Funcion |
| --- | --- |
| `GET /api/semen` | Fichas de la finca; filtro opcional `especie`. |
| `GET /api/semen/:id` | Ficha e historial. |
| `POST /api/semen/entradas` | Compra/colecta, todo reproductivo, comercial o dividido. |
| `POST /api/semen/:id/traslados` | Traslado con motivo, sin efecto financiero. |
| `POST /api/semen/:id/ajustes` | Entrada justificada o merma; conserva movimientos. |
| `GET/POST /api/iatf/campanas/:id/semen` | Consultar/asignar reservas. |
| `POST /api/iatf/campanas/:id/semen/devolver` | Devolver todo el saldo sin usar. |
| `POST /api/iatf/campanas/:id/inseminaciones/:participanteId/anular` | Anular consumo trazable sin diagnosticos/parto posteriores. |
| `POST /api/reproduccion/:id/inseminacion/anular` | Equivalente individual, sin campana. |
| `GET/POST /api/ventas/pajillas` | Historial/venta. |
| `GET /api/ventas/pajillas/resumen` | Ingreso neto del mes por moneda, incluyendo reversiones en su fecha contable. |
| `GET /api/ventas/pajillas/existencias` | Banco para roles comerciales autorizados. |
| `POST /api/ventas/pajillas/:id/anular` | Devuelve stock comercial y revierte ingreso. |

Ejemplo de entrada externa:

```json
{
  "esExterno": true,
  "nombreSemental": "Semental de prueba",
  "diio": "PRUEBA-100",
  "especie": "Bovino",
  "origen": "COMPRA",
  "cantidad": 50,
  "destino": "DIVIDIR",
  "cantidadReproductiva": 30,
  "cantidadComercial": 20,
  "costoUnitario": 100,
  "moneda": "CRC",
  "claveIdempotencia": "referencia-unica-del-formulario"
}
```

Para un macho de la finca enviar `toroId`; sus datos se obtienen en backend.
Para reponer una ficha existente enviar `fichaSemenId`. Sin DIIO externo no se
inventan identidades: elegir expresamente la ficha existente para reponerla.

## Migracion segura

No se aplica automaticamente al arrancar ni al desplegar. Requiere MongoDB con
transacciones, respaldo/restauracion verificados y ventana sin altas/inseminaciones.

Desde backend:

```powershell
npm.cmd run migrate:banco-semen:check
# Revisar discrepancias y respaldo antes de continuar.
npm.cmd run indexes:sync
npm.cmd run migrate:banco-semen
npm.cmd run migrate:banco-semen:check
```

`indexes:sync` revisa todos los modelos y puede retirar indices obsoletos; no
ejecutarlo en produccion sin revisar previamente los indices y plan de despliegue.

El diagnostico usa `autoIndex:false` y `autoCreate:false`; no escribe. El modo aplicar
usa transaccion por existencia y un lote legado unico para poder reanudarse. Agrupa
por macho/DIIO dentro de la finca; sin DIIO usa referencia externa exacta compatible.
No toca hormonas/dispositivos ni los importes de snapshots anteriores.

Solo reconstruye reservas historicas verificadas en participantes/ciclos, evitando
contar dos veces el mismo servicio. Los saldos antiguos eran libres por finca, no
reservas: se ingresan en reproductivo, nunca se atribuyen arbitrariamente a una
campana cerrada o abierta. No hay sobrantes legados reservados que liberar sin
evidencia de esa reserva. Es una diferencia deliberada frente a la premisa del prompt.

Se reportan saldos fraccionarios/negativos, unidades en uso ambiguas, especies
incompatibles, especie no verificable y ciclos de campana sin participante verificable. No se corrigen en
silencio; resolver cada caso antes de migrarlo. La migracion no hace borrados.

## Verificacion

```powershell
npm.cmd test
npm.cmd run test:banco-semen:integracion
node documentation/cierre-smoke-integrado.cjs
```

La integracion crea su propio mongod 8 con replica set y todos los indices. No lee
`.env`, no conecta a Atlas, no envia correos ni realiza cobros. El informe del sprint
debe distinguir este dry-run sintetico de un diagnostico autorizado de la base real.
