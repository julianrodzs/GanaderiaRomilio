# Imagenes de CIR Ganadero

## Organizaciones y fincas

- Un administrador carga las imagenes desde Mi plan > Imagenes de la organizacion y las fincas.
- El logo pertenece a la organizacion; Dashboard y Potreros pertenecen a cada finca.
- Estas imagenes se almacenan en el bucket publico R2. No subir contenido confidencial aqui.
- Sin una imagen personalizada, la interfaz muestra Sin imagen. No utiliza el logo o mapa locales de Romilio.
- Quitar imagen desvincula la imagen seleccionada y deja el espacio vacio; no restaura una imagen de otro cliente.
- Las referencias de imagenes existentes en R2 se conservan. No se requiere migrar ni borrar datos para este cambio.
- Las fotos de animales siguen en el bucket privado y requieren acceso autenticado.
- Se comprueba la firma del archivo. Si una imagen JPG, PNG o WebP tiene otra extension de imagen, se usa el formato real para el MIME y la clave R2, sin convertir ni modificar el archivo original del usuario.
- Un archivo no reconocido sigue rechazado aunque su nombre termine en .png. El limite de carga permanece en 8 MB.

## Identidad del acceso publico

El acceso, la recuperacion de contrasena y las invitaciones muestran CIR Ganadero, no la marca de una finca.
Antes de iniciar sesion no se consulta una organizacion para elegir la marca del producto.

Para usar imagenes propias del producto, subirlas al bucket publico desde Cloudflare, por ejemplo:

```
producto/logo.webp
producto/acceso.webp
```

Configurar sus URLs completas en frontend/.env para desarrollo o en el proyecto frontend de Vercel:

```dotenv
VITE_LOGO_PRODUCTO_URL=https://imagenes-cirganadero.circonsulting.net/producto/logo.webp
VITE_LOGIN_IMAGEN_URL=https://imagenes-cirganadero.circonsulting.net/producto/acceso.webp
```

Las rutas son ejemplos: deben coincidir con los objetos realmente subidos. No se crean automaticamente.
Estas variables contienen solo URLs publicas, nunca credenciales R2. Reiniciar Vite o reconstruir el frontend al cambiarlas.

Sin esas variables, el producto muestra su nombre y la sigla CIR como texto; el fondo generico remoto de acceso se mantiene.
No cambian SMTP, remitentes, credenciales de correo, membresias ni permisos.
