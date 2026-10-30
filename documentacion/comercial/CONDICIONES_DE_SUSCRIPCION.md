# Condiciones de suscripcion y cancelacion

BORRADOR NO PUBLICABLE. Precios finales, impuestos y politica comercial por aprobar.
Version: {{VERSION_DOCUMENTO}}. Vigencia: {{FECHA_VIGENCIA}}.

## 1. Oferta y limites

La orden aceptada debe especificar precio total, moneda, impuestos, plan, periodo,
fecha de inicio, modalidad de renovacion y medios de pago habilitados. Una prueba
gratuita no autoriza por si sola un cargo posterior.

Referencia interna tomada de `backend/config/planes.js` el 2026-10-27:

| Plan | USD/mes base | Fincas activas | Usuarios e invitaciones activas | Animales activos |
| --- | ---: | ---: | ---: | --- |
| Esencial | 10 | 1 | 3 | Una especie: 210 bovinos o 500 porcinos |
| Gestion | 20 | 2 | 8 | 2 000 en total |
| Pro | 35 | 5 | 20 | 5 000 en total |
| Premium | 60 | 10 | 50 | 10 000 en total |

PENDIENTE: sustituir o validar esta referencia contra la configuracion efectiva
antes de publicar. Los precios pueden sobreescribirse por variables de entorno;
los valores base no son una cotizacion final ni indican si incluyen impuestos.
Tratamiento aprobado de impuestos: {{TRATAMIENTO_IMPUESTOS}}.

Los limites son por organizacion, no una cuota completa por cada finca. Animales
vendidos o muertos no consumen la cuota de animales activos; su historial puede
conservarse. Las invitaciones activas reservan cupo de usuario. Esencial opera con
una especie seleccionada, no con ambos cupos simultaneamente.

Las fotografias de animales requieren Pro o Premium para carga/reemplazo; se permite
una principal por animal, con limite de carga de 8 MiB. No se ofrece almacenamiento
ilimitado por tener animales historicos ni se inventa una cuota GB no implementada.
Conteos de dron y otras funciones se ofertan segun capacidades efectivas y validacion
del servicio. Uso intensivo de Premium no equivale a disponibilidad infinita.

## 2. Cobros y renovacion

Medios habilitados: {{MEDIOS_PAGO_HABILITADOS}}. Condiciones de renovacion:
{{CONDICIONES_RENOVACION}}. El cliente recibira el comprobante que corresponda.

Solo se realizara cobro automatico cuando el mecanismo este habilitado, probado y
autorizado por el cliente con informacion previa de importe, periodicidad y salida.
No se presume Stripe disponible por existir su integracion en el codigo.

Un importe mostrado en USD no autoriza convertirlo a CRC sin informar previamente
tipo de cambio, fecha y monto final aplicables al pago concreto.

## 3. Cambios de plan y precios

El acuerdo debe establecer cuando se hace efectivo un cambio y si hay ajuste de
importe; no se presume prorrateo automatico. Una reduccion de plan no borra datos,
pero puede retirar capacidades y bloquear altas/reactivaciones sobre el nuevo cupo.
No se promete acceso a todas las funciones de un plan anterior.

Los cambios de precio y condiciones se comunicaran con {{PLAZO_AVISO_CAMBIOS}},
indicando efecto en periodos ya pagados y opciones de continuidad o cancelacion.

## 4. Cancelacion y reembolsos

El cliente puede solicitar cancelacion en {{CONTACTO_COMERCIAL}}. Se verificara la
representacion y se confirmara por escrito fecha de efecto, fin de cobros y salida
de datos. No es necesario que exista un portal de pagos para atender esta solicitud.
La orden debe indicar si opera al cierre del periodo o antes y su efecto economico.

Politica comercial por aprobar: {{POLITICA_REEMBOLSOS}}. No se establece una
prohibicion absoluta de reembolso. Retracto, garantias y otros remedios legales
aplicables prevalecen y deben revisarse antes de publicar la politica.

## 5. Impago, suspension y salida de datos

Procedimiento de avisos, subsanacion y suspension: {{PLAZO_Y_CONDICIONES_SUSPENSION}}.
Cancelar o suspender puede bloquear funciones de la app; no se promete un portal de
solo lectura permanente. La suspension no activa por si sola un borrado completo.

La exportacion se solicita por canal autorizado. Aplican
{{PLAZO_ENTREGA_EXPORTACION}} y {{VENTANA_SALIDA_DATOS}}. Se acordaran formatos,
relaciones e imagenes incluidas, con separacion de terceros y entrega segura.
Conservacion y eliminacion: {{POLITICA_RETENCION}}, {{PLAZO_BORRADO_ACTIVO}} y
{{CICLO_DEPURACION_RESPALDOS}}. Los plazos deben estar operativos antes de ofrecerlos.
