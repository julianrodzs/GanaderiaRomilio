# Despliegue Frontend en Vercel

Configuracion del proyecto en Vercel:

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`

Variables de entorno:

```env
VITE_API_URL=https://TU_BACKEND.onrender.com/api
```

Pasos:

1. Conecta el repositorio de GitHub en Vercel.
2. Selecciona el directorio `frontend` como root.
3. Configura la variable `VITE_API_URL`.
4. Ejecuta el deploy.
