# PROMPT PARA CODEX: REMEDIACIÓN FINAL PRE-LANZAMIENTO (CIERRE DE CL-01 A CL-13 Y PASO A GO)

Eres el Arquitecto Principal y Release Engineer. Basándote en el informe `AUDIT_CIERRE_PRE_LANZAMIENTO.md`, tu objetivo es corregir los 13 hallazgos (`CL-01` a `CL-13`) y volver a ejecutar todas las pruebas de cierre sobre **MongoDB 8.0 real con todos los índices productivos activos y sin continuaciones diagnósticas**, hasta obtener **16/16 PASS** en el smoke integrado y certificar el estado **GO**.

---

## 🚨 FASE 1: BLOQUEADORES DE SALIDA P0 (CL-01, CL-02, CL-03)

### 1. Corregir el Índice de Idempotencia en `EventoAnimal` y Atomicidad de Alta (CL-01 — P0)
- **Archivos:** `models/EventoAnimal.js`, `models/EventoCamada.js` (si aplica el mismo patrón), `controllers/animal-controller.js`, script de índices.
- **Problema:** El índice compuesto `{ organizacionId: 1, fincaId: 1, claveIdempotencia: 1 }` está declarado con `sparse: true`. En MongoDB, un índice compuesto `sparse` indexa igualmente los documentos donde `claveIdempotencia` está ausente o es `null` porque `organizacionId` y `fincaId` sí existen, provocando `E11000 duplicate key` a partir del segundo evento sin clave en la misma finca. Además, el alta de animal persiste el `Animal` antes de fallar el evento, dejando un `ALTA_ANIMAL_PARCIAL`.
- **Acción:**
  1. Reemplazar `sparse: true` en el índice único de `claveIdempotencia` de `EventoAnimal` (y `EventoCamada`, si aplica) por un filtro parcial estricto:
     ```js
     {
       unique: true,
       partialFilterExpression: {
         claveIdempotencia: { $type: 'string' }
       }
     }
     ```
  2. Asegurar que cuando un evento no tenga clave de idempotencia, el campo `claveIdempotencia` se omita (`undefined`), nunca se guarde como `null` ni `""`.
  3. En la rutina de sincronización de índices, eliminar el índice `sparse` anterior si existe y crear el nuevo índice parcial.
  4. Envolver el alta individual de `Animal` y la creación de su evento inicial de bitácora dentro de la misma transacción (`ejecutarEnTransaccion`), para que cualquier fallo posterior haga rollback del animal y nunca deje un `ALTA_ANIMAL_PARCIAL` persistido.
- **Criterio de cierre:** Crear 2 o más animales seguidos, registrar tratamientos sanitarios, partos y ventas en la misma finca funciona sin `E11000` con todos los índices instalados, mientras que dos eventos con la misma `claveIdempotencia` sí se deduplican.

### 2. Unificar el Aprovisionamiento Inicial con la Aceptación de Invitación (CL-02 — P0)
- **Archivos:** `services/aprovisionamientoOrganizacion-service.js`, controlador/servicio de invitaciones y `aceptar-invitacion`.
- **Problema:** Al crear una organización nueva, el aprovisionamiento guarda el token en los campos de reset de `Usuario`, pero envía en el correo un enlace a `/aceptar-invitacion`, el cual busca un documento en la colección `Invitacion` y devuelve `400`.
- **Acción:**
  1. Hacer que `aprovisionamientoOrganizacion-service.js` cree un registro formal en `Invitacion` (dentro de la misma transacción de aprovisionamiento) con el hash del token, vencimiento de 24–72 h, `organizacionId`, `usuarioId` y rol `Administrador`.
  2. Al consumir `POST /api/auth/aceptar-invitacion` (o la ruta equivalente configurada), validar el token contra `Invitacion`, establecer la contraseña cumpliendo la política mínima, activar al usuario/membresía, incrementar `tokenVersion`, marcar la invitación como usada atómicamente y limpiar cualquier token de reset pendiente.
- **Criterio de cierre:** El Paso 1 de `cierre-smoke-integrado.cjs` (aprovisionamiento `201` → aceptación de invitación desde el enlace enviado por correo) responde `200` directamente, sin usar la ruta de `reset-password` como rodeo.

### 3. Corregir Inserciones Múltiples con Sesión en Operaciones Multi-Finca (CL-03 — P0)
- **Archivos:** `services/consolidacionMultiFinca-service.js` y barrido en todos los demás servicios que usen `Model.create(..., { session })`.
- **Problema:** Mongoose 8.24.1 rechaza `Model.create([doc1, doc2], { session })` cuando se pasa un arreglo de documentos sin `ordered: true`, provocando error `500` en traslados entre fincas, transferencias internas, gastos compartidos y anulaciones.
- **Acción:**
  1. En `consolidacionMultiFinca-service.js` (y en cualquier otro servicio del backend que llame a `Model.create` con un arreglo y `session`), pasar explícitamente `{ session, ordered: true }`.
  2. Verificar que el traslado de animales entre fincas, la transferencia financiera, el gasto compartido y la anulación de ambos grupos respondan `200`/`201` contra MongoDB 8.0 real y que un error intermedio haga rollback completo de todas las piernas.

---

## 🔴 FASE 2: INFRAESTRUCTURA, SEGURIDAD Y CONTRATO COMERCIAL P1 (CL-04 A CL-09)

### 4. Validación Fail-Fast al Arrancar y Comprobación de Replica Set (CL-04 — P1)
- **Archivos:** `config/env.js` (o validador de arranque), `config/database.js`, `server.js` / entrypoint.
- **Acción:**
  1. Antes de abrir el puerto HTTP cuando `NODE_ENV === 'production'`, validar que existan y sean válidos:
     - `MONGODB_URI` (prohibir el fallback silencioso a `mongodb://localhost/dataganado` en producción).
     - `JWT_SECRET` (mínimo 32 caracteres **y** al menos 16 caracteres distintos / entropía mínima para rechazar cadenas repetidas como `'a'.repeat(32)`).
     - `CRON_SECRET` (mínimo 32 caracteres si el endpoint HTTP de cron está expuesto).
     - `FRONTEND_URL` (URL `https://` válida en producción).
  2. Al conectar a MongoDB en producción (o cuando se requiera soporte transaccional), verificar que el servidor soporte sesiones/transacciones (comprobando `hello` / `isMaster` con `setName` o ejecutando una sesión transaccional de prueba) antes de anunciar disponibilidad. Si es un MongoDB standalone sin soporte de transacciones, abortar el arranque con un mensaje de error explícito.

### 5. Rutina Integral de Índices para los 65 Modelos y `autoIndex` (CL-05 — P1)
- **Archivos:** `config/database.js`, `scripts/sincronizar-indices.js` (o ampliación de `migrarSaasOrganizacion.js`).
- **Acción:**
  1. En `database.js`, configurar `autoIndex: process.env.NODE_ENV !== 'production'` (desactivado en runtime de producción para evitar bloqueos en caliente, o controlado por variable `MONGODB_AUTO_INDEX`).
  2. Crear un script determinista `scripts/sincronizar-indices.js` que cargue los **65 modelos**, elimine índices obsoletos en conflicto (como el `sparse` antiguo de `EventoAnimal`), ejecute `syncIndexes()` / `createIndexes()` de forma controlada y verifique que todos los índices críticos de la tabla de la sección 8 existan con sus opciones exactas (`unique`, `partialFilterExpression`, `expireAfterSeconds`).

### 6. Bloquear `EMAIL_TEST_TO` en Producción (CL-06 — P1)
- **Archivos:** `services/alertasCorreo-service.js` y cualquier otro servicio de correo.
- **Acción:**
  1. Ignorar por completo `EMAIL_TEST_TO` cuando `NODE_ENV === 'production'` (y emitir un `console.warn` al arrancar si está definida en producción), garantizando que en producción los correos siempre vayan al destinatario real autorizado.

### 7. Actualizar `body-parser` y `multer` para Dejar `npm audit --omit=dev` en Cero (CL-07 — P1)
- **Archivos:** `backend/package.json`, `backend/package-lock.json`.
- **Acción:**
  1. Actualizar `body-parser` a `>=1.20.9` (vía `express` / `overrides`) y `multer` a `>=2.5.0`.
  2. Ejecutar `npm.cmd audit --omit=dev --json` en `backend` y `frontend` y confirmar **0 vulnerabilidades de producción** en ambos.

### 8. Alinear Precios Comerciales `10 / 20 / 35 / 60` USD y Validación de Stripe (CL-08 — P1)
- **Archivos:** `backend/config/planes.js`, `backend/.env.example`, `services/facturacion-service.js`.
- **Acción:**
  1. Actualizar los precios mensuales por defecto en `backend/config/planes.js` a los valores comerciales acordados:
     - `ESENCIAL`: `10` USD
     - `GESTION`: `20` USD
     - `PRO`: `35` USD
     - `PREMIUM`: `60` USD
     (manteniendo la posibilidad de sobreescribirlos por `PLAN_PRECIO_*_USD`).
  2. Documentar las cuatro variables `PLAN_PRECIO_*_USD` y `STRIPE_PRICE_*` en `backend/.env.example`.
  3. En `facturacion-service.js`, validar que el `Price` de Stripe esté activo, sea recurrente mensual y coincida con el monto/moneda esperado del plan antes de abrir sesión de cobro (o mediante verificador de pre-despliegue).

