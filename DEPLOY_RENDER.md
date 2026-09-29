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
JWT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=Ganaderia Romilio <onboarding@resend.dev>
EMAIL_ADMIN=
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
- `IA_SERVICE_URL`: URL del servicio IA si se despliega; puede quedar vacia mientras el conteo use simulacion.
- `JWT_SECRET`: clave larga y privada para firmar tokens.
- `RESEND_API_KEY`: API key creada en Resend.
- `EMAIL_FROM`: remitente de correos. Para pruebas puede ser `Ganaderia Romilio <onboarding@resend.dev>`.
- `EMAIL_ADMIN`: compatibilidad legada; las alertas SaaS se envian solo a administradores activos de la organizacion.

Pasos:

1. Conecta el repositorio de GitHub en Render.
2. Crea un Web Service.
3. Selecciona el directorio `backend` como root.
4. Configura las variables de entorno.
5. Usa `npm install` como build command.
6. Usa `npm start` como start command.

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
