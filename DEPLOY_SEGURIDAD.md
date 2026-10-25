# Despliegue de seguridad de usuarios

## Antes del despliegue

- Crear un respaldo verificable de MongoDB y ensayar restauración en staging.
- Configurar `JWT_SECRET` con al menos 32 caracteres aleatorios, `JWT_ISSUER` y `JWT_AUDIENCE`.
- Configurar `FRONTEND_URL` con el dominio HTTPS definitivo y `RESEND_API_KEY` con un remitente validado.
- Confirmar que Render envía `X-Forwarded-Proto: https`; la API confía en un solo proxy.
- Desplegar primero en staging y ejecutar `npm test`, `npm audit` y el build del frontend.

## Inmediatamente después

1. Rotar `JWT_SECRET`. Esto invalida todos los JWT emitidos antes del despliegue.
2. Cambiar las contraseñas de todas las cuentas con `esSuperAdministrador = true`.
3. Revisar y retirar cualquier membresía tenant de cuentas superadministradoras.
4. Ejecutar en modo lectura: `npm run diagnostico:u01`.
5. Revisar manualmente el JSON del diagnóstico antes de modificar cuentas o membresías.
6. Previsualizar la redacción: `npm run migrate:auditoria-redactar:check`.
7. Aplicarla una sola vez: `npm run migrate:auditoria-redactar`.
8. Confirmar en Auditoría el evento `Redacción de datos sensibles`.

## Comprobación funcional

- Una edición administrativa de usuario con `correo`, `nombre` o `contrasena` debe devolver `400`.
- Una invitación a una cuenta existente no debe crear membresía hasta ser aceptada por ese mismo correo.
- Un JWT anterior a un cambio o restablecimiento de contraseña debe devolver `401 SESSION_REVOKED`.
- No debe ser posible degradar, inactivar ni eliminar al último administrador activo.
- Las imágenes de dron deben devolver `404` fuera de las fincas autorizadas.
- Cerrar sesión con cambios offline debe ofrecer sincronizar o descartar y después limpiar todo el contexto local del usuario.
- `npm audit --omit=dev` y `npm audit` deben reportar 0 vulnerabilidades.

## Observabilidad y reversión

- Vigilar respuestas `401`, `403`, `409` y `429`, además de errores del almacén distribuido de rate limit.
- Conservar el respaldo previo y el secreto JWT anterior solo durante la ventana de reversión, en el gestor de secretos.
- No restaurar registros de auditoría sin redacción en producción; si se revierte código, mantener el secreto JWT rotado.
