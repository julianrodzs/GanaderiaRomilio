# PROMPT PARA CODEX: RESUMEN EJECUTIVO PREMIUM POR CORREO Y UNIFICACIÓN EN EL CRON MATUTINO

## 🎯 OBJETIVO
Transformar el servicio de resúmenes por correo del **Plan PREMIUM** (`backend/services/resumenEmail-service.js` y vistas/preferencias asociadas) de un correo básico de conteos a un **Resumen Ejecutivo de Gestión Ganadera** que aporte valor real de supervisión al productor, e integrarlo como **Fase 3 aislada** dentro del comando `npm run job:alertas` para que se ejecute en el único Cron Job diario de Render sin requerir un segundo servicio pagado.

---

## ⚙️ 1. MEJORAS DE CONTENIDO Y LÓGICA DE NEGOCIO EN `resumenEmail-service.js`

### A. Encabezado y Ventana Temporal Explícita
- Calcular y mostrar explícitamente en el encabezado del correo el **rango exacto de fechas** evaluado según la zona horaria de la organización (`America/Costa_Rica` por defecto):
  - Ejemplo Diario: *"Corte diario: 4 de noviembre de 2026 (últimas 24 h)"*.
  - Ejemplo Semanal: *"Corte semanal: 29 de octubre al 4 de noviembre de 2026 (últimos 7 días)"*.

### B. Bloque 1: Inventario ("Foto Actual + Movimiento del Período")
1. **Ocultar especies sin actividad:** Si una especie (`Porcino` o `Bovino`) tiene `0` animales activos **y** `0` movimientos en el período, no imprimir una fila inútil en cero (salvo que ambas estén en cero, en cuyo caso se muestra "Sin animales activos registrados").
2. **Flujo del período por especie activa:**
   - Total de animales activos al corte y variación neta del período (`+X` / `-Y` / `0`).
   - **Altas del período:** Nacimientos, Compras y Traslados recibidos entre fincas.
   - **Bajas del período:** Ventas, Muertes y Traslados enviados.
3. **Estado productivo rápido:** Cantidad de hembras con gestación confirmada activa y cantidad de animales en lotes de engorde activos.

### C. Bloque 2: Finanzas (Formato Monetario, Top Rubros y Permisos)
1. **Control estricto de rol:** Mantener la validación en el momento del envío de que solo usuarios con rol `Administrador` o `Contador` reciben este bloque (aunque tengan el check activado en preferencias).
2. **Separación estricta `CRC` y `USD`:**
   - Formatear todas las cifras con formato monetario legible (`₡1.450.000` para `CRC` y `$2,300.00` para `USD`).
   - Mostrar `CRC` siempre; mostrar `USD` únicamente si hubo movimientos en `USD` en el período (no llenar de ceros en dólares si la finca solo operó en colones).
   - Mantener la exclusión de movimientos marcados para quedar fuera de consolidación (`excluirConsolidacion` / transferencias internas anuladas).
3. **Desglose de valor ejecutivo:**
   - **Ingresos del período**, **Egresos del período** y **Flujo Neto de Caja del Período** *(con nota aclaratoria: "Flujo de caja operativo del período; no equivale a utilidad contable")*.
   - **Top 3 categorías de Ingresos** y **Top 3 categorías de Egresos** del período con su monto y porcentaje del total.

### D. Bloque 3: Tareas (Corregir el "Punto Ciego del Dueño")
1. **Alcance según rol del destinatario:**
   - Si el destinatario es `Administrador` o `Encargado`: calcular y mostrar el **estado global de las tareas de sus fincas autorizadas**, separado de sus tareas personales:
     - **En curso / pendientes totales:** `X` (aclarando explícitamente cuántas de ellas están **vencidas**: *"X pendientes en total, incluyendo Y vencidas"*).
     - **Completadas en el período:** `Z`.
   - Si el destinatario tiene otro rol operativo: mostrar sus tareas asignadas en esas fincas.
2. **Detalle accionable (Top 5 tareas urgentes):**
   - Listar hasta las **5 tareas más urgentes** (primero las vencidas y luego las que vencen hoy/mañana), mostrando:
     - Estado (`🔴 Vencida` / `🟡 Para hoy`), Título de la tarea, Finca, Animal/DIIO o Lote asociado, Fecha límite y **Nombre del responsable asignado**.

### E. Bloque 4: Radar Operativo de los Próximos 7 Días (Prevención en Campo)
Incluir una sección de alerta preventiva para los próximos 7 días en las fincas autorizadas del usuario:
1. **Próximos partos estimados (próximos 7 días):** Cantidad de hembras y hasta 5 identificadores (`DIIO` / nombre).
2. **Periodo de Retiro de Carne vigente hoy:** Cantidad de animales que hoy tienen restricción sanitaria activa (`fechaFinRetiroCarne >= hoy`) y están bloqueados para venta comercial.
3. **Eventos de campañas IATF / TE programados (próximos 7 días):** Cantidad de tareas reproductivas programadas en la semana.

### F. Tabla Comparativa por Finca (Diferencial Multi-Finca Premium)
Cuando el destinatario tenga acceso a **2 o más fincas activas**:
- Además de los totales consolidados, renderizar una **tabla resumen comparativa por finca**:
  - Columnas: `Finca` | `Animales Activos (Δ período)` | `Flujo Neto CRC` *(solo si tiene rol Administrador/Contador)* | `Tareas Vencidas` | `Partos Próx. 7d`.

---

## 🎨 2. DISEÑO HTML EJECUTIVO, TEXTO PLANO Y CTA

1. **Plantilla HTML (`html`):**
   - Diseño limpio con estilos inline compatible con Gmail, Outlook y Apple Mail (móvil y escritorio).
   - Cabecera con identidad **CIR Ganadero** (verde bosque `#0F2E1E`, acento esmeralda `#348655` y crema `#FAF9F5`).
   - Tarjetas visuales bien espaciadas (`padding`, bordes suaves, badges de estado para tareas vencidas y flujo neto).
   - **Botón principal de llamada a la acción (CTA):** Al final del correo, incluir un botón estilizado **`Ir al Panel de CIR Ganadero →`** que apunte a `FRONTEND_URL` (validado sin doble barra).
2. **Versión Texto Plano (`text`):**
   - Reemplazar el `JSON.stringify` / datos serializados crudos por un resumen en texto plano limpio, bien redactado con viñetas y montos formateados, legible en cualquier cliente de correo básico.

---

## ⏱️ 3. UNIFICACIÓN EN EL CRON MATUTINO (`npm run job:alertas`)

1. **Un solo Cron Job en producción para las 3 fases:**
   - Actualizar el runner de `npm run job:alertas` para que ejecute en secuencia pero con **aislamiento total de errores (`try / catch` independiente por fase)**:
     - **Fase 1:** Sincronización de categorías de animales.
     - **Fase 2:** Alertas operativas por correo.
     - **Fase 3:** Resúmenes Ejecutivos Premium (`resumenEmail-service`).
   - Mantener también el script individual `npm run job:resumenes-email` funcional para ejecuciones manuales o pruebas aisladas.
2. **Comportamiento de horario e idempotencia en modo Cron Diario (6:00 AM CR):**
   - Si el resumen se invoca desde el job diario programado (o cuando se pase una opción `{ modoEjecucion: 'cron_diario' }` / `CRON_RESUMEN_IGNORE_HOUR=true`), procesar todos los usuarios Premium con resumen `diario` activo (y los de resumen `semanal` cuyo `diaSemana` coincida con el día actual en la zona horaria de la organización), **sin descartarlos porque su `horaPreferida` sea posterior a las 06:00 AM**, garantizando que en un esquema de 1 corrida diaria a las 6:00 AM todos reciban su resumen puntual y una sola vez por período (usando la clave de período enviado para idempotencia).
   - Si corre en modo horario continuo, conservar el respeto a `horaPreferida`.

---

## 🧪 4. PRUEBAS AUTOMATIZADAS (MONGODB REAL)

Actualizar y ampliar las pruebas de resúmenes y cron:
1. **Inventario con movimiento y filtro de especie:** Una finca solo bovina con 1 nacimiento y 1 venta muestra el movimiento neto y **no** imprime la fila de porcinos en cero.
2. **Supervisión de tareas del Administrador:** Un `Administrador` con `0` tareas asignadas a su propio usuario pero con `3` tareas asignadas a su `Encargado` (1 vencida) ve en el resumen las `3` tareas de la finca y el detalle de la tarea vencida con el nombre del encargado.
3. **Permiso financiero estricto:** Un usuario Premium con rol `Veterinario` o `Encargado` que tenga activado el check de finanzas **no** recibe el bloque financiero ni la columna de flujo neto en la tabla por finca; un `Administrador` o `Contador` sí recibe los montos formateados y el Top de categorías.
4. **Tabla comparativa multi-finca:** Con 2 fincas activas, el correo incluye el desglose comparativo por finca; con 1 sola finca, no muestra tabla redundante.
5. **Radar de 7 días:** Incluye conteo de próximos partos y animales en retiro de carne activo.
6. **HTML y Texto Plano:** Verificar que el HTML incluya el botón a `FRONTEND_URL` y que la versión `text` sea texto humano legible (sin JSON serializado crudo).
7. **Idempotencia y ejecución en `job:alertas`:** Ejecutar `job:alertas` corre las 3 fases de forma aislada y una segunda ejecución el mismo día no reenvía el resumen ya despachado.
8. Ejecutar `npm test` y `npm run build` confirmando `PASS` con salida `0`.