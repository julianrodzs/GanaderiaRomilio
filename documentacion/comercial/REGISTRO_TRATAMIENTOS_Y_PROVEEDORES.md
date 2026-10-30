# Registro interno de tratamientos y proveedores

Estado: BORRADOR INTERNO. Version 0.1. Fecha: 2026-10-27.
Responsable de mantenimiento: PENDIENTE.

Este inventario parte del codigo y la documentacion; no certifica la configuracion
de las cuentas externas. No contiene credenciales ni expedientes reales.

## Actividades de tratamiento

| Actividad | Datos personales posibles | Finalidad | Acceso previsto | Conservacion |
| --- | --- | --- | --- | --- |
| Cuenta, invitacion y recuperacion | Identidad, correo, telefono, hash de clave, tokens temporales | Acceso y recuperacion | Titular y personal/administradores autorizados segun funcion | PENDIENTE por categoria; verificar vencimientos tecnicos |
| Membresia y asignaciones | Usuario, rol, organizaciones, fincas y tareas | Autorizacion y coordinacion | Personas autorizadas del cliente y operador | PENDIENTE |
| Operacion ganadera y finanzas | Responsables, proveedores, compradores y texto libre | Funciones contratadas | Segun rol, organizacion y finca | PENDIENTE; separar registros contables y datos personales |
| Fotos y apariencia | Autor, archivos, posibles personas, ubicacion y EXIF | Identificacion y personalizacion | Apariencia publica; fotos de animal autenticadas | PENDIENTE; incluir objetos reemplazados y caches |
| Conteo de dron | Imagenes y metadatos, posibles personas o predios identificables | Inferencia y revision humana | PENDIENTE: comprobar flujo y proveedores del despliegue real | PENDIENTE |
| Auditoria y seguridad | Usuario, correo, IP, agente, accion, fechas y resultado | Seguridad y trazabilidad | Acceso restringido | PENDIENTE; auditoria inmutable no equivale a conservarla para siempre |
| Correo | Destinatario, contenido operativo y resultados de envio | Invitaciones, recuperacion y avisos habilitados | Proveedor de correo y operadores autorizados | PENDIENTE |
| Facturacion | Plan, consumo y referencias de proveedor de pago si se habilita | Suscripcion y obligaciones comerciales | Cliente autorizado, operador y proveedor contratado | PENDIENTE |
| Soporte y derechos | Contacto, solicitudes y evidencia minimizada | Atencion y cumplimiento | Personal autorizado | PENDIENTE |
| Almacenamiento local | Sesion, tareas, inventario, potreros y eventos segun funcion | Operacion offline/PWA | Dispositivo y usuario autorizado | PENDIENTE; probar cierre, expiracion y limpieza |

Para cada actividad completar responsable/encargado segun funcion real, habilitacion
juridica, campos obligatorios, destinatarios, medidas y plazos. La informacion de
animales puede vincularse a personas; no se debe excluir en bloque de la evaluacion.

## Proveedores y recursos a verificar

| Servicio identificado en el proyecto | Funcion | Estado conocido | Pendiente antes de publicar |
| --- | --- | --- | --- |
| Vercel | Entrega del frontend | Stack previsto/documentado | Entidad contractual, plan comercial permitido, logs, regiones, acuerdo de tratamiento |
| Render | Backend y potencial IA | Stack previsto/documentado | Servicios realmente activos, regiones, red, retencion de logs y accesos |
| MongoDB Atlas | Base de datos | Stack previsto/documentado | Cluster/region, acceso, respaldos, restauracion, contrato |
| Cloudflare R2 | Objetos publicos y privados | Cargas funcionando segun prueba del operador | Contratos, ubicacion aplicable, politicas, acceso y eliminacion real |
| Resend | Correo transaccional | Integracion existente | Cuenta activa, dominio/remitentes reales, contenido y retencion del proveedor |
| Stripe | Cobros y portal | Codigo preparado; habilitacion comercial no confirmada | Elegibilidad, contrato, entorno, pruebas y datos antes de ofrecer cobros |
| Servicio IA FastAPI | Conteo de dron | Servicio en el repositorio | Operador, hosting, modelo/licencias, flujo de archivos y retencion |
| Fondo remoto generico del acceso | Recurso visual externo cuando no hay imagen propia | Referencia externa existente | Host efectivo, datos enviados por navegador y posible sustitucion por recurso propio |

No llamar subencargado a todo proveedor sin determinar su rol. Algunos pueden tener
finalidades propias, especialmente pagos. Completar entidades juridicas y lista
publicable tras revisar sus contratos; los nombres de producto no bastan.

## Retencion y salida por completar

| Categoria | Inicio de computo | Plazo aprobado | Excepcion y responsable | Metodo y evidencia |
| --- | --- | --- | --- | --- |
| Cuenta y membresias | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| Registros operativos | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| Imagenes R2 activas y reemplazadas | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| Auditoria y logs | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| Invitaciones y recuperacion | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| Facturacion y evidencia contractual | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| Correos y soporte | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| Respaldos y caches | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| Copias locales del navegador | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |

TTL de un token no determina el plazo legal de una cuenta. Un respaldo no es un
archivo contractual permanente. No programar un borrado global a partir de esta
tabla sin aprobar alcance, restricciones, prueba aislada y restauracion.

## Cambios

| Fecha | Cambio | Verificador | Evidencia privada |
| --- | --- | --- | --- |
| 2026-10-27 | Inventario inicial documental | Pendiente de validacion del operador | PENDIENTE |
