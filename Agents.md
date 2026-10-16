# INSTRUCCIÓN PARA CODEX: AUDITORÍA EXHAUSTIVA DEL MÓDULO DE BITÁCORA Y EVENTOS DEL ANIMAL

Tu objetivo es realizar una **auditoría completa de código (Backend y Frontend)** del **Módulo de Bitácora y Eventos** (`EventoAnimal`, `EventoCamada` y la línea de tiempo/historial de los animales) para verificar su integridad, trazabilidad, seguridad y comportamiento multi-finca.

No asumas capacidades de antemano; debes **inspeccionar el código real** para descubrir qué eventos se registran, cómo se protegen contra manipulaciones y cómo se presentan en la interfaz.

---

### 🔍 PUNTOS CLAVE A AUDITAR:

#### PASO 1: Mapeo de Archivos, Esquemas y APIs de Bitácora
- **Modelos de Datos (Mongoose/MongoDB):**
  - Inspeccionar `EventoAnimal.js`, `EventoCamada.js`, `HistorialFincaAnimal.js`.
  - Revisar qué campos persisten: `animalId`, `fincaId`, `organizacionId`, `usuarioId` (autor), `tipoEvento`, `fecha`, `titulo`, `descripcion`, `origenModulo` (manual vs automático), `datosAdicionales` / metadatos.
- **Backend (Rutas y Controladores):**
  - `eventoAnimalRoutes.js`, `eventoAnimal.js` (controlador), rutas de eventos de camada.
  - Endpoints de consulta: `GET /api/eventos-animal/animal/:animalId`.
  - Endpoints de mutación: `POST`, `PUT`, `DELETE /api/eventos-animal/:id`.
- **Frontend (Componentes y Vistas):**
  - Componentes de línea de tiempo/timeline en la ficha del animal (`BitacoraAnimal.js`, `HistorialEventos.js`, `FichaAnimal.js`).
  - Formularios de creación/edición de notas u observaciones diarias.

---

#### PASO 2: Clasificación de Eventos (Automáticos vs. Manuales)
1. **Eventos Derivados (Automáticos de Sistema):**
   - ¿Qué módulos generan eventos automáticamente en la bitácora? (Compras, Ventas, Pesajes, Tratamientos sanitarios/Vacunas, Inseminaciones/IATF, Partos, Cambios de Lote o Potrero, Traslados de finca).
   - **RIESGO DE FUENTE DE VERDAD:** ¿Permite el endpoint `DELETE` o `PUT` de bitácora modificar o borrar un evento generado automáticamente por una venta o un tratamiento médico? ¿Están protegidos como de solo lectura?
2. **Eventos Operativos (Notas Manuales):**
   - ¿Qué tipos de notas manuales permite registrar el usuario? (Observación general, síntoma/alerta clínica, accidente, comportamiento, etc.).
   - ¿Permite adjuntar fotografías o archivos a los eventos de la bitácora?

---

#### PASO 3: Trazabilidad, Cronología e Inmutabilidad de Fechas
1. **Consistencia Temporal:**
   - ¿El backend valida que la fecha de un evento no sea anterior a la fecha de nacimiento del animal ni posterior a la fecha actual/muerte?
   - ¿Qué sucede con el orden cronológico en la interfaz si se registran eventos con fechas pasadas?
2. **Auditoría de Autoría:**
   - ¿El sistema registra fielmente quién creó cada nota (`usuarioId`)?
   - Si se edita una nota manual, ¿guarda fecha de edición o sobreescribe la original sin dejar rastro de quién modificó el texto?

---

#### PASO 4: Continuidad Histórica en Traslados Multi-Finca
1. **Visibilidad entre Fincas:**
   - Cuando un animal es trasladado de la **Finca A** a la **Finca B**:
     - Al consultar la bitácora desde la Finca B: ¿se visualiza la historia completa previa acumulada en la Finca A (vacunaciones pasadas, partos anteriores, observaciones médicas)?
     - ¿O la consulta de eventos tiene un filtro restrictivo `fincaId: req.fincaId` que oculta el pasado del animal?
   - ¿Se muestra de forma explícita en qué finca ocurrió cada evento histórico?

---

#### PASO 5: Matriz de Roles y Permisos en Bitácora
Revisar contra `backend/config/permisosRoles.js`:
- ¿Quién puede leer la bitácora? (Administrador, Encargado, Veterinario, Trabajador, Consulta).
- ¿Quién puede agregar notas manuales? (¿Puede un Trabajador de campo o Veterinario dejar observaciones?).
- ¿Quién puede eliminar notas? (¿Un trabajador puede borrar notas de un veterinario o administrador?).

---

#### PASO 6: Soporte Offline (PWA)
- ¿Existe soporte en `IndexedDB` para consultar la bitácora de un animal sin conexión en el potrero?
- ¿Permite encolar una nueva nota de bitácora offline para sincronizarse al recuperar señal?

---

### 📄 ENTREGABLE REQUERIDO

Genera el archivo `AUDIT_MODULO_BITACORA.md` en la raíz del repositorio con la siguiente estructura:

1. **Resumen Ejecutivo:** Diagnóstico general sobre la confiabilidad, integridad y uso de la bitácora.
2. **Catálogo de Tipos de Eventos:**
   | Tipo de Evento | Origen (Manual / Automático) | Permite Edición/Borrado? | Datos que Registra |
3. **Análisis de Integridad y Seguridad:**
   - Riesgo de borrado de eventos automáticos derivados (ventas, sanidad, pesajes).
   - Consistencia de fechas y autoría de notas.
4. **Comportamiento en Traslados Multi-Finca:**
   - Continuidad de la historia clínica cuando el animal cambia de finca.
5. **Matriz de Permisos por Rol:**
   - Capacidades de Administrador, Veterinario, Encargado y Trabajador en la bitácora.
6. **Plan de Acción Priorizado:** Hallazgos clasificados en P1 (riesgos de integridad/borrado) y P2 (mejoras visuales y funcionales).