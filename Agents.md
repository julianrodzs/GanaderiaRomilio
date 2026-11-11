# PROMPT PARA CODEX: CENTRO LEGAL PÚBLICO, ACEPTACIÓN DIFERENCIADA (LEY 8968 CR) Y REGISTRO DE EVIDENCIA

## 🎯 OBJETIVO
Construir el **Centro Legal público** de **CIR Ganadero** dentro del frontend (`/legal` y subrutas), accesible sin iniciar sesión ni depender de una suscripción activa, e implementar el flujo de aceptación y consentimiento informado diferenciado según el rol y la situación (contratación de organización vs. incorporación de colaborador vs. consentimientos de datos personales conforme al art. 5 de la Ley N.° 8968 de Costa Rica), guardando evidencia inmutable en el backend y utilizando por ahora los **borradores existentes** para pruebas sin exponer documentos internos.

---

## ⚠️ FASE 0: INSPECCIÓN DE DOCUMENTOS EXISTENTES
1. Revisar en el repositorio qué documentos legales/normativos existen actualmente.
2. Clasificar cuáles corresponden a los **4 documentos públicos** y cuáles son **documentos internos/operativos** que **NO** deben publicarse en rutas públicas.
3. Si alguno de los 4 documentos públicos está en formato Markdown/texto en el repo, integrarlo como fuente versionada (`version: '0.9-borrador'`, `estado: 'BORRADOR_PRUEBA'`, `fechaVigencia`) para que tanto el frontend como el backend compartan exactamente el mismo texto y su hash SHA-256.

---

## 🌐 1. CENTRO LEGAL PÚBLICO EN EL FRONTEND (`/legal`)

Crear rutas públicas (accesibles sin token JWT, con sesión cerrada o con suscripción vencida, y excluidas de cualquier redirección forzada a `/login`):

| Ruta | Contenido |
| :--- | :--- |
| `/legal` | Índice del Centro Legal con tarjetas hacia cada documento, versión vigente, fecha de actualización y resumen de propósito. |
| `/legal/terminos` | **Términos del Servicio** (reglas de uso de la plataforma y condiciones generales). |
| `/legal/privacidad` | **Política de Privacidad y Protección de Datos** (información del art. 5 Ley 8968 CR y contacto para ejercer derechos ARCO: acceso, rectificación, cancelación y oposición). |
| `/legal/suscripciones` | **Condiciones de Suscripción** (planes, pagos manuales SINPE/transferencia o pasarela, renovación, días de gracia, suspensión, cancelación y política de reembolsos). |
| `/legal/soporte` | **Política de Soporte** (canales oficiales, horarios en `America/Costa_Rica` y alcance del soporte técnico). |

### Requisitos de diseño y UX del Centro Legal:
1. **Páginas completas y legibles en móvil y escritorio:** Tipografía clara, índice lateral o superior de secciones, versión visible (`Versión 0.9-borrador` con aviso discreto de borrador de prueba mientras `estado === 'BORRADOR_PRUEBA'`), fecha de vigencia y metaetiqueta `<meta name="robots" content="noindex">` mientras esté en modo borrador.
2. **Impresión y descarga limpias:** Botón **"Imprimir / Guardar PDF"** (`window.print()` con hoja de estilos `@media print` que oculte barras de navegación y botones) y botón **"Descargar copia (.txt / .md)"** con la versión y fecha incluidas.
3. **SW / PWA (`vite.config.js`):** Verificar que `/legal` y `/legal/*` funcionen correctamente en navegación directa (SPA fallback a `index.html`).

---

## 🔗 2. PUNTOS DE ACCESO EN LA APLICACIÓN (SIN ENSUCIAR EL MENÚ PRINCIPAL)

1. **Pantalla de Login (`/login`):**
   - Debajo del formulario de inicio de sesión, mostrar enlaces discretos y accesibles: **`Términos · Privacidad · Soporte`** (más acceso a `/legal`).
2. **Pantalla de Activación / Aceptación de Invitación (`/aceptar-invitacion`):**
   - Mostrar acceso directo a los documentos correspondientes antes de activar la cuenta (con apertura en nueva pestaña o visor completo sin perder lo escrito en el formulario).
3. **Dentro de la App autenticada:**
   - **No agregar otro ítem al menú lateral principal.**
   - Dentro de **Cuenta / Configuración → pestaña o sección "Legal y privacidad"**, mostrar:
     - Enlaces a los 4 documentos del Centro Legal.
     - Tabla de **"Mis aceptaciones y consentimientos registrados"** (documento, versión, fecha de aceptación) y control para activar/revocar en cualquier momento el consentimiento opcional de comunicaciones comerciales.
4. **En `MiPlan` (`/mi-plan`):**
   - Enlace directo a **`/legal/suscripciones`** (*"Ver condiciones de suscripción, renovación y cancelación"*) y estado de aceptación comercial de la organización.

---

## ⚖️ 3. REGLAS DE ACEPTACIÓN Y CONSENTIMIENTO (TRES SITUACIONES SEPARADAS)

**Prohibido:**
- Prohibido pedir aceptar todo en cada login.
- Prohibido usar una sola casilla que mezcle contrato comercial, privacidad y publicidad.
- Prohibido marcar retroactivamente a usuarios u organizaciones existentes como aceptantes.

### Separar estrictamente estos 3 escenarios:

1. **Escenario A — Contratación / Activación de una Organización (Representante / Administrador titular):**
   - Cuando el administrador titular activa por primera vez la organización (o desde `MiPlan` / `Cuenta` si la organización fue creada antes de este cambio y aún no registra aceptación comercial):
   - Debe marcar por separado:
     - **Casilla 1 (Obligatoria para el representante):** *"Acepto los [Términos del Servicio](/legal/terminos) y las [Condiciones de Suscripción](/legal/suscripciones) en representación de la organización."*
     - **Casilla 2 (Obligatoria — Ley 8968 CR):** *"He leído la [Política de Privacidad](/legal/privacidad) y otorgo mi consentimiento informado para el tratamiento de mis datos personales."*
     - **Casilla 3 (Opcional — Nunca pre-marcada):** *"Deseo recibir comunicaciones comerciales, novedades y consejos productivos opcionales."*

2. **Escenario B — Incorporación de un Colaborador (`Encargado`, `Veterinario`, `Contador`, etc. en `/aceptar-invitacion`):**
   - A un trabajador o colaborador **NO se le hace aceptar cargos comerciales ni condiciones de pago de la empresa**.
   - Solo se le presentan:
     - **Casilla 1 (Obligatoria):** *"Acepto las reglas individuales de uso en los [Términos del Servicio](/legal/terminos)."*
     - **Casilla 2 (Obligatoria — Ley 8968 CR):** *"He leído la [Política de Privacidad](/legal/privacidad) y otorgo mi consentimiento informado para el tratamiento de mis datos personales."*
     - **Casilla 3 (Opcional — Nunca pre-marcada):** Comunicaciones opcionales.

3. **Escenario C — Gestión de Consentimientos sobre Datos Personales (en `Cuenta → Legal y privacidad`):**
   - Cualquier usuario existente o nuevo puede consultar qué versión aceptó, aceptar la versión vigente si aún no tenía registro previo, o cambiar su preferencia de comunicaciones opcionales en cualquier momento, dejando trazabilidad del cambio.

---

## 🗄️ 4. EVIDENCIA INMUTABLE EN BACKEND (`AceptacionLegal`)

1. **Catálogo / Versionado de Documentos Legales (`config/documentosLegales.js` o colección):**
   - Cada documento (`terminos`, `privacidad`, `suscripciones`, `soporte`) tiene `slug`, `titulo`, `version` (actualmente `'0.9-borrador'`), `estado` (`'BORRADOR_PRUEBA'` | `'VIGENTE'`), `fechaVigencia`, `contenido` y `hashSha256` calculado automáticamente sobre el texto exacto.
   - Endpoint público `GET /api/legal/documentos` y `GET /api/legal/documentos/:slug` (sin requerir autenticación) que devuelve los 4 documentos públicos vigentes con su versión y hash.

2. **Modelo `AceptacionLegal` (Colección apendizable e inmutable):**
   - `usuarioId`: ObjectId ref `Usuario` (indexado).
   - `organizacionId`: ObjectId ref `Organizacion` (indexado).
   - `rolEnMomento`: String (`Administrador`, `Encargado`, `Veterinario`, etc.).
   - `contexto`: Enum `['ACTIVACION_ORGANIZACION', 'ACEPTACION_INVITACION_COLABORADOR', 'PANEL_CUENTA', 'ACTUALIZACION_CONSENTIMIENTO']`.
   - `tipoAceptacion`: Enum `['TERMINOS_Y_SUSCRIPCION_ORG', 'REGLAS_USO_COLABORADOR', 'CONSENTIMIENTO_PRIVACIDAD_LEY8968', 'COMUNICACIONES_OPCIONALES']`.
   - `otorgado`: Boolean (`true` al aceptar; permite registrar `false` cuando se revoca el consentimiento opcional de comunicaciones).
   - `documentoSlug`: Enum `['terminos', 'privacidad', 'suscripciones', 'soporte']`.
   - `versionDocumento`: String (ej. `'0.9-borrador'`).
   - `hashTexto`: String (SHA-256 del texto exacto presentado).
   - `copiaTextoExacto`: String (snapshot inmutable del texto aceptado en ese momento).
   - `fechaAceptacion`: Date (default: now).
   - `ip`: String.
   - `userAgent`: String.

3. **Integración en `/aceptar-invitacion`:**
   - Al consumir `POST /api/auth/aceptar-invitacion`, validar que vengan marcadas las casillas obligatorias según el rol del invitado (Representante/Administrador inicial vs. Colaborador).
   - Si falta una casilla obligatoria, responder `400 Bad Request` indicando claramente qué aceptación falta.
   - Guardar los registros de `AceptacionLegal` dentro de la misma transacción de activación de la invitación.

---

## 🧪 5. PRUEBAS AUTOMATIZADAS (MONGODB REAL)

Agregar pruebas unitarias y de integración que verifiquen:
1. **Rutas públicas sin sesión:** `GET /api/legal/documentos` y las 4 vistas `/legal/*` responden `200` sin token JWT y no exponen ningún documento interno fuera de los 4 públicos.
2. **Separación de casillas en `/aceptar-invitacion`:**
   - Un colaborador (`Encargado` / `Veterinario`) puede activar su invitación aceptando solo las reglas individuales de uso y privacidad (sin exigirle aceptar suscripción/cargos de la organización).
   - El administrador inicial de una organización nueva debe aceptar términos/suscripción comercial y privacidad por separado; si omite cualquiera de las dos, recibe `400`.
   - La casilla de comunicaciones comerciales es 100% opcional (si viene `false`, la activación pasa con `200`).
3. **Evidencia completa:** Verificar que cada `AceptacionLegal` persistida guarde `usuarioId`, `organizacionId`, `versionDocumento` (`'0.9-borrador'`), `hashTexto`, `copiaTextoExacto`, `fechaAceptacion`, `ip` y `userAgent`.
4. **No retroactividad:** Las organizaciones y usuarios preexistentes no reciben registros falsos de `AceptacionLegal` al migrar ni son bloqueados en su login habitual.
5. Ejecutar `npm test`, el smoke integrado (actualizando el paso de aceptación de invitación para enviar las casillas requeridas) y `npm run build` confirmando `PASS` con salida `0`.