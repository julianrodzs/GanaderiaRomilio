# GanaderiaRomilio

Aplicacion fullstack para gestion ganadera: inventario, potreros, rotaciones, plan sanitario, finanzas, importacion Excel, reportes y conteo por drone.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Base de datos: MongoDB Atlas
- Despliegue recomendado: Vercel para frontend y Render para backend

## Desarrollo local

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Variables de entorno

Backend: copia `backend/.env.example` como `backend/.env`.

Frontend: copia `frontend/.env.example` como `frontend/.env`.

## Despliegue

- Frontend en Vercel: ver `DEPLOY_VERCEL.md`.
- Backend en Render: ver `DEPLOY_RENDER.md`.

## Seguridad

No subir archivos `.env` al repositorio. Configurar las variables reales directamente en Vercel, Render y MongoDB Atlas.

## Correos

El backend esta preparado para enviar correos con Resend.

Variables necesarias en Render:

```env
RESEND_API_KEY=
EMAIL_FROM=Ganaderia Romilio <onboarding@resend.dev>
EMAIL_ADMIN=
```

Los avisos administrativos se envian a todos los usuarios con rol `Administrador`. `EMAIL_ADMIN` queda como respaldo si no hay administradores registrados.
