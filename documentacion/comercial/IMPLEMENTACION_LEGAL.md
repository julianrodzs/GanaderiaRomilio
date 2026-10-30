# Especificacion para publicacion y aceptacion legal

Estado: PROPUESTA TECNICA, no implementada por este paquete documental.
Version 0.1. Fecha: 2026-10-27.

## Estado actual y limite de este trabajo

Se crean borradores Markdown, plantillas y procedimientos. No se modifican el
login, invitaciones, modelos, rutas, consentimientos, pagos, correos ni datos reales.
La auditoria tecnica de acciones existente no sustituye una evidencia contractual
que incluya la version exacta del texto presentado.

## Ubicacion propuesta

| Punto | Comportamiento propuesto |
| --- | --- |
| `/legal/terminos` | Pagina publica, version, vigencia y copia descargable/imprimible. |
| `/legal/privacidad` | Pagina publica y canal de derechos. |
| `/legal/suscripciones` | Condiciones de pago, renovacion, salida y limites. |
| `/legal/soporte` | Canal, horario y alcance aprobados. |
| Login | Enlaces discretos sin exigir aceptacion en cada acceso. |
| Activacion e invitacion | Reglas de uso e informacion de privacidad antes de continuar. |
| Mi Plan, antes de contratar | Orden, importe final, impuestos, periodo y renovacion; aceptacion del representante. |
| Configuracion, Legal | Versiones informadas/aceptadas y copias consultables. |

Son rutas propuestas, no URLs existentes. No publicarlas mientras haya marcadores,
texto PENDIENTE o documentos sin aprobacion. El acceso a informacion y ejercicio de
derechos no debe depender de una suscripcion activa.

## Separar acciones y facultades

- Aceptacion contractual: representante autorizado de la organizacion; no cualquier
  colaborador invitado. No crear un cargo al activar una invitacion.
- Reglas individuales de uso: aplicar a cada usuario, sin hacerlo garante del contrato.
- Privacidad: entregar informacion y obtener consentimientos especificos cuando
  procedan. Leer una politica no equivale a autorizar todas las finalidades.
- Publicidad: no habilitada por estos documentos; consentimiento separado si se decide
  implementarla, sin preseleccion ni condicionarla al servicio necesario.
- Renovacion automatica: autorizacion especifica con importe y periodicidad, no
  deducida de un checkbox generico.

## Catalogo y evidencia propuesta

Mantener documentos aprobados inmutables con `documentoId`, `version`, contenido
exacto, huella de contenido, idioma, vigencia y aprobador. Identificar a que orden
o conjunto de condiciones pertenece cada aceptacion. Una huella sola no conserva
el texto ni demuestra que el usuario lo vio.

Registro separado de aceptacion, a implementar con la arquitectura existente:

| Campo propuesto | Origen/control |
| --- | --- |
| Organizacion y usuario | Contexto autenticado del backend; nunca confiar en IDs arbitrarios del body. |
| Orden o contratacion | Referencia validada y representacion comprobada. |
| Tipo de acto | Contratacion, reglas de uso, consentimiento especifico o revocacion. |
| Documento, version, huella y finalidad si aplica | Catalogo aprobado validado por backend. |
| Fecha de presentacion/aceptacion | Datos de servidor; secuencia verificable. |
| Canal | Web, alta manual u otro con evidencia y verificador. |
| Evidencia de accion | Confirmacion expresa, sin preseleccion, texto de la declaracion presentado. |
| Datos tecnicos adicionales | Solo si necesarios y justificados; IP/UA no obligatorios por defecto. |

Proteger contra duplicados por reintento, edicion y acceso entre organizaciones.
No aceptar versiones inexistentes o retiradas para nuevas contrataciones ni marcar
usuarios antiguos como aceptantes sin una accion real. Una aceptacion anterior no
se sobrescribe al actualizar el documento; la revocacion tampoco borra su evidencia
cuando deba conservarse legitimamente.

## Publicacion y mantenimiento

1. Resolver ficha y obtener aprobacion comercial, operativa y juridica.
2. Generar versiones publicables sin notas internas y guardar copias inmutables.
3. Mostrar y entregar textos antes del acto de contratacion o consentimiento.
4. Guardar evidencia autorizada en backend y entregar confirmacion al destinatario.
5. Notificar cambios sustanciales y solicitar nueva aceptacion cuando corresponda.
6. Conservar accesibles las condiciones aplicables a contratos anteriores; una pagina
   actualizada no modifica retroactivamente una orden existente.

No es necesario agregar un banner de cookies generico sin inventario. Primero
verificar tecnologias, finalidades y normativa; despues implementar los controles
que correspondan. No activar rastreadores por defecto para justificar el banner.

## Pruebas de aceptacion para un futuro sprint

- Paginas publicas legibles en movil/tablet/escritorio, sin credenciales ni suscripcion.
- Sin marcadores pendientes ni inclusion accidental de procedimientos internos.
- Enlaces accesibles antes de enviar invitacion/contratar, imprimir y guardar copias.
- Invitado sin representacion no puede aceptar cargos por la organizacion.
- Rechazo de version falsa, documento cambiado, IDs ajenos y aceptacion preseleccionada.
- Reintentos idempotentes; registro y copia exacta no alterables por el cliente.
- Revocacion y cambios de version conservan historia y finalidad del acto.
- No usar datos offline obsoletos para aparentar nueva aceptacion recibida por servidor.
- Usuario con multiples organizaciones y suscripcion suspendida mantiene acceso a sus
  derechos sin consultar documentos privados o evidencia ajena.
- Alta manual exige evidencia real; no se migran aceptaciones ficticias.
