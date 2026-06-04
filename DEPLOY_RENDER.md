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
```

Valores esperados:

- `MONGODB_URI`: cadena de conexion de MongoDB Atlas.
- `FRONTEND_URL`: URL final de Vercel, por ejemplo `https://tu-frontend.vercel.app`.
- `IA_SERVICE_URL`: URL del servicio IA si se despliega; puede quedar vacia mientras el conteo use simulacion.
- `JWT_SECRET`: clave larga y privada para firmar tokens.

Pasos:

1. Conecta el repositorio de GitHub en Render.
2. Crea un Web Service.
3. Selecciona el directorio `backend` como root.
4. Configura las variables de entorno.
5. Usa `npm install` como build command.
6. Usa `npm start` como start command.
