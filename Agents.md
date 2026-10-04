# PROMPT DE EJECUCIÓN: DESARROLLO DE FUNCIONALIDADES PRODUCTO FALTANTES
*(Nota: Queda EXCLUIDA de este alcance cualquier funcionalidad relacionada con Dron / Conteo por IA).*

Eres el Desarrollador Fullstack Senior. Basándote en la auditoría del producto (`AUDIT_PLANES_FINCA.md`), tu objetivo es **construir, conectar e implementar las funcionalidades que quedaron clasificadas como `[EN PROGRESO]` o `[NO IMPLEMENTADO]`**, garantizando que queden 100% operativas en Backend y Frontend.

---

### 📋 MÓDULOS Y TAREAS A DESARROLLAR

#### TAREA 1: Visualización y Detalle de Cierres Históricos (Plan Premium)
*Estado previo: Backend parcial (`api.js:211`), UI incompleta (`GestionConsolidacionPremium`).*

- **Backend:** 
  1. Verificar que el endpoint `GET /api/reportes/multi-finca/cierres/:id` retorne la estructura completa de datos del cierre histórico (resumen comparativo de fincas, métricas consolidadas, metas e indicadores).
- **Frontend (`GestionConsolidacionPremium`):**
  1. Conectar la acción de la UI para llamar a `obtenerCierreMultiFinca(cierreId)`.
  2. Implementar una vista modal o pantalla desplegable de "Detalle de Cierre Histórico" que permita al usuario consultar la fotografía histórica guardada y exportar sus datos a Excel/PDF.

---

#### TAREA 2: Módulo de Configuración de Correos Avanzados y Resumen Diario (Plan Premium)
*Estado previo: Etiqueta en UI sin backend, persistencia ni cron job.*

- **Backend:**
  1. **Persistencia:** Crear el modelo o esquema `ConfiguracionEmail` (o agregar a la configuración del usuario/organización) para guardar las preferencias de correo: frecuencia (diario/semanal), horario preferido, módulos a incluir (resumen ganadero, finanzas, tareas pendientes).
  2. **API:** Crear endpoints `GET /api/usuario/configuracion-emails` y `PUT /api/usuario/configuracion-emails` protegidos por el guard del plan Premium (`configuracionEmailAvanzada`).
  3. **Job Programado (Cron):** Crear el servicio de tareas en segundo plano (cron job) que recopile el resumen del día/semana y lo envíe por correo a los usuarios suscritos en plan Premium.
- **Frontend:**
  1. Crear la vista o pestaña "Notificaciones y Resumen Diario" dentro de la sección de Perfil/Configuración para que el usuario Premium pueda personalizar sus preferencias de correo en tiempo real.

---

#### TAREA 3: Flujo de Facturación, Renovación y Suscripciones
*Estado previo: Sin proveedor de pagos/webhooks; aprovisionamiento manual.*

- **Backend:**
  1. Crear la estructura para el procesamiento de suscripciones y recepción de webhooks de pasarela de pago (ej. Stripe / Wompi / Paypal).
  2. Implementar controladores de webhooks para los eventos: `subscription.created`, `subscription.updated`, `payment.failed`, `subscription.deleted`.
  3. Actualizar automáticamente en base de datos el campo `plan.estado` (`Activo`, `Suspendido`, `Cancelado`) y la fecha de expiración/renovación según la respuesta del proveedor de pagos.
- **Frontend (`MiPlan` / `Upgrade`):**
  1. Integrar el botón/modal de pago o checkout para permitir al usuario cambiar de plan o renovar su suscripción directamente desde la aplicación.

---

#### TAREA 4: Selector Multi-Organización para Usuarios
*Estado previo: Pendiente para usuarios pertenecientes a múltiples organizaciones.*

- **Backend:**
  1. Permitir que un usuario (email) pueda estar asociado a más de una entidad `Organizacion`.
  2. Crear endpoint `GET /api/usuarios/mis-organizaciones` y `POST /api/usuarios/cambiar-organizacion-activa`.
  3. Actualizar la emisión de tokens JWT/sesión para incluir la `organizacionId` seleccionada en el contexto actual.
- **Frontend:**
  1. Agregar un componente Selector de Organización en la barra superior/menú de usuario cuando la cuenta pertenezca a más de una empresa o grupo ganadero.

---

### 🚨 REGLAS ESTRICTAS DE DESARROLLO:
1. **NO modificar ni incluir código relacionado con Drones ni Conteo IA.**
2. Todas las funciones Premium creadas deben incluir sus correspondientes Guards en Backend (`requireFeature`) y verificación en Frontend (`PlanContext`).
3. Ejecutar `npm test` y el build de frontend (`npm run build`) al finalizar para confirmar que el sistema compila sin errores.
4. Generar un resumen de las rutas, componentes y modelos creados o modificados.