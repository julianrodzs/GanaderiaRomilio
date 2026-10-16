# INSTRUCCIÓN PARA CODEX: AUDITORÍA EXHAUSTIVA DEL MÓDULO DE POTREROS, PASTOS Y FORRAJES

Eres el Desarrollador Fullstack Senior. Tu objetivo es realizar una **auditoría completa de código (Backend y Frontend)** del **Módulo de Potreros, Pastos, Rotación y Pasto de Cuido / Bancos Forrajeros** (`Potrero`, `Pasto`, `Rotacion`, `BancoForrajero`, cortes y aforos) para evaluar su madurez agronómica, precisión en cálculos, integridad multi-finca y barreras de plan.

No asumas capacidades de antemano; debes **inspeccionar el código real** para descubrir qué está construido, cómo se calculan los días de descanso/ocupación, cómo interactúa con los lotes de ganado y qué reportes genera.

---

### 🔍 PUNTOS CLAVE A AUDITAR:

#### PASO 1: Mapeo de Archivos, Esquemas y APIs
- **Modelos de Datos (Mongoose/MongoDB):**
  - Esquemas de potreros y pastos: `Potrero.js`, `Pasto.js`, `Rotacion.js`.
  - Esquemas de forrajes: buscar modelos o subdocumentos para bancos forrajeros, coberturas y cortes (`bancosForrajeros`, `aforos`, `cortes`).
  - Campos clave: área/tamaño (ha o m²), tipo de pasto sembrado, topografía, fuentes de agua, estado del potrero (`En descanso`, `En ocupación`, `En mantenimiento`, etc.).
- **Backend (Controladores y Rutas):**
  - `potrero.js`, `pasto.js`, `rotacion.js`.
  - Rutas de rendimiento: `/api/potreros/rendimiento`, `/api/potreros/rendimiento/por-pasto`, `/api/potreros/:id/rendimiento`.
  - Rutas de cobertura y cortes: `/api/potreros/:id/cobertura`, `/api/potreros/:id/cortes`.
- **Frontend (Componentes y Vistas):**
  - Vistas de potreros (`Potreros.js`, `FormularioPotrero.js`, `DetallePotrero.js`).
  - Módulos de bancos forrajeros (`BancosForrajeros.js`).
  - Vistas de rotación y asignación de lotes (`FormularioRotacion.js`, `Rotaciones.js`).

---

#### PASO 2: Lógica de Pastoreo y Rotación de Potreros
1. **Ocupación y Días de Descanso:**
   - ¿Cómo sabe el sistema si un potrero está ocupado o descansando?
   - ¿Calcula automáticamente los **días de ocupación** actuales y los **días de descanso** acumulados desde que salió el último lote?
   - ¿Advierte al usuario si intenta meter ganado a un potrero que no ha cumplido su tiempo óptimo de recuperación?
2. **Cálculo de Carga Animal:**
   - ¿Calcula la **Carga Animal** o presión de pastoreo (ej. Unidades Gran Ganado `UGM/ha` o cabezas por hectárea)?
   - Si calcula carga animal, ¿utiliza el peso real de los animales del lote (mediante pesajes recientes) o solo hace un conteo simple de cabezas?
3. **Sincronización con Lotes y Ganado:**
   - Al mover un lote a un potrero, ¿se actualiza automáticamente el campo `potreroActual` en los animales del lote?
   - ¿Permite sobreocupación accidental (meter dos lotes distintos al mismo potrero sin advertencia)?

---

#### PASO 3: Pasto de Cuido / Bancos Forrajeros y Cortes
1. **Estructura de Bancos Forrajeros:**
   - ¿Cómo modela las áreas destinadas a pasto de corte, bancos de proteína (Cratylia, Leucaena, Botón de Oro) o caña?
2. **Registro de Cortes y Cosechas:**
   - Al registrar un corte: ¿qué datos guarda? (Fecha de corte, peso verde cosechado en kg/toneladas, área cortada, destino del forraje).
   - ¿Calcula el rendimiento de biomasa por hectárea (`kg MV/ha` o materia seca)?
3. **Conexión con la Alimentación:**
   - ¿El forraje cortado se conecta con el módulo de alimentación del ganado (suministro a comederos/lotes) o queda como un registro aislado?

---

#### PASO 4: Mediciones de Cobertura y Aforos de Pasto
1. **Metodología de Aforo:**
   - ¿Cómo registra el aforo o disponibilidad de forraje? (¿Muestreo por m² con marco, altura de pasto o porcentaje visual de cobertura?).
2. **Alertas de Disponibilidad:**
   - ¿Calcula la disponibilidad de materia seca total del potrero para estimar cuántos días de comida le quedan al lote?

---

#### PASO 5: Segmentación y Barreras por Plan de Suscripción
Revisar contra `backend/config/planes.js`:
- **Plan Esencial ($10):** Tiene habilitado `bancosForrajeros` (banco, cobertura y cortes básicos) y gestión operativa de potreros. ¿Qué funciones básicas incluye?
- **Plan Gestión ($20):** Desbloquea `analiticaProductiva` (rendimiento de potreros y forrajes). ¿Qué métricas avanzadas reserva?
- **Auditoría de Exclusividad:** ¿Los endpoints de rendimiento de potreros (`/api/potreros/rendimiento*`) tienen guards efectivos (`requireFeature('analiticaProductiva')`) o pueden consumirse desde Esencial?

---

#### PASO 6: Integridad, Multi-Finca y Seguridad
- ¿Los potreros respetan estrictamente el aislamiento por `fincaId` y `organizacionId`?
- ¿Es posible asignar por API un lote de la Finca A a un potrero de la Finca B?
- Si se elimina un potrero que tiene animales o historial de rotaciones, ¿el sistema lo bloquea o deja referencias huérfanas?

---

### 📄 ENTREGABLE REQUERIDO

Genera el archivo `AUDIT_MODULO_POTREROS.md` en la raíz del repositorio con la siguiente estructura:

1. **Resumen Ejecutivo:** Diagnóstico sobre la solidez agronómica y operativa del módulo de potreros y forrajes.
2. **Catálogo de Funcionalidades Activas:**
   | Submódulo / Función | Descripción | Estado en Backend | Estado en Frontend | Madurez (100% Funcional / Básico / Mock) |
3. **Modelado Agronómico y Fórmulas de Cálculo:**
   - Cómo calcula días de descanso, días de ocupación y carga animal (UGM/ha).
   - Cómo calcula rendimientos de cortes en bancos forrajeros y aforos.
4. **Integración con Lotes y Alimentación:** Grado de sincronización entre el movimiento de potreros y el inventario animal.
5. **Cumplimiento de Exclusividad por Plan (`ESENCIAL` vs `GESTIÓN`+):** Verificación de guards en endpoints de analítica de forrajes.
6. **Plan de Acción Priorizado:** Hallazgos clasificados en P1 (integridad/datos) y P2 (mejoras agronómicas y visuales).