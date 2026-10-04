# Despliegue Backend en Render

Configuracion del servicio Web en Render:

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Variables de entorno:

```env
MONGODB_URI=
FRONTEND_URL=
IA_SERVICE_URL=
IA_INTERNAL_TOKEN=
JWT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=Ganaderia Romilio <onboarding@resend.dev>
EMAIL_ADMIN=
CRON_MODE=external
CRON_SECRET=
CRON_LOCK_MS=1800000
EMAIL_DIGEST_INTERVAL_MS=3600000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ESENCIAL=
STRIPE_PRICE_GESTION=
STRIPE_PRICE_PRO=
STRIPE_PRICE_PREMIUM=
```

Precios configurables de planes (opcionales):

```env
PLAN_PRECIO_ESENCIAL_USD=6
PLAN_PRECIO_GESTION_USD=12
PLAN_PRECIO_PRO_USD=20
PLAN_PRECIO_PREMIUM_USD=35
```

Valores esperados:

- `MONGODB_URI`: cadena de conexion de MongoDB Atlas.
- `FRONTEND_URL`: URL final de Vercel, por ejemplo `https://tu-frontend.vercel.app`.
- `IA_SERVICE_URL`: URL privada o restringida del servicio IA. En producción es obligatoria para procesar conteos.
- `IA_INTERNAL_TOKEN`: secreto largo compartido únicamente entre el backend Node y el servicio IA.
- `JWT_SECRET`: clave larga y privada para firmar tokens.
- `RESEND_API_KEY`: API key creada en Resend.
- `EMAIL_FROM`: remitente de correos. Para pruebas puede ser `Ganaderia Romilio <onboarding@resend.dev>`.
- `EMAIL_ADMIN`: compatibilidad legada; las alertas SaaS se envian solo a administradores activos de la organizacion.
- `CRON_MODE`: usar `external` en el Web Service cuando exista un Cron Job independiente.
- `CRON_SECRET`: secreto largo para invocar el endpoint HTTP de cron. No es necesario para el Cron Job CLI de Render, pero conviene configurarlo.
- `CRON_LOCK_MS`: duracion maxima del bloqueo distribuido; por defecto 30 minutos.
- `STRIPE_SECRET_KEY`: clave privada del entorno Stripe correspondiente.
- `STRIPE_WEBHOOK_SECRET`: secreto de firma entregado por Stripe para el endpoint del backend.
- `STRIPE_PRICE_*`: identificadores `price_...` de cada suscripción mensual.

Pasos:

1. Conecta el repositorio de GitHub en Render.
2. Crea un Web Service.
3. Selecciona el directorio `backend` como root.
4. Configura las variables de entorno.
5. Usa `npm install` como build command.
6. Usa `npm start` como start command.

## Trabajo programado de alertas

La opcion recomendada para este stack es un **Render Cron Job**, porque ejecuta el mismo codigo Node y comparte MongoDB Atlas con el backend.

Configuracion:

- Root Directory: `backend`
- Build Command: `npm install`
- Command: `npm run job:alertas`
- Schedule: `0 12 * * *`

`0 12 * * *` corresponde a las 06:00 de Costa Rica. Render interpreta el horario en UTC.

En el Web Service establecer:

```env
CRON_MODE=external
```

La ejecucion usa un bloqueo distribuido en MongoDB. Si Render reintenta o dos servicios disparan el trabajo al mismo tiempo, solamente uno procesa alertas y correos.

Como alternativa, cualquier monitor o servicio de cron HTTP puede ejecutar:

```http
POST https://TU_BACKEND.onrender.com/api/cron/alertas
Authorization: Bearer TU_CRON_SECRET
```

El endpoint no usa credenciales de usuario. Requiere exclusivamente `CRON_SECRET`. No configurar simultaneamente el Cron Job CLI, el cron HTTP y `CRON_MODE=internal`, aunque el bloqueo evita ejecuciones concurrentes.

## Resúmenes Premium por correo

Crear un segundo Render Cron Job con la misma base de código:

- Root Directory: `backend`
- Build Command: `npm install`
- Command: `npm run job:resumenes-email`
- Schedule: `0 * * * *`

El job revisa cada hora la zona horaria, frecuencia y hora preferida de cada usuario Premium. `ultimoPeriodo` evita enviar dos veces el mismo resumen aunque Render reintente la ejecución. Como alternativa puede invocarse `POST /api/cron/resumenes-email` con `Authorization: Bearer TU_CRON_SECRET`.

## Facturación Stripe

1. Crear un producto y precio mensual para cada plan y configurar los cuatro `STRIPE_PRICE_*`.
2. Configurar el Customer Portal de Stripe para cambios de plan, cancelaciones y métodos de pago.
3. Registrar el webhook `https://TU_BACKEND.onrender.com/api/facturacion/webhook/stripe`.
4. Suscribir al menos estos eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` e `invoice.payment_failed`.
5. Copiar el secreto de firma del endpoint a `STRIPE_WEBHOOK_SECRET`.

El webhook recibe el cuerpo crudo antes de `express.json`, valida la firma e impide procesar dos veces un mismo evento. Las tarjetas se capturan únicamente en Checkout o Customer Portal; la aplicación no almacena datos de pago.

## Migracion SaaS inicial

Antes de desplegar la version multiempresa sobre una base con datos anteriores, ejecutar desde un entorno con acceso a Atlas:

```bash
cd backend
npm run migrate:saas:check
npm run migrate:saas
npm run verify:saas
npm run verify:saas:api
```

La migracion es idempotente. No desplegar el backend multiempresa contra datos sin `organizacionId`: el aislamiento falla de forma cerrada y esos documentos no seran visibles hasta migrarlos.
