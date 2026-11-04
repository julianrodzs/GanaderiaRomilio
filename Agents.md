# PROMPT PARA CODEX: MÉTODO REPRODUCTIVO UNIFICADO Y PROGRAMA COMPLETO DE TRANSFERENCIA DE EMBRIONES (PLAN PRO)

## 🎯 OBJETIVO
1. Ordenar, unificar y hacer visible el **método reproductivo (origen de la gestación)** en todo el sistema, separando **servicio, diagnóstico y resultado**, permitiendo gestaciones con servicio desconocido (`DESCONOCIDO`) y diferenciando **madre genética (donante)** de **madre gestante (receptora)** en la genealogía del animal.
2. Implementar el **Programa Integral de Transferencia de Embriones (TE)** exclusivamente para los planes **PRO** y **PREMIUM**, abarcando los 3 frentes:
   - **Frente 1 (Donantes):** Colectas/lavados (`IN_VIVO`), aspiración folicular/laboratorio (`FIV`) y protocolos de superovulación.
   - **Frente 2 (Banco de Embriones):** Inventario por combinación Donante × Padre, calidad/estadio, estado (`FRESCO`, `CONGELADO`, `VITRIFICADO`), entradas por producción o compra, mermas y venta comercial de embriones.
   - **Frente 3 (Receptoras y TETF):** Sincronización de receptoras, evaluación de cuerpo lúteo, transferencia con descuento de embrión, diagnóstico y cálculo de **costo por embrión y costo por preñez TE** (separando `CRC` y `USD`).

---

## ⚠️ FASE 0: INSPECCIÓN OBLIGATORIA ANTES DE MODIFICAR CÓDIGO
1. Inspeccionar modelos, controladores, servicios y vistas actuales de:
   - `Reproduccion` / ciclos reproductivos (`tipoServicio`, `origenGestacion`, diagnósticos, partos, abortos);
   - campañas y protocolos de `IATF` (insumos, tareas por día, consumo de semen, costos);
   - modelo `Animal` (campo `madre`, `padre`, genealogía, árbol y validaciones de consanguinidad);
   - reportes reproductivos y reporte de partos;
   - middleware y configuración de planes (`config/planes.js`).
2. Entregar un mapa breve de "estructura actual → cómo se extiende" reutilizando al máximo los motores existentes de Reproducción e IATF sin duplicar colecciones innecesariamente.

---

## 🔐 1. DISTRIBUCIÓN POR PLANES (REGLA DE ACCESO)

| Funcionalidad | Planes Habilitados | Regla en Backend / UI |
| :--- | :--- | :--- |
| Catálogo de métodos (`MONTA_NATURAL`, `IA_CONVENCIONAL`, `IATF`, `TRANSFERENCIA_EMBRIONES`, `DESCONOCIDO`), separación servicio/diagnóstico/resultado, gestación con servicio desconocido, registro puntual de gestación/parto por TE (madre genética vs gestante) y método visible en historial y reporte de partos | **Todos (`ESENCIAL`, `GESTION`, `PRO`, `PREMIUM`)** | Nunca bloquear datos históricos ni genealogía básica del animal. Si una finca baja de plan, jamás se oculta el método ni la filiación de sus animales. |
| Analítica e indicadores reproductivos comparados por método (tasa de preñez por método, servicios por concepción, intervalo entre partos, pérdidas por método) | **`GESTION`, `PRO`, `PREMIUM`** | `403 PLAN_UPGRADE_REQUIRED` en `ESENCIAL`. |
| **Programa Completo de TE:** gestión de donantes, protocolos de superovulación, sesiones de colecta/lavado y FIV, Banco/Inventario de Embriones (propios y comprados), campañas de sincronización de receptoras (TETF), venta de embriones y costos por embrión/preñez | **`PRO`, `PREMIUM`** | Exclusivo desde **Plan PRO** (`403 PLAN_UPGRADE_REQUIRED` en `ESENCIAL` y `GESTION`). |
| Consolidación multi-finca de indicadores reproductivos y de TE | **`PREMIUM`** | Integrado en vista consolidada Premium. |

*Restricción por especie:* En `Porcino` solo se permiten `MONTA_NATURAL`, `IA_CONVENCIONAL` y `DESCONOCIDO`. Rechazar con `400` cualquier intento de usar `IATF` o `TRANSFERENCIA_EMBRIONES` en porcinos.

---

## 🏗️ 2. MODELO DE DATOS Y REGLAS DE DOMINIO

### A. Catálogo Unificado de Métodos Reproductivos
Constante compartida en backend y frontend:
- `MONTA_NATURAL` (con submodalidad opcional `CONTROLADA` | `LIBRE`).
- `IA_CONVENCIONAL` (inseminación a celo detectado).
- `IATF` (modalidad sincronizada de IA; guarda referencia a `campanaId`).
- `TRANSFERENCIA_EMBRIONES` (solo `Bovino`).
- `DESCONOCIDO` (cuando se registra preñez o parto sin conocer el servicio).

*Nota sobre FIV:* La fecundación in vitro (`FIV`) **no** es otro método de servicio a la receptora; es el `origenEmbrion` (`IN_VIVO` | `FIV`) dentro de una `TRANSFERENCIA_EMBRIONES`.

### B. Separación de Servicio, Diagnóstico y Resultado + Atribución
1. **Servicio:** Evento individual (`metodo`, `fechaServicio` o rango, `toroId` / semental externo con `diio`, `fichaSemenId`, `embrionId` / datos de donante si es TE, `campanaId`). **Registrar un servicio no confirma automáticamente una gestación.**
2. **Diagnóstico:** `PENDIENTE`, `PRENADA`, `VACIA`, `DUDOSA` (con fecha, método de diagnóstico `PALPACION` | `ECOGRAFIA` | `OTRO`, días estimados de gestación y fecha probable de parto).
3. **Resultado:** `PARTO`, `ABORTO`, `REABSORCION` / `PERDIDA_GESTACIONAL`.
4. **Atribución de la Gestación (`estadoAtribucion`):**
   - `CONFIRMADA`: Un único servicio compatible por ventana gestacional o confirmado explícitamente por el usuario.
   - `INCIERTA`: Hubo IATF/IA y posteriormente monta o repaso con toro dentro de la ventana compatible. **No atribuir automáticamente a la IATF ni asignar paternidad automática**; guardar `serviciosCandidatos[]` y permitir confirmación manual.
   - `SIN_SERVICIO`: Gestación registrada directamente desde diagnóstico o parto con `metodo: 'DESCONOCIDO'`, **sin inventar una monta ficticia**.

### C. Genealogía Dual en `Animal` (Madre Genética vs Madre Gestante)
Ampliar el modelo `Animal`:
- `madreGeneticaId` (ref `Animal`, opcional) + `madreGeneticaExterna` (`{ nombre, diio, raza, registro }`).
- `madreGestanteId` (ref `Animal`, opcional — la receptora que llevó la gestación y parió).
- Mantener `madre` sincronizado para retrocompatibilidad:
  - En partos por `MONTA_NATURAL`, `IA_CONVENCIONAL`, `IATF` o `DESCONOCIDO`: `madreGeneticaId = madreGestanteId = madre`.
  - En partos por `TRANSFERENCIA_EMBRIONES`:
    - `madreGestanteId` es la **receptora** (a ella se le suma el parto en su historial obstétrico, cría al pie, lactancia/destete e intervalo entre partos).
    - `madreGeneticaId` (o `madreGeneticaExterna`) es la **donante** (se usa para árbol genealógico, pedigrí, raza heredada y alertas de consanguinidad; **no** suma un parto biológico a la donante).

### D. Modelos del Programa de TE (Exclusivo Plan PRO y PREMIUM)

1. **`ColectaEmbrion` (Frente 1 — Donantes: Lavado In Vivo o Sesión FIV/OPU):**
   - `organizacionId`, `fincaId` (indexados).
   - `tipoProduccion`: Enum `['IN_VIVO', 'FIV']`.
   - `donanteId` (ref `Animal`) o `donanteExterna` (`{ nombre, diio, raza }`).
   - `padreId` (ref `Animal`), `fichaSemenId` o `padreExterno` (`{ nombre, diio, raza }`).
   - `fechaColecta`, `tecnico` / `laboratorio`.
   - `estructurasRecuperadas` (oocitos/embriones totales), `embrionesViables`, `embrionesDegenerados`.
   - `costos`: arreglo o total por moneda (`CRC` / `USD`, sin mezclar) incluyendo hormonas de superovulación, semen consumido y servicio de laboratorio/lavado.

2. **`LoteEmbrion` / `BancoEmbriones` (Frente 2 — Inventario de Embriones):**
   - `organizacionId`, `fincaId` (indexados).
   - `origenLote`: Enum `['PRODUCCION_PROPIA', 'COMPRA']`.
   - `colectaId` (ref `ColectaEmbrion`, opcional si fue producido en finca).
   - `origenEmbrion`: Enum `['IN_VIVO', 'FIV']`.
   - `donanteId` / `donanteExterna` y `padreId` / `padreExterno` (con `nombre`, `diio`, `raza`).
   - `estadoConservacion`: Enum `['FRESCO', 'CONGELADO', 'VITRIFICADO']`.
   - `calidadGrado`: Enum `[1, 2, 3]` (opcional).
   - `estadio`: Enum `['MORULA', 'BLASTOCISTO_TEMPRANO', 'BLASTOCISTO', 'BLASTOCISTO_EXPANDIDO', 'OTRO']` (opcional).
   - `canastillaTermo`, `codigoLote`.
   - `costoUnitario`, `moneda` (`CRC` | `USD`).
   - **Saldos y contadores (con invariante estricto):**
     - `stockReproductivo` (disponibles para transferir en la finca).
     - `stockComercial` (disponibles para vender a terceros).
     - `asignadoCampanas` (reservados en campañas TETF activas).
     - `totalIngresados`, `totalTransferidos`, `totalVendidos`, `totalMermas`.
     - **Invariante:** `totalIngresados = stockReproductivo + stockComercial + asignadoCampanas + totalTransferidos + totalVendidos + totalMermas`.

3. **`MovimientoEmbrion` (Bitácora inmutable):**
   - `ENTRADA_COLECTA`, `ENTRADA_COMPRA`, `ASIGNACION_CAMPANA`, `TRANSFERENCIA_RECEPTORA`, `DEVOLUCION_CAMPANA`, `TRASLADO_GAVETA`, `VENTA`, `ANULACION_VENTA`, `MERMA`.
   - Índice único parcial para `claveIdempotencia` (`{ $type: 'string' }`).

4. **`CampanaTE` / Sincronización de Receptoras (Frente 3 — TETF):**
   - Puede extender el motor de campañas de IATF con `tipoCampana: 'IATF' | 'TETF'` o usar un esquema equivalente conectado al mismo motor de tareas e insumos hormonales:
   - Sincronización por días (D0 dispositivo/hormonas, D8 retiro, D9 celo, D17 evaluación de cuerpo lúteo y transferencia).
   - Por cada receptora en la campaña:
     - `evaluacionCL`: `APTA`, `NO_APTA`, `PENDIENTE` (lado de ovario `IZQUIERDO` | `DERECHO`, calidad CL).
     - Si es `APTA` y se ejecuta la transferencia: descuenta atómicamente 1 embrión del lote asignado (`asignadoCampanas` o `stockReproductivo`), incrementa `totalTransferidos` y registra el servicio `TRANSFERENCIA_EMBRIONES` con toda la trazabilidad genética.
     - Al cerrar la campaña, devuelve embriones sobrantes a `stockReproductivo`.

5. **`VentaEmbrion` (Comercialización genética en Ventas):**
   - Descuenta exclusivamente de `stockComercial`, genera `MovimientoFinanciero` de ingreso (categoría `Venta de Genética`) en `CRC` o `USD` y soporta anulación atómica sin borrar registros.

---

## 🔄 3. MIGRACIÓN DETERMINISTA (`scripts/migrar-reproduccion-y-te.js`)
Crear script idempotente con modos `--dry-run` y `--aplicar`:
1. Normalizar registros reproductivos actuales:
   - `"Monta natural"` → `MONTA_NATURAL`
   - `"Inseminación artificial"` → `IA_CONVENCIONAL`
   - Registros vinculados a campañas IATF → `IATF`
   - `"Sin especificar"`, vacío o nulo → `DESCONOCIDO`
2. Sincronizar `origenGestacion` y `metodo` sin sobrescribir en silencio si hubiera conflicto (reportar conflictos en el log).
3. En todos los documentos existentes de `Animal` donde `madre` exista y `madreGeneticaId` / `madreGestanteId` estén vacíos, poblar `madreGeneticaId = madre` y `madreGestanteId = madre`.
4. Verificar que los totales del reporte de partos antes y después de la migración sean idénticos.

---

## 🖥️ 4. INTERFAZ DE USUARIO (FRONTEND)

1. **Formulario de Reproducción (Todos los planes):**
   - Selector de **Método Reproductivo** adaptado por especie.
   - Botón/flujo **"Registrar gestación o parto con servicio desconocido"** (no obliga a inventar fecha de monta).
   - Cuando se elige `TRANSFERENCIA_EMBRIONES`, mostrar campos de **Receptora**, **Donante (Madre Genética)** (de la finca o externa con DIIO), **Padre** (de la finca o externo con DIIO) y **Origen del embrión** (`In vivo` / `FIV`). En planes PRO/PREMIUM, permitir seleccionar directamente el embrión desde el **Banco de Embriones**.
   - Si una gestación tiene `estadoAtribucion: 'INCIERTA'` (ej. IATF seguida de monta con toro), mostrar alerta clara para confirmar a cuál servicio corresponde.
2. **Ficha del Animal e Historial de la Vaca (Todos los planes):**
   - En la cría nacida por TE: mostrar claramente **Madre Genética (Donante)** y **Madre Gestante (Receptora)**.
   - En la ficha de una vaca: pestaña/sección de **Partos biológicos (como madre o receptora)** separada de **Progenie genética por TE (como donante)**, con etiquetas visuales del método en cada evento.
3. **Reporte de Partos e Indicadores:**
   - En Todos los planes: columna y filtro por **Método Reproductivo**, manteniendo la nota aclaratoria sobre ciclos con parto real en el período.
   - Desde **Plan GESTIÓN**: tarjetas y tabla comparativa de eficiencia por método (tasa de preñez, servicios por concepción, intervalo entre partos).
4. **Módulo Programa de TE (Exclusivo Plan PRO y PREMIUM):**
   - Vista/pestañas dentro del área reproductiva avanzada:
     - **Donantes y Colectas / FIV:** registrar lavados o sesiones OPU/FIV y enviar embriones viables al banco en un solo paso.
     - **Banco de Embriones:** tabla por combinación Donante × Padre, estado (`Fresco`, `Congelado`, `Vitrificado`), grado, gaveta reproductiva vs comercial, entradas por compra y traslados/mermas.
     - **Campañas de Receptoras (TETF):** protocolo hormonal, chequeo de cuerpo lúteo (`Apta` / `No apta`), asignación y transferencia de embriones, diagnóstico y devolución de sobrantes.
     - **Indicadores y Costos TE:** embriones viables por colecta, preñez en fresco vs congelado/vitrificado, preñez por donante/padre/técnico, **costo por embrión viable** y **costo por preñez TE** (separado en `CRC` y `USD`).
   - En **Ventas**: permitir vender embriones comerciales bajo la pestaña de Genética junto con las pajillas.

---

## 🧪 5. PRUEBAS AUTOMATIZADAS Y VERIFICACIÓN (MONGODB REAL)

Crear suite de pruebas sobre MongoDB real con replica set e índices activos:
1. **Separación servicio/diagnóstico/resultado:** Registrar servicio no marca preñez; diagnóstico positivo sí; IATF seguida de monta dentro de la ventana marca atribución `INCIERTA` y no asigna paternidad automática hasta confirmación.
2. **Gestación sin servicio:** Registrar diagnóstico o parto con método `DESCONOCIDO` funciona sin crear montas ficticias.
3. **Genealogía dual TE:** Al nacer una cría por TE, el parto suma al historial obstétrico de la `receptora`, la raza/árbol genealógico/consanguinidad usan la `donante`, y la donante no suma un parto biológico propio.
4. **Validación por especie:** Intentar registrar `IATF` o `TRANSFERENCIA_EMBRIONES` en un animal `Porcino` devuelve `400`.
5. **Flujo completo PRO de TE (Colecta → Banco → TETF → Parto):**
   - Registrar colecta (`IN_VIVO` o `FIV`) con 6 embriones viables (4 a gaveta reproductiva, 2 a comercial).
   - Sincronizar 2 receptoras en campaña TETF, marcar 1 `APTA` y 1 `NO_APTA`, transferir 1 embrión, verificar descuento atómico y devolución de sobrantes al cerrar campaña.
   - Verificar cálculo de costo por embrión y costo por preñez sin mezclar `CRC` y `USD`.
6. **Venta y anulación de embriones:** Vender 1 embrión comercial descuenta solo `stockComercial`, genera `MovimientoFinanciero` en la moneda elegida y rechaza sobreventa con `400`; anular revierte stock e ingreso.
7. **Control estricto de planes:**
   - `ESENCIAL`: puede registrar métodos, gestación desconocida y nacimiento por TE con genealogía dual (`200`/`201`), pero recibe `403` en indicadores por método y en el Programa de TE.
   - `GESTION`: accede a indicadores por método (`200`), pero recibe `403` en el Programa de TE (colectas, banco de embriones, campañas TETF y venta de embriones).
   - `PRO` y `PREMIUM`: acceso completo (`200`/`201`).
8. **Migración y No Regresión:** Ejecutar `migrar-reproduccion-y-te.js` en `--dry-run` y `--aplicar` (dos veces para probar idempotencia), correr `npm test`, el smoke integrado y `npm run build` con salida `0`.