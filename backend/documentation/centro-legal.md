# Centro Legal de prueba

Fecha de implementación: 2026-11-10. Alcance: páginas públicas, aceptación
diferenciada y evidencia inmutable. No certifica cumplimiento jurídico.

## Documentos y publicación

Se publican exclusivamente cuatro fuentes de documentacion/comercial:

| Documento público de prueba | Ruta |
| --- | --- |
| TERMINOS_DEL_SERVICIO.md | /legal/terminos |
| POLITICA_DE_PRIVACIDAD.md | /legal/privacidad |
| CONDICIONES_DE_SUSCRIPCION.md | /legal/suscripciones |
| CONDICIONES_DE_SOPORTE.md | /legal/soporte |

El índice es /legal. Las fichas del operador, órdenes particulares, anexo
contractual, procedimientos de incidentes y registro de proveedores NO se copian
al frontend ni aparecen en el catálogo público.

Los cuatro textos siguen siendo borradores sin aprobación: 0.9-borrador,
BORRADOR_PRUEBA. fechaVigencia identifica la fecha de referencia de la prueba,
no una entrada en vigor jurídica. El contenido conserva sus campos pendientes.
Las vistas muestran el aviso y noindex; los registros guardan también el estado
de borrador. No deben presentarse estas evidencias como aceptación de un contrato
definitivo ni habilitan por sí solas campañas comerciales.

Para actualizar las copias de prueba desde la raíz:

```sh
node scripts/generarCatalogoLegal.cjs
```

El generador usa una lista cerrada, normaliza CRLF a LF antes de calcular SHA-256
y produce dos artefactos idénticos: backend/config/documentosLegales.catalogo.json
y frontend/src/legal/documentos.json. No son dos textos editables independientemente.
Esto permite desplegar backend y frontend con Root Directory separados en Render,
sin acceso en producción a archivos hermanos del repositorio. El frontend puede
mostrar los textos sin API ni sesión; el backend valida su versión y hash antes
de guardar evidencia. Un frontend desactualizado debe renovar la versión mostrada,
no aceptar silenciosamente el texto nuevo. No cambiar el texto de una versión
aprobada: conservar su copia y crear una nueva versión al salir de borrador.

## Aceptación según situación

- Alta asistida nueva: el usuario designado en representanteLegalUsuarioId y su
  invitación inicial marcada por el servidor aceptan comercial + privacidad en
  casillas independientes. Se guardan dos evidencias comerciales, una por documento.
- Colaboradores, incluidos otros administradores invitados: reglas individuales y
  privacidad, nunca los cargos ni las condiciones de suscripción de la organización.
- Cuenta: aceptación voluntaria de documentos actuales y consulta del historial
  personal. Solo el titular puede aceptar comercial por la organización. Para
  organizaciones legadas sin titular designado se admite al Administrador con
  membresía principal; revisar la representación real antes de contratación definitiva.
- Comunicaciones opcionales: false por defecto, cambio por petición expresa,
  registro nuevo al otorgar o revocar; nunca modificar la evidencia anterior.

No se exige aceptación en cada login ni se insertan registros para cuentas antiguas.
El antiguo campo Usuario.consentimiento se conserva como dato legado, pero no
cuenta como evidencia del catálogo. Su endpoint antiguo devuelve 410 e indica el
nuevo flujo, sin convertir versiones arbitrarias en aceptaciones válidas.

## Evidencia y seguridad

AceptacionLegal conserva usuario, organización, rol, contexto, tipo, decisión,
documento, versión, estado, copia exacta, SHA-256, declaración de la casilla,
fecha de servidor, IP y user-agent. Estos dos últimos no se muestran en el listado
personal. Lecturas aisladas por organización y usuario. No se aceptan identidades,
versiones, hashes, fechas o roles arbitrarios en el payload de evidencia.

Cada solicitud tiene claveIdempotencia; el índice único y la comprobación del
contenido evitan duplicados por reintento. Una clave reutilizada con otros datos
devuelve 409. Los registros no admiten save de edición, update, replace, delete
ni bulkWrite. Estas protecciones son de la aplicación: un administrador con acceso
directo a MongoDB sigue teniendo las facultades de su credencial; aplicar privilegios
mínimos y respaldos.

Usuario, membresía, consumo de invitación y evidencias se confirman juntos. Si
falta una aceptación o falla la evidencia, la transacción revierte la activación.
El escenario se obtiene de la invitación del servidor, no de una casilla ni rol
enviado por el navegador. La incorporación de una cuenta existente también usa
transacción, sin consumir primero la invitación fuera de ella.

## Endpoints

- GET /api/legal/documentos y GET /api/legal/documentos/:slug: públicos, sin DB.
- GET /api/invitaciones/contexto?token=: valida invitación pendiente, no devuelve
  correo ni token. No guardar en caché.
- POST /api/invitaciones/aceptar y alias /api/auth/aceptar-invitacion: nueva cuenta.
- POST /api/usuarios/invitaciones/aceptar: cuenta existente autenticada.
- GET /api/legal/estado: historial propio, permisos y estado de los documentos.
- POST /api/legal/aceptaciones: casillas y referencias {slug,version,hashSha256}.
- PATCH /api/legal/comunicaciones: otorgado y referencia de privacidad.

Las rutas privadas siguen exigiendo usuario/membresía activa, pero la suscripción
vencida o una finca excedente de solo lectura no bloquean la gestión legal. Las
páginas públicas no pasan por auth, cuotas ni selección de finca.

## Despliegue

1. Revisar los borradores y sus pendientes. Este sprint no los aprueba ni inventa
   datos del operador, contactos, garantías o condiciones comerciales.
2. Respaldar y ejecutar en backend npm run indexes:legal, con las variables de la
   base correcta. Es aditivo: solo crea índices de AceptacionLegal, no migra usuarios
   ni elimina documentos/índices existentes. No se ejecutó contra Atlas al desarrollar.
3. Desplegar backend y frontend con el mismo catálogo. No hay variables nuevas.
4. En el Static Site Render verificar Rewrite /* -> /index.html, después de reglas
   específicas. Permite abrir o recargar /legal y /legal/* directamente.
   Mientras sean borradores, configurar además la cabecera X-Robots-Tag: noindex
   para /legal y /legal/* en el Static Site, reforzando la metaetiqueta del frontend
   incluso para robots que no ejecuten JavaScript. La API pública ya la incluye.
5. Comprobar login cerrado, sesión vencida, móvil, impresión, descargas y actualización
   del Service Worker. La API /api/ sigue excluida del fallback PWA.
6. Enlazar desde la landing a las mismas URLs de la app, no copiar otros textos. La
   landing externa no se modifica desde este repositorio.
7. Antes de uso comercial definitivo: completar y revisar textos jurídicamente,
   asignar versión aprobada y fecha real, retirar noindex solo para documentos
   vigentes y solicitar las acciones nuevas que correspondan. No reclasificar una
   aceptación de prueba como si hubiera aceptado un documento aprobado posterior.

## Verificación

- npm test backend: 508/508 PASS, sin omitidas, salida 0. Incluye 27 comprobaciones
  nuevas de catálogo y MongoDB real con HTTP, aislamiento, inmutabilidad y rollback.
- npm test frontend: 80/80 PASS, salida 0.
- Smoke integrado actualizado: 16/16 pasos y 9/9 comprobaciones PASS, 78 modelos e
  índices, salida 0. Evidencias en TEMP/cir-centro-legal-final-smoke. Conserva dos
  avisos preexistentes docs?.some al inyectar fallos de auditoría para probar rollback;
  no se ocultaron ni cambiaron en este sprint.
- npm run build frontend: salida 0; npm audit --omit=dev frontend: 0 vulnerabilidades.
- Navegador aislado con API ficticia: rutas públicas, sesión corrupta/vencida,
  impresión, descarga, casillas, historial paginado y comunicaciones opcionales.
  Script frontend/tests/legal.navegador.mjs; capturas y resultado en TEMP/cir-legal-qa-*.

No se modificó Atlas ni se enviaron correos reales. Se detectó falta de espacio
local durante las primeras ejecuciones conjuntas; se retiraron solo bases temporales
propias con ruta/loopback/PID finalizado verificados, conservando sus logs. Las suites
completas anteriores se repitieron después con salida 0; no se omitieron pruebas ni
se cambió el contrato de npm test para ocultar el problema del entorno.