### 9. Actualizar los 4 Reproductores Históricos como Suite de Regresión (CL-09 — P1)
- **Archivos:**
  - `backend/documentation/auditoria-importaciones.repro.cjs`
  - `backend/documentation/auditoria-lotes-engorde.repro.cjs`
  - `backend/documentation/auditoria-reportes.repro.cjs`
  - `backend/documentation/auditoria-usuarios.repro.cjs`
- **Acción:**
  1. Actualizar las aserciones que todavía esperaban el comportamiento defectuoso antiguo (ej. enumeración 404 vs 401 unificado en usuarios, alturas de PDF en reportes, dependencias de organización en importaciones y consultas en lotes) para que validen el **comportamiento corregido actual** con salida `0` (`PASS`).

---

## 🟡 FASE 3: MEJORAS DE CONTRATO, BUNDLE Y PWA P2 (CL-10 A CL-13)

### 10. Moneda Explícita en Compraventa de Animales (CL-10 — P2)
- **Archivos:** controladores/validadores de `CompraAnimal` y `VentaAnimal`.
- **Acción:** No ignorar silenciosamente `moneda: 'USD'`. O bien soportar `CRC`/`USD` de extremo a extremo pasando la moneda al `MovimientoFinanciero` generado, o bien rechazar con `400` cualquier moneda no soportada en ese endpoint para nunca persistir otra moneda en silencio.

### 11. Code-Splitting del Bundle de Frontend (CL-11 — P2)
- **Archivos:** `frontend/vite.config.js`, `frontend/src/App.js`.
- **Acción:** Aplicar `React.lazy` / `Suspense` en las vistas pesadas (Reportes, Consolidación Premium, IATF, ImportarExcel) o configurar `build.rollupOptions.output.manualChunks` en `vite.config.js` para dividir chunks grandes y eliminar la advertencia `> 500 kB`.

### 12. Cierre Limpio de `offlineSync` ante `401` y Ajustes Menores de PWA/UI (CL-12 y CL-13 — P2)
- **Archivos:** `frontend/src/services/offlineSync.js`, `frontend/vite.config.js`, `frontend/src/pages/MiPlan.js`.
- **Acción:**
  1. En `offlineSync.js`, si una petición recibe `401` y la sesión ya fue limpiada por `api.js`, abortar el ciclo de sincronización de forma controlada sin lanzar un rechazo de promesa no manejado por falta de contexto.
  2. En `vite.config.js`, agregar `navigateFallbackDenylist: [/^\/api\//]` en la configuración de Workbox para que una navegación directa a `/api/...` nunca devuelva `index.html`.
  3. En `MiPlan.js`, tomar los límites del Plan Esencial desde la configuración recibida del backend y etiquetar el contador como «Usuarios e invitaciones activas».

---

## 🧪 VERIFICACIÓN OBLIGATORIA PARA EMITIR EL DICTAMEN "GO"

Ejecuta nuevamente todos los comandos de cierre y confirma que **todos terminen con código de salida `0` (`PASS`)**:
1. `node documentation/cierre-smoke-integrado.cjs` *(con todos los índices intactos y sin usar `--diagnostico-sin-indice-eventos` ni el rodeo de reset en el Paso 1 → debe dar **16/16 PASS**)*.
2. `node documentation/cierre-ejecutar-reproductores.cjs` *(los 5 reproductores `.repro.cjs` en `PASS`)*.
3. `node documentation/cierre-standalone.cjs` *(confirmando que el arranque sin variables críticas o sobre standalone en modo producción falla de forma controlada antes de escuchar)*.
4. `node documentation/cierre-configuracion.cjs`
5. `node documentation/cierre-offline.cjs`
6. `node documentation/cierre-pwa-navegador.cjs`
7. `npm.cmd test` en `backend` y suites `test:lunar` / `test:tareas` / `npm.cmd run build` en `frontend`.
8. `npm.cmd audit --omit=dev --json` en `backend` y `frontend` *(0 vulnerabilidades en ambos)*.

Actualiza `AUDIT_CIERRE_PRE_LANZAMIENTO.md` con los nuevos resultados y el nuevo dictamen ejecutivo.