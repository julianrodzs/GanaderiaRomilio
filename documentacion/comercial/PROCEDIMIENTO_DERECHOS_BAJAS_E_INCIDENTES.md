# Procedimiento de derechos, bajas e incidentes

Estado: BORRADOR INTERNO. Version 0.1. Fecha: 2026-10-27.
No ejecuta operaciones ni establece plazos legales definitivos.

## 1. Recepcion y clasificacion

Registrar fecha, canal, tipo de solicitud, persona, organizacion, alcance y encargado
en un expediente restringido. Solicitar solo datos necesarios. No adjuntar claves,
tokens ni copias de documentos por defecto. Confirmar recepcion sin revelar datos
de otras cuentas. Calcular fecha limite conforme a la norma y jurisdiccion aplicables;
el asesor debe definir estos plazos antes de poner este proceso en operacion.

Distinguir: consulta, acceso/rectificacion, revocacion, supresion, exportacion de
organizacion, cancelacion de suscripcion, retiro de membresia o incidente. No
convertir una solicitud de privacidad en una exigencia de contratar otro plan.

## 2. Identidad y representacion

Verificar por canal ya autenticado o mecanismo proporcional. Un administrador de
finca no representa automaticamente todos los derechos personales de colaboradores.
Una misma identidad puede tener membresias en varias organizaciones. No confirmar
a terceros la existencia de una cuenta por una consulta no verificada.

## 3. Evaluacion y respuesta de derechos

Localizar datos propios y posibles copias en MongoDB, R2, registros, correo y soporte.
Separar informacion ajena y secretos de seguridad. Establecer con el responsable
juridico lo que debe entregarse, corregirse, bloquearse, conservarse o suprimirse.
Documentar fundamento y responder por canal seguro dentro del plazo aplicable.

El historial de operaciones y la auditoria no se editan mediante borrados improvisados.
Si procede una rectificacion/supresion, usar una operacion controlada y documentada
que proteja trazabilidad y obligaciones de conservacion, con minimizacion de datos.

## 4. Cancelacion comercial y exportacion

1. Confirmar representante, organizacion y fecha de efecto conforme a la orden.
2. Revisar medio real de cobro y detener futuras renovaciones autorizadas segun el
   acuerdo. Un cambio local de plan no demuestra cancelacion ante un proveedor externo.
3. Informar efectos de acceso, cargos pendientes, ventana de salida y conservacion.
4. Preparar exportacion con formatos y alcance acordados; los reportes existentes no
   equivalen necesariamente a una exportacion completa de datos, relaciones e imagenes.
5. Probar el archivo con un cliente sintetico, revisar aislamiento y entregar mediante
   canal seguro, limitado al destinatario autorizado. Registrar entrega y expiracion.
6. Aplicar la baja segun el proceso aprobado, no borrar de inmediato por impago.

## 5. Supresion controlada

Antes de eliminar: verificar alcance, obligaciones legales, retencion y autorizacion;
preparar listado por organizacion y prueba sin escritura. Revisar pertenencias
historicas entre fincas, documentos compartidos e identidad multi-organizacion.

Tratar por separado registros activos, objetos publicos/privados R2, objetos antiguos,
logs, correos, caches y respaldos. Quitar una referencia de imagen no prueba borrar
el objeto. La revocacion de acceso no retira capturas o descargas ya realizadas.

No garantizar borrado remoto instantaneo de un dispositivo desconectado. Informar
limites y guiar limpieza local tras revisar cambios pendientes y contexto de sesion.
Los respaldos se depuran segun ciclo aprobado; una restauracion debe reaplicar las
supresiones procedentes. Registrar resultados y excepciones sin conservar copias
innecesarias de lo eliminado.

## 6. Incidentes de seguridad

1. Escalar inmediatamente al responsable designado; no prometer un plazo de
   notificacion universal ni asumir que todo error de carga es una brecha.
2. Contener accesos o credenciales afectadas, conservando evidencia minimizada.
3. Determinar clientes, personas, datos, proveedores y periodo afectados.
4. Coordinar obligaciones de aviso a cliente, titulares y autoridad con asesor juridico;
   cumplir los plazos aplicables y comunicar hechos confirmados, no especulaciones.
5. Corregir, verificar aislamiento y documentar causa, recuperacion y prevencion.

No enviar detalles de otra finca en una comunicacion masiva. No subir evidencia con
datos personales a un issue publico ni al repositorio.

## 7. Registro minimo y pruebas

Campos: identificador, recepcion, verificacion, categoria, organizacion, alcance,
responsable, fecha limite/fundamento, acciones, respuesta, entrega, cierre y
excepciones. Acceso restringido y retencion por aprobar, no indefinida.

Antes de operar probar: solicitud no autenticada, usuario con dos organizaciones,
representante sin facultades, datos ajenos, suscripcion suspendida, archivos publicos,
objeto antiguo R2, restauracion de copia y dispositivo offline. Ninguna prueba debe
usar o eliminar informacion real de un cliente sin autorizacion especifica.
