# Envio de correos: ritmo compartido y reintentos

Fecha: 2026-11-10. Incidente: el cron envio 10 correos operativos y un resumen,
pero Resend rechazo solicitudes adicionales por superar 10 peticiones/segundo.
El resultado parcial y la salida 1 del cron eran correctos; faltaba regular el envio.

## Contrato

- Todos los envios (alertas, resumenes, suscripciones, invitaciones y recuperacion)
  pasan por correoElectronico-service y resend-transporte-service.
- API y cron coordinan un turno cada 250 ms (ritmo objetivo de 4 solicitudes/s)
  mediante LimiteProveedorCorreo, un documento global de infraestructura en MongoDB.
  Usa el reloj del servidor MongoDB y operaciones atomicas. No contiene correos,
  cuerpos, claves API ni informacion de una finca. Todas las organizaciones comparten
  el limite porque usan el mismo equipo de Resend.
- El enfriamiento por 429 tambien se comparte entre procesos. No basta una pausa en
  memoria: el backend y el cron son procesos diferentes en Render.
- Hasta cuatro intentos por envio, con espera exponencial de 1/2/4 segundos mas
  variacion aleatoria. Retry-After es un minimo, no se recorta para enviar antes.
  Se aceptan segundos y fecha HTTP. Un plazo de 120 segundos por llamada acota las
  esperas y los intentos HTTP (30 segundos maximos cada uno); una operacion MongoDB
  en curso conserva los timeouts de la conexion existente.
- Se reintenta 429 rate_limit_exceeded, 409 concurrent_idempotent_requests,
  500/502/503/504, interrupcion de red, timeout y respuesta exitosa sin ID legible.
  No se reintentan cuotas diaria/mensual agotadas, permisos, remitente invalido ni
  conflicto de clave con contenido diferente. No se interpreta todo 429 como velocidad.
- Antes de enviar o reintentar se verifica el lease del cron; tambien durante las
  esperas. Si se pierde, no se inicia otro envio. Un envio ya iniciado no se deshace.
- Un fallo de MongoDB no habilita envio sin control. No existe un respaldo ilimitado
  en memoria que pueda sobrepasar el ritmo al reiniciar o escalar.

## Idempotencia y resultados

El cuerpo se serializa una vez y todos los intentos de una llamada usan exactamente
la misma clave. Se respetan las claves existentes de resumenes y suscripciones.
Las alertas usan destinatario, organizacion, asunto, tareas/fecha/revision y contenido
para construir una clave estable; el grupo se ordena antes de formar el mensaje.
Invitaciones y recuperacion sin clave propia generan un UUID por llamada, no por
intento ni solo por contenido, para no suprimir peticiones legitimas posteriores.

El marcador de alerta o periodo enviado se guarda despues de que Resend acepte el
correo. Un 429 recuperado no deja error final ni incrementa dos veces el contador.
Un fallo definitivo permanece pendiente y mantiene salida 1 en el cron, sin impedir
las otras fases. Logs de reintento: numero, estado, codigo y espera; sin destinatarios,
tokens, contenido ni claves API.

No es una promesa de entrega exactamente una vez: Resend conserva claves 24 horas.
Un fallo entre aceptacion del proveedor y escritura en MongoDB, cambios de contenido
o reinicios fuera de esa ventana requieren revisar los registros. Esto no es una
cola/outbox durable de mensajes: se conservan los marcadores de dominio existentes.
Aceptacion por Resend no demuestra entrega en la bandeja del destinatario.

## Despliegue en Render

1. Publicar el mismo commit en Web Service y Cron Job. No hace falta reconstruir el
   frontend para este cambio.
2. Mantener el unico job npm run job:alertas y horario 0 12 * * * (06:00 Costa Rica).
   Mantener CRON_MODE=external en la API.
3. Ambos procesos deben apuntar a la misma MONGODB_URI y MONGODB_DB/DB_NAME y a las
   credenciales/remitente correctos de Resend. Un Environment Group puede mantenerlas
   alineadas. No hay variables nuevas obligatorias.
4. La coleccion de control se inicializa en el primer envio con el indice nativo _id;
   no se necesita ejecutar migraciones ni sincronizadores de indices. La credencial
   MongoDB debe poder crear/escribir esa coleccion, igual que los demas modelos.
5. Revisar el siguiente run: un reintento recuperado puede aparecer como advertencia
   y terminar Completado. Si agota intentos, revisar la fase y el error final.
6. No pulsar Trigger Run mientras otra ejecucion siga activa: Render cancela el run
   activo antes de iniciar el manual. Un unico cron no coordina los correos enviados
   por el Web Service; esa coordinacion la realiza este limitador.

No requiere Redis, otro cron, aumentar el plan de Render ni cambiar de proveedor.
Si otra aplicacion usa el mismo equipo de Resend con otra base MongoDB, no participa
en este control; los 429 se recuperan con espera, pero hay que coordinar ese trafico.

## Referencias revisadas

- [Resend: limites compartidos, Retry-After y cuotas](https://resend.com/docs/api-reference/rate-limit).
- [Resend: errores recuperables y cuotas](https://resend.com/docs/api-reference/errors).
- [Resend: claves idempotentes y ventana de 24 horas](https://resend.com/docs/dashboard/emails/idempotency-keys).
- [Render: cron, concurrencia y Trigger Run](https://render.com/docs/cronjobs).
- [Render: variables y Environment Groups](https://render.com/docs/configure-environment-variables).
- [Proyecto p-retry: backoff y cancelacion](https://github.com/sindresorhus/p-retry).
- [Ejemplos oficiales Resend: practicas de envio](https://github.com/resend/resend-skills/blob/main/skills/resend/references/sending/best-practices.md).

Se adaptan esos patrones al fetch y Mongoose existentes, sin copiar una cola externa
ni agregar dependencias ESM al backend CommonJS.

## Verificacion local

node --test tests/correo-resend-reintentos.test.js tests/correo-limite-integracion.test.js

Las pruebas de MongoDB usan procesos nuevos en loopback y colecciones desechables,
incluidos dos procesos Node concurrentes. Los ensayos de proveedor sustituyen fetch:
no leen .env, no usan Atlas ni envian correos. La suite completa incluye regresiones
de alertas, resumenes y renovaciones con marcadores guardados solo tras exito.

Resultado de la verificacion: npm test backend 481/481 PASS, sin omitidas, salida 0;
npm run build frontend salida 0. No se ejecutaron jobs productivos ni envios reales.
