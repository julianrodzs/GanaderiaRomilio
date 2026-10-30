# PROMPT PARA CODEX: BANCO DE SEMEN CENTRAL, INTEGRACIÓN CON IATF Y VENTA DE PAJILLAS

## 🎯 OBJETIVO
Hoy el semen se registra dentro de los insumos de cada campaña IATF (categoría SEMEN: nombre, cantidad de pajuelas, costo unitario, moneda, lote, toro, código del toro, raza, tipo de semen → "Agregar existencia"), y las inseminaciones descuentan de ahí. Ese inventario está aislado por campaña.

Hay que reemplazarlo por un **Banco de Semen central por finca**, con una ficha por toro/verraco y dos gavetas (reproductiva y comercial). Las campañas IATF **toman pajillas** del banco y la venta de pajillas consume **solo** la gaveta comercial.

## ⚠️ FASE 0: INSPECCIÓN OBLIGATORIA ANTES DE CAMBIAR CÓDIGO
1. Ubicar los modelos, controladores, servicios y vistas actuales de:
   - insumos de campaña IATF (categoría SEMEN y las demás);
   - el consumo de semen al registrar inseminaciones (IATF y, si existe, inseminación individual en Reproducción);
   - el cálculo de costo por preñez / costo de campaña;
   - la herencia automática de paternidad;
   - el registro financiero actual de la compra de semen (para NO duplicar egresos).
2. Entregar un mapa breve: "modelo/endpoint actual → cómo se adapta". **Reutilizar y extender** las estructuras existentes cuando sea posible; no crear modelos paralelos que dupliquen el concepto.
3. Verificar en qué planes está habilitado hoy IATF y respetar ese mismo control de plan para el banco. La venta de pajillas va en PRO y PREMIUM.

## 🏗️ 1. MODELO DE DATOS

### A. Ficha de semen por semental (`BancoSemen` o extensión del modelo actual)
- `organizacionId`, `fincaId` (obligatorios, indexados).
- `toroId` (ref `Animal`, opcional): macho de la finca. Si viene, se autocompletan nombre, DIIO, raza y especie.
- `esExterno` (boolean). Si es externo: `nombreSemental` y `diio` se escriben a mano.
- `nombreSemental`, `diio` (renombrar en la UI el antiguo "código del toro" a **DIIO**), `raza`, `especie` (`Bovino`/`Porcino`), `tipoSemen` (convencional, sexado, etc., según el enum actual).
- Índice único parcial para evitar fichas duplicadas: por `{organizacionId, fincaId, toroId}` cuando `toroId` exista, y por `{organizacionId, fincaId, diio}` normalizado cuando sea externo con DIIO.
- **Saldos actuales:** `stockReproductivo`, `stockComercial`, `asignadoCampanas` (todos ≥ 0).
- **Acumulados históricos:** `totalIngresado`, `totalUsadasIATF`, `totalVendidas`, `totalMermas`.
- **Invariante que todo servicio debe mantener:**
  `totalIngresado = stockReproductivo + stockComercial + asignadoCampanas + totalUsadasIATF + totalVendidas + totalMermas`.

### B. Lotes de entrada (`LoteSemen`)
- `fichaSemenId`, `origen` (`COMPRA` | `COLECTA_PROPIA`), `fecha`, `loteProveedor`, `canastillaTermo`, `cantidad`, `costoUnitario`, `moneda` (`CRC`/`USD`), `cantidadReproductiva`, `cantidadComercial`.
- Se usa para calcular el costo promedio ponderado por moneda (sin mezclar CRC y USD).

### C. Asignación a campaña (`AsignacionSemenCampana`)
- `campanaId`, `fichaSemenId`, `cantidadAsignada`, `cantidadUsada`, `cantidadDevuelta`, `costoUnitarioAplicado`, `moneda`.
- Disponible en campaña = `asignada - usada - devuelta`.

### D. Movimientos (`MovimientoSemen`): bitácora inmutable
- `tipo`: `ENTRADA_LOTE`, `ASIGNACION_CAMPANA`, `CONSUMO_INSEMINACION`, `DEVOLUCION_CAMPANA`, `TRASLADO_INTERNO`, `VENTA`, `ANULACION_VENTA`, `AJUSTE`, `MERMA`.
- `origen`/`destino`: `EXTERNO`, `REPRODUCTIVO`, `COMERCIAL`, `CAMPANA`, `CLIENTE`, `MERMA`.
- `cantidad`, `motivo` (obligatorio en ajustes, mermas y traslados), `usuarioId`, referencias (`campanaId`, `ventaPajillaId`, `eventoId`), `claveIdempotencia` (string, índice único parcial `$type: 'string'`).
- Nunca se borran movimientos; las correcciones se hacen con movimientos inversos.

### E. Venta (`VentaPajilla`)
- `fichaSemenId`, `nombreSemental` y `diio` desnormalizados, `comprador`, `cantidad`, `precioUnitario`, `moneda` (`CRC`/`USD`), `montoTotal`, `fecha`, `movimientoFinancieroId`, `estado` (`Completada`/`Anulada`), `motivoAnulacion`, `fechaAnulacion`.

## ⚙️ 2. OPERACIONES (todas en transacción y con `{ session, ordered: true }` en creates múltiples)
Los descuentos de stock se hacen con un update condicional atómico (por ejemplo `findOneAndUpdate({ _id, stockReproductivo: { $gte: n } }, { $inc: ... })`) para evitar sobregiros por concurrencia o por sincronización offline. Si no hay saldo suficiente, responder `400` con el disponible.

1. **Entrada rápida en lote** `POST /api/semen/entradas`
   - Elegir un toro de la finca o uno externo, cantidad total y destino: `TODO_REPRODUCTIVO`, `TODO_COMERCIAL` o `DIVIDIR` (validar que la suma sea igual al total).
   - Si la ficha no existe, se crea; si existe, se suma al saldo. **Nunca se crean documentos por pajilla.**
   - Finanzas: mantener el comportamiento actual de la compra de semen en IATF (ni duplicarlo ni perderlo). La colecta propia no genera egreso salvo que se indique un costo explícito.

2. **Asignar semen a una campaña IATF** `POST /api/iatf/campanas/:id/semen`
   - Recibe un arreglo `[{ fichaSemenId, cantidad }]` con **uno o varios toros**.
   - Por cada toro: descontar `stockReproductivo`, sumar `asignadoCampanas`, crear o incrementar la `AsignacionSemenCampana` y registrar el movimiento.
   - Todo o nada: si un toro no tiene saldo, se revierte la operación completa.
   - Nunca toma de `stockComercial`.

3. **Consumo al inseminar**
   - Al registrar una inseminación de campaña, se elige el toro entre los asignados a esa campaña que todavía tengan saldo. Se descuenta `asignadoCampanas`, se suma `totalUsadasIATF` y `cantidadUsada`.
   - Conservar la herencia automática de paternidad con el toro de la ficha (`toroId` o datos del externo).
   - Si existe inseminación fuera de campaña, consume directo de `stockReproductivo`.
   - Anular una inseminación devuelve la pajilla a donde salió.

4. **Devolver sobrantes** `POST /api/iatf/campanas/:id/semen/devolver` y al cerrar la campaña
   - Devuelve el saldo no usado a `stockReproductivo` con un movimiento `DEVOLUCION_CAMPANA`. El cierre debe ofrecer o ejecutar esta devolución y nunca dejar unidades atrapadas en una campaña cerrada.

5. **Traslado entre gavetas** `POST /api/semen/:id/traslados`: `REPRODUCTIVO_A_COMERCIAL` o `COMERCIAL_A_REPRODUCTIVO`, con motivo obligatorio. Sin impacto financiero.

6. **Ajustes y mermas** `POST /api/semen/:id/ajustes`: indicar gaveta, cantidad y motivo obligatorio. Respetar el invariante.

7. **Venta** `POST /api/ventas/pajillas`: descuenta **solo** `stockComercial`, suma `totalVendidas` y crea el `MovimientoFinanciero` de ingreso, categoría "Venta de Genética", en la moneda indicada.

8. **Anular venta** `POST /api/ventas/pajillas/:id/anular`: devuelve las unidades a `stockComercial`, revierte el ingreso según el estándar de Finanzas y no borra nada. Si la venta ya estaba anulada, responder `400`.

9. **Costo de campaña / costo por preñez**: calcular a partir de `AsignacionSemenCampana` (pajillas usadas × costo aplicado), separado por moneda.

## 🔄 3. MIGRACIÓN DE DATOS EXISTENTES
Script idempotente `scripts/migrar-banco-semen.js` con modos `--dry-run` y `--aplicar`:
- Convertir cada existencia SEMEN de cada campaña en: ficha de banco (agrupando por toro/DIIO dentro de la finca), lote de entrada y asignación a esa campaña, con lo ya usado como `cantidadUsada`.
- Saldos de campañas ya cerradas: devolverlos a `stockReproductivo` con un movimiento de migración.
- Al final, validar el invariante en todas las fichas y reportar las discrepancias sin corregirlas en silencio.
- No tocar insumos que no sean semen.

## 🖥️ 4. INTERFAZ
- **Insumos de la campaña IATF, categoría SEMEN:** reemplazar el formulario libre por un selector de toros con saldo reproductivo disponible ("Toro · DIIO · raza · disponibles: N"), selección múltiple y cantidad por toro con tope visual. Agregar un acceso a "Agregar semen al banco" por si falta un toro. El resto de categorías no cambia.
- **Entrada rápida al banco:** selector de toro de la finca (DIIO autocompletado) o "Toro externo" (nombre y DIIO escritos a mano), cantidad, botones Todo IATF / Todo venta / Dividir, costo, moneda y lote.
- **Ventas → pestaña "Pajillas":** existencias comerciales por toro, botones Vender, Trasladar y Ajustar, historial de ventas con Anular, ingresos del mes por moneda.
- **Ficha del toro:** `Ingresadas | Reproductiva | Comercial | En campañas | Usadas IATF | Vendidas | Mermas`, más el historial de movimientos.
- Etiqueta "DIIO" en todos los lugares donde antes decía "código del toro".

## 🧪 5. PRUEBAS (MongoDB real con replica set, índices intactos)
1. Una entrada de 50 pajillas divididas 30/20 crea una sola ficha; una segunda entrada del mismo toro suma a la misma ficha.
2. Asignar 2 toros a una campaña descuenta solo la gaveta reproductiva; si uno no tiene saldo, se revierte todo.
3. La inseminación consume lo asignado a la campaña y hereda la paternidad; anularla devuelve la pajilla.
4. Cerrar la campaña devuelve los sobrantes al banco.
5. La venta descuenta solo la gaveta comercial, genera el ingreso y rechaza sobreventas con `400`; la anulación revierte todo.
6. Ni IATF consume de la gaveta comercial ni Ventas de la reproductiva.
7. Los traslados y ajustes exigen motivo y respetan el invariante.
8. Concurrencia: dos ventas o asignaciones simultáneas no dejan saldos negativos.
9. Migración: el dry-run no escribe; aplicarla dos veces da el mismo resultado; los costos de campañas antiguas no cambian.
10. Control de plan: las rutas devuelven `403` en planes sin acceso.
11. No hay regresiones: `npm test`, el smoke integrado y `npm run build` pasan.

Entregar un resumen de cambios, el mapa de la Fase 0 y el resultado de la migración en dry-run.