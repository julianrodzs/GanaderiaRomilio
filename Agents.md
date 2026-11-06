# PROMPT PARA CODEX: GESTIÓN DE SUSCRIPCIONES MANUALES (SINPE / TRANSFERENCIA), RENOVACIONES Y ADAPTACIÓN DE MI PLAN

## 🎯 OBJETIVO
Completar el ciclo de vida comercial de suscripciones manuales sobre el flujo de alta asistida ya existente en `frontend/src/pages/AdministracionSaas.js` y backend, permitiendo administrar pagos por **SINPE Móvil / Transferencia IBAN**, períodos cubiertos, fechas de renovación, vencimientos, períodos de gracia y cambios de plan posteriores sin depender de Stripe, manteniendo la integración de Stripe intacta como opción futura.

---

## 🏗️ 1. MODELO DE DATOS Y ESTADO DE SUSCRIPCIÓN

### A. Ampliar los metadatos de suscripción en `Organizacion`
Asegurar que `Organizacion` contenga y gestione de forma consistente:
- `modoFacturacion`: Enum `['MANUAL', 'STRIPE']` (default: `'MANUAL'` cuando se crea desde `AdministracionSaas` o cuando Stripe no interviene).
- `estadoSuscripcion`: Enum `['PRUEBA', 'ACTIVA', 'POR_VENCER', 'EN_GRACIA', 'VENCIDA', 'SUSPENDIDA', 'CANCELADA']` (manteniendo compatibilidad con los estados actuales que ya valida el middleware de acceso).
- `fechaInicioPeriodoActual`: Date.
- `fechaFinPeriodoActual` / `fechaProximoVencimiento`: Date (obligatoria en cuentas `MANUAL` en prueba o activas).
- `diasGracia`: Number (default: `5` días después de `fechaProximoVencimiento` antes de bloquear escrituras o marcar `VENCIDA`).
- `notasFacturacion`: String opcional (ej. teléfono SINPE, cédula jurídica o acuerdo comercial).

### B. Nuevo modelo `PagoSuscripcion` (Historial inmutable de cobros SaaS)
- `organizacionId`: ObjectId ref `Organizacion` (indexado).
- `plan`: Enum `['ESENCIAL', 'GESTION', 'PRO', 'PREMIUM']`.
- `metodoPago`: Enum `['SINPE_MOVIL', 'TRANSFERENCIA_IBAN', 'EFECTIVO', 'TARJETA_MANUAL', 'STRIPE', 'OTRO']`.
- `moneda`: Enum `['CRC', 'USD']` (sin mezclar monedas).
- `monto`: Number (> 0).
- `referenciaComprobante`: String (ej. número de comprobante SINPE o transferencia).
- `mesesCubiertos`: Number (entero >= 1, o días personalizados).
- `periodoCubiertoInicio`: Date.
- `periodoCubiertoFin`: Date.
- `fechaPago`: Date (default: now).
- `registradoPor`: ObjectId ref `Usuario` (SuperAdmin).
- `notas`: String opcional.
- `estado`: Enum `['REGISTRADO', 'ANULADO']` (default: `'REGISTRADO'`).
- `motivoAnulacion`, `fechaAnulacion`: opcionales.

---

## ⚙️ 2. SERVICIOS Y ENDPOINTS DE ADMINISTRACIÓN SAAS (`AdministracionSaas`)

Todas las operaciones que modifiquen `Organizacion` y `PagoSuscripcion` deben correr en transacción (`ejecutarEnTransaccion`) y registrar auditoría administrativa.

1. **Alta asistida con vigencia inicial (`POST /api/admin/organizaciones` o ruta actual):**
   - Si se crea en estado `Prueba`, fijar `fechaProximoVencimiento` a `hoy + diasPrueba` (ej. 15 días por defecto, configurable en el formulario).
   - Si se crea en estado `Activo` con un pago inicial opcional en el mismo formulario, crear el primer `PagoSuscripcion` y fijar `fechaProximoVencimiento` según los meses cubiertos (o `hoy + 1 mes` por defecto).

2. **Registrar Pago y Renovar Suscripción (`POST /api/admin/organizaciones/:id/pagos`):**
   - Entrada: `{ metodoPago, moneda, monto, referenciaComprobante, mesesCubiertos, planOpcional, fechaFinPersonalizada, notas }`.
   - **Regla de cálculo de período:**
     - Si la organización aún no ha vencido (`fechaProximoVencimiento > hoy`) y no estaba en `Prueba`, el nuevo período inicia en `fechaProximoVencimiento` actual y suma `mesesCubiertos` (para no quitarle días ya pagados al cliente).
     - Si ya estaba vencida o estaba en `Prueba`, el nuevo período inicia en `hoy` y suma `mesesCubiertos`.
   - Actualiza `estadoSuscripcion` a `'ACTIVA'`, actualiza `fechaInicioPeriodoActual` y `fechaProximoVencimiento` (y cambia `plan` si se indicó un cambio de plan en la misma renovación).
   - Crea el documento `PagoSuscripcion`.

3. **Anular un Pago Manual (`POST /api/admin/organizaciones/:id/pagos/:pagoId/anular`):**
   - Marca el pago como `'ANULADO'` con motivo obligatorio (sin borrar el registro) y recalcula `fechaProximoVencimiento` con base en el último pago válido anterior (o restaura la fecha previa guardada).

4. **Cambiar Plan o Estado Manualmente (`PATCH /api/admin/organizaciones/:id/suscripcion`):**
   - Permite cambiar de plan (`ESENCIAL`, `GESTION`, `PRO`, `PREMIUM`), ajustar `fechaProximoVencimiento`, extender días de prueba o suspender/reactivar manualmente.
   - **Validación en Downgrade:** Si se baja a un plan inferior, verificar primero si la organización supera los límites actuales del plan destino (cantidad de fincas activas, usuarios activos + invitaciones, especies o cupo de animales). Si los supera, devolver `409 Conflict` detallando qué límite excede para que el administrador lo resuelva antes, sin corromper datos existentes.

5. **Listado y Resumen de Cartera SaaS (`GET /api/admin/organizaciones`):**
   - Enriquecer el listado con: `modoFacturacion`, `estadoSuscripcion`, `fechaProximoVencimiento`, `diasParaVencer` (positivo si falta, negativo si ya venció), último pago registrado y contadores superiores de cartera:
     - **Activas al día**
     - **En prueba**
     - **Por vencer (≤ 7 días)**
     - **En gracia / Vencidas**
     - **Ingresos registrados del mes (`CRC` y `USD` por separado)**.

---

## ⏱️ 3. VERIFICACIÓN DIARIA DE VENCIMIENTOS EN EL CRON MATUTINO (`job:alertas`)

Integrar dentro del runner del cron matutino una verificación ligera y aislada de suscripciones manuales:
1. Detectar organizaciones con `modoFacturacion: 'MANUAL'`:
   - Si faltan `<= 5` días para `fechaProximoVencimiento` (o vence hoy): marcar indicador visual / estado `'POR_VENCER'` y enviar aviso de próximo vencimiento al administrador de la organización y resumen al `EMAIL_ADMIN` (con idempotencia por ciclo para no repetir el mismo correo todos los días).
   - Si `hoy > fechaProximoVencimiento` pero dentro de `diasGracia`: pasar a `'EN_GRACIA'` (la organización aún puede operar pero ve un banner claro de renovación pendiente).
   - Si `hoy > fechaProximoVencimiento + diasGracia`: pasar a `'VENCIDA'` (aplicando la política actual de suscripción inactiva/vencida sin borrar ningún dato de la finca).

---

## 🖥️ 4. INTERFAZ DE USUARIO (FRONTEND)

### A. En `frontend/src/pages/AdministracionSaas.js` (Panel SuperAdmin)
1. **Tarjetas de Semáforo de Cartera arriba:** Total Activas, En Prueba, Por Vencer (≤ 7 días), En Gracia/Vencidas, y total recaudado del mes en `CRC` y `USD`.
2. **Filtros rápidos en la tabla de organizaciones:** Filtrar por estado (`Todas`, `Por vencer`, `Vencidas`, `En prueba`, `Activas`) y por plan.
3. **Columna de Vigencia en cada organización:** Mostrar badge de estado con color, fecha de próximo vencimiento y días restantes o días de atraso.
4. **Acciones por organización (Modales limpios):**
   - **`[ + Registrar Pago / Renovar ]`:** Modal rápido para elegir método (`SINPE Móvil`, `Transferencia IBAN`, etc.), moneda (`CRC` / `USD`), monto, comprobante, meses (`1 mes`, `3 meses`, `6 meses`, `12 meses`) y vista previa de la nueva fecha de vencimiento.
   - **`[ Cambiar Plan / Vigencia ]`:** Modal para hacer upgrade/downgrade de plan, extender prueba o suspender/reactivar.
   - **`[ Historial de Pagos ]`:** Ver todos los pagos de esa organización con opción de anular con motivo si hubo error de digitación.

### B. En `frontend/src/pages/MiPlan.js` (Vista del Cliente Ganadero)
Adaptar `MiPlan.js` según `modoFacturacion` (y disponibilidad de Stripe):
1. Si la organización usa `modoFacturacion: 'MANUAL'` (o Stripe no está habilitado):
   - Mostrar claramente su **Plan Actual**, **Estado de Suscripción** (`Activa`, `En período de prueba`, `Próxima a vencer`, `En período de gracia` o `Vencida`) y la **Fecha de próximo vencimiento** en formato legible.
   - Al seleccionar otro plan en las tarjetas comparativas o al tocar renovar, en lugar de intentar abrir un checkout de Stripe, mostrar un botón claro: **`Solicitar cambio o renovación por WhatsApp / SINPE`** (abriendo WhatsApp prellenado con el nombre de la organización, el plan actual y el plan o renovación solicitada, usando una variable `VITE_WHATSAPP_SOPORTE` o contacto configurado).
   - Mostrar una tabla limpia de **"Mis Pagos Registrados"** (Fecha, Plan, Método `SINPE / Transferencia`, Comprobante, Monto y Período cubierto) para transparencia total con el productor.
2. Si `modoFacturacion === 'STRIPE'` y Stripe está configurado, mantener el flujo actual de Stripe Checkout y Portal sin romper ninguna prueba existente.

---

## 🧪 5. PRUEBAS AUTOMATIZADAS (MONGODB REAL)

Agregar pruebas unitarias y de integración que verifiquen:
1. **Renovación acumulativa justa:** Si una organización vence dentro de 5 días y se registra un pago de 1 mes por `SINPE_MOVIL`, la nueva fecha de vencimiento suma 1 mes a partir de la fecha de vencimiento vigente (no pierde los 5 días).
2. **Renovación desde vencida o en prueba:** Si estaba vencida hace 10 días y paga 1 mes, la nueva vigencia inicia desde `hoy + 1 mes` y pasa a estado `ACTIVA`.
3. **Anulación de pago:** Anular un pago revierte la fecha de vencimiento al estado previo y conserva el registro como `ANULADO`.
4. **Protección en Downgrade:** Intentar bajar a `ESENCIAL` una organización que tiene 2 fincas activas o 2 especies devuelve `409` con detalle claro de los límites excedidos.
5. **Transición automática en Cron:** El job evalúa correctamente el paso a `POR_VENCER`, `EN_GRACIA` y `VENCIDA` según las fechas.
6. **Compatibilidad con Stripe:** Las pruebas existentes de `facturacion-service` y validación de precios de Stripe (`CL-08`) siguen pasando al 100%.
7. Ejecutar `npm test` en backend y `npm run build` en frontend con salida `0`.