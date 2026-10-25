# Cierre pre-lanzamiento: remediacion final

Fecha: **25 de octubre de 2026, America/Costa_Rica**.
Entorno verificado: Windows, Node **24.16.0**, Mongoose **8.24.1**, MongoDB **8.0.5** real en replica set local y Microsoft Edge **156.0.4314.42**.

## Dictamen ejecutivo

**GO tecnico local. CL-01 a CL-13 remediados y todas las verificaciones obligatorias en PASS.**

El smoke integrado termino **16/16 PASS**, con los **65 modelos e indices productivos verificados**, sin retirar el indice de eventos de la base del smoke y sin usar recuperacion de contrasena como continuacion del onboarding. Tambien pasaron **9 comprobaciones adicionales** de integridad, rollback, moneda y migracion de indices.

La ejecucion completa termino con **12/12 comandos en salida 0**. Backend: **346/346 pruebas**; frontend: **6/6 lunar y 5/5 tareas**; cinco reproductores en PASS; compilacion sin advertencias de chunks mayores a 500 kB; ambas auditorias npm con **0 vulnerabilidades de produccion**.

Este dictamen certifica el codigo y los ensayos locales reproducibles. El despliegue debe aplicar las variables, el replica set y los indices en la base real antes de abrir trafico. No se certificaron credenciales, Price IDs de Stripe, entrega de correo, copias de seguridad ni infraestructura de un servicio externo. No se modifico una base de clientes ni se enviaron correos reales: las pruebas usan bases nuevas en loopback y correo interceptado.

Evidencia global: [resultado de la pasada completa](backend/documentation/cierre-remediacion-resultados.json).
La [auditoria inicial](AUDIT_CIERRE_PRE_LANZAMIENTO_INICIAL.md) conserva el dictamen NO-GO anterior como referencia historica; esta version lo sustituye.

## Resultados finales

| Verificacion | Resultado | Evidencia |
|---|---|---|
| Smoke HTTP, MongoDB real e indices intactos | **16/16 PASS + 9 controles adicionales** | [JSON](backend/documentation/cierre-smoke-resultados.json), [log](backend/documentation/cierre-smoke-ejecucion.txt) |
| Cinco reproductores | **5/5 PASS**, salida 0 en todos | [Inventario](backend/documentation/cierre-reproductores.json) |
| Fincas/organizaciones | **36 controles + 648 casos HTTP adaptados** | [Log](backend/documentation/cierre-auditoria-fincas-organizaciones.repro.txt) |
| Importaciones | **49/49 PASS** | [Log](backend/documentation/cierre-auditoria-importaciones.repro.txt) |
| Lotes/engorde | **64/64 PASS** | [Log](backend/documentation/cierre-auditoria-lotes-engorde.repro.txt) |
| Reportes | **59/59 PASS** | [Log](backend/documentation/cierre-auditoria-reportes.repro.txt) |
| Usuarios | **37/37 PASS** | [Log](backend/documentation/cierre-auditoria-usuarios.repro.txt) |
| Arranque negativo real | **6/6 PASS**, nunca abre HTTP | [JSON](backend/documentation/cierre-standalone-resultados.json) |
| Configuracion/seguridad/PWA | **7/7 PASS** | [JSON](backend/documentation/cierre-configuracion-resultados.json) |
| Cruce API/offline/IndexedDB adaptado | **3/3 PASS** | [JSON](backend/documentation/cierre-offline-resultados.json) |
| PWA en navegador Edge real | **PASS**: API sin cache ni fallback HTML, shell v1 a v2 | [JSON](backend/documentation/cierre-pwa-navegador-resultados.json) |
| Backend npm test | **346/346 PASS**, sin omitidas | [Log](backend/documentation/cierre-backend-tests.txt) |
| Frontend test:lunar | **6/6 PASS** | [Log](backend/documentation/cierre-frontend-lunar.txt) |
| Frontend test:tareas | **5/5 PASS**, incluido 401 despues de limpiar sesion | [Log](backend/documentation/cierre-frontend-tareas.txt) |
| Frontend build | **PASS**, mayor chunk **490,19 kB**, sin advertencia >500 kB | [Log](backend/documentation/cierre-frontend-build.txt) |
| Backend npm audit --omit=dev | **0 vulnerabilidades**, salida 0 | [JSON](backend/documentation/cierre-backend-npm-audit.json) |
| Frontend npm audit --omit=dev | **0 vulnerabilidades**, salida 0 | [JSON](backend/documentation/cierre-frontend-npm-audit.json) |

Las cifras de los reproductores se solapan con npm test; no se suman como pruebas independientes. Los cuatro reproductores historicos comparten ahora los adaptadores mantenidos en las suites del modulo y declaran su mapa de cobertura. El smoke separado prueba las rutas HTTP y la persistencia real.

## Cierre de CL-01 a CL-13

| Hallazgo | Correccion aplicada | Criterio comprobado |
|---|---|---|
| **CL-01** | Indice unico parcial string en EventoAnimal; claves vacias/nulas omitidas; Animal, reserva de camada y evento inicial dentro de una transaccion. EventoCamada no declara ese indice defectuoso. | Cuatro eventos sin clave se guardan; misma clave se deduplica; duplicado directo recibe E11000; fallo de evento deja **0 animales parciales**. |
| **CL-02** | Aprovisionamiento crea Invitacion formal con hash y 72 h. Usuario nuevo y membresia esperan inactivos; aceptacion transaccional activa ambos, cambia contrasena, incrementa tokenVersion, limpia reset y consume la invitacion. | Aprovisionamiento **201**, aceptacion directa **200**, replay **400**; sin rodeo por reset. |
| **CL-03** | ordered:true en creaciones por arreglo con sesion, incluidas ramas condicionales. Los eventos de traslado conservan finca origen/destino con la opcion interna del plugin. | Traslado, transferencia, gasto y ambas anulaciones funcionan; fallo intermedio revierte todas las partidas y marcas; reanular no duplica contrapartidas. |
| **CL-04** | Validador de produccion para URI MongoDB valida, JWT y cron de 32 caracteres/16 distintos, FRONTEND_URL HTTPS. hello y transaccion de lectura antes de escuchar. | Falta de URI/JWT/cron, JWT repetido, frontend HTTP y MongoDB standalone abortan con salida **1**, sin abrir HTTP. El ensayo que espera esos rechazos termina **0**. |
| **CL-05** | autoIndex desactivado por defecto en produccion; sincronizador determinista de los 65 modelos con limpieza de indice obsolete y verificacion de unique, partialFilterExpression, sparse y TTL. | Indices reales de 65 modelos correctos; migracion sparse a parcial en otra base; script CLI en modo produccion ejecutado dos veces y ambas salidas **0**. |
| **CL-06** | EMAIL_TEST_TO ignorado en produccion en destinatarios administrativos y alertas; aviso de configuracion al arrancar. | Ensayo confirma que el destinatario de pruebas no se utiliza en produccion. |
| **CL-07** | body-parser **1.20.9** deduplicado tambien para Express; multer **2.5.0**; lockfile actualizado. | Dos auditorias npm de produccion en cero y suites/importacion HTTP en PASS. |
| **CL-08** | Defaults **10/20/35/60 USD**; variables documentadas. Checkout consulta Stripe Price y exige activo, USD, monto exacto y periodo mensual de un mes. Una variable de precio vacia conserva el default. | Los cuatro planes pasan la matriz de precio correcto y rechazan monto, moneda, estado, tipo o recurrencia incorrectos con BILLING_PRICE_MISMATCH. Sin cobros externos. |
| **CL-09** | Los cuatro reproductores antiguos ejecutan las suites vigentes del dominio mediante ejecutar-regresion.cjs; conservan mapas explicitos de cobertura y propagan salida 1 ante fallo. | Los cinco .repro.cjs encontrados terminan **0**; ya no se exige reproducir vulnerabilidades corregidas. |
| **CL-10** | Contrato explicito **CRC** para compraventa de animales. POST/PUT rechazan monedas distintas; modelo valida CRC y el movimiento conserva esa moneda. | Compra y venta USD devuelven **400** sin cambiar animales, documentos comerciales ni movimientos. Compras/ventas CRC generan movimientos correctos. Finanzas general mantiene ambas monedas. |
| **CL-11** | lazy/Suspense para aplicacion autenticada y Sanidad; chunks separados de Reportes, Consolidacion, IATF, ImportarExcel y React. | Mayor chunk pasa de **967,87 a 490,19 kB**; entrada publica **21,53 kB**; build sin advertencia >500 kB. |
| **CL-12** | offlineSync termina controladamente ante 401, detiene el resto de la cola y evita escribir sin contexto despues de api.js. | Prueba con dos operaciones y sesion ya eliminada: **un solo envio**, promesa resuelta y ninguna segunda operacion enviada. |
| **CL-13** | Workbox excluye navegacion /api/; MiPlan toma limites bovinos, porcinos y dron del backend y muestra Usuarios e invitaciones activas. | Navegacion directa API devuelve JSON sin shell; limites sin literales duplicados en selector; PWA actualiza v1 a v2. |

## Flujo integrado comprobado

| Paso | Resultado |
|---|---|
| 1. Organizacion, finca e invitacion del administrador | PASS, 201 y 200; usuario activo, tokenVersion 1; replay rechazado |
| 2. Login, Encargado y Veterinario | PASS |
| 3. Potrero y lote de engorde | PASS |
| 4. Dos animales, pertenencias y rotacion | PASS, sin E11000 |
| 5. Pesajes y alimentacion | PASS, suministro de 20 kg |
| 6. Tratamiento y retiro de carne | PASS, venta sin confirmacion devuelve 409 |
| 7. Ciclo, parto y ternero | PASS, madre, raza, finca y cupo 2 a 3 |
| 8. Venta y movimiento automatico | PASS, CRC 900; Vendido; pertenencia cerrada |
| 9. Dashboard y reportes | PASS, 3 historicos, 2 activos, 1 parto y CRC 900 |
| X1. Traslado multifinca | PASS, bitacora individual en origen y destino |
| X2. Transferencia, gasto y anulaciones | PASS, cuatro movimientos por grupo, neto cero |
| X2R. Anulacion de grupos preexistentes sinteticos | PASS para transferencia y gasto |
| X3. Compra | PASS, egreso CRC 600 |
| X4. Importacion | PASS, preview y confirmacion transaccional |
| X5. Cron | PASS, ambos jobs HTTP y sincronizacion de categoria |
| X6. Organizaciones/fincas/tokenVersion | PASS, cambio conserva authTime/exp; finca ajena 403; token revocado 401 |

Los fallos 400/500 provocados deliberadamente en las comprobaciones negativas prueban rollback; no son continuaciones diagnosticas del flujo de negocio. Los 16 pasos se ejecutan con sus indices intactos. La migracion del indice obsoleto se ensaya en una **base temporal distinta**.

## Archivos y decisiones

- Eventos y alta atomica: [EventoAnimal](backend/models/EventoAnimal.js), [animal-controller](backend/controllers/animal-controller.js), [eventoAnimal-service](backend/services/eventoAnimal-service.js), [eventoCamada-service](backend/services/eventoCamada-service.js).
- Onboarding: [Invitacion](backend/models/Invitacion.js), [aprovisionamiento](backend/services/aprovisionamientoOrganizacion-service.js), [usuario-controller](backend/controllers/usuario-controller.js).
- Inserciones transaccionales ordenadas: servicios de consolidacion, alimentacion, aplicaciones sanitarias, estado sanitario, IATF, importacion, lotes, planes alimenticios, cobertura, engorde y reproduccion; controladores de compras, ventas, lotes, pesajes, planes y tratamientos.
- Arranque e indices: [env](backend/config/env.js), [database](backend/database.js), [entrypoint](backend/index.js), [auth](backend/middleware/auth.js), [sincronizador](backend/scripts/sincronizar-indices.js).
- Correo: [servicio de correo](backend/services/correoElectronico-service.js) y [alertas](backend/services/alertasCorreo-service.js).
- Planes/cobro: [catalogo](backend/config/planes.js), [facturacion](backend/services/facturacion-service.js), [limites](backend/services/plan-service.js), [variables de ejemplo](backend/.env.example).
- Moneda: [compras](backend/controllers/compraAnimalController.js), [ventas](backend/controllers/ventaAnimalController.js), [CompraAnimal](backend/models/CompraAnimal.js), [VentaAnimal](backend/models/VentaAnimal.js).
- UI/PWA/offline: [App](frontend/src/App.js), [ListaUsuario](frontend/src/Components/ListaUsuario.js), [MiPlan](frontend/src/pages/MiPlan.js), [offlineSync](frontend/src/services/offlineSync.js), [Vite](frontend/vite.config.js).
- Nuevas regresiones: [cierre-pre-lanzamiento](backend/tests/cierre-pre-lanzamiento.test.js), [planes](backend/tests/planes-config.test.js), [tareas offline](frontend/tests/tareasOffline.test.mjs). Scripts de cierre y reproductores actualizados en backend/documentation.

La vista de cierres historicos ya estaba conectada al endpoint de detalle; se verifico su integracion existente. Las preferencias Premium de correo ya tienen formulario, endpoints y job implementados, por lo que conservan su disponibilidad actual.

## Aplicar y repetir

El procedimiento de variables, indices, Stripe y despliegue esta en [cierre-remediacion.md](backend/documentation/cierre-remediacion.md). El sincronizador **no se ejecuta automaticamente al iniciar la API**. Debe aplicarse a staging/produccion con respaldo y una ventana sin escrituras antes de abrir trafico.

Desde backend:

```powershell
node documentation/cierre-ejecutar-remediacion.cjs
node documentation/cierre-verificar-evidencias.cjs
```

El primer comando guarda todas las salidas y no carga .env en las pruebas MongoDB. El segundo verifica las evidencias y crea el [manifiesto de hashes](backend/documentation/cierre-manifiesto.json). Los ensayos MongoDB usan un ejecutable 8 local; los scripts no aceptan URI externa para el smoke. La PWA usa perfil nuevo de Edge y bloquea destinos externos.

Pendientes operativos: configurar variables reales, ejecutar sincronizacion en la base de destino, conciliar sus cuatro Price IDs en Stripe, verificar dominio/remitente y confirmar restauracion del respaldo. Esos pasos requieren el entorno desplegado y no cambian el resultado **GO tecnico local** de esta remediacion.
