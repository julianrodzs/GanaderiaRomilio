> Archivo historico de la auditoria inicial. El informe vigente es AUDIT_CIERRE_PRE_LANZAMIENTO.md. Las evidencias cierre-* se regeneraron durante la remediacion; este archivo conserva la narrativa inicial.

# Auditoría de cierre pre-lanzamiento

Fecha del dictamen: **24 de octubre de 2026, America/Costa_Rica**. Las evidencias registran sus horas en UTC; la continuación termina el 25 de octubre UTC, todavía día 24 en Costa Rica.

Alcance: los seis pilares de `Agents.md`, sobre el árbol de trabajo actual, incluidas las remediaciones locales aún sin confirmar en Git. HEAD de referencia: `dcb214cb67dbc2446f05a2edf2316e3d5a5b3cca`; **HEAD por sí solo no reproduce este árbol modificado**. Entorno: Windows, Node 24.16.0, Mongoose 8.24.1 y MongoDB 8.0 local. El [manifiesto de cierre](backend/documentation/cierre-manifiesto.json) conserva hashes de fuentes y evidencias, sin leer archivos `.env`.

## 1. Dictamen ejecutivo de lanzamiento

**NO-GO. No abrir el lanzamiento comercial con este estado.**

Las suites ordinarias pasan: **343 pruebas backend y 10 frontend**. La compilación de producción también termina correctamente. Sin embargo, la integración HTTP con MongoDB real y todos los índices declarados descubre bloqueos que las pruebas con repositorios simulados no detectan:

- La organización se aprovisiona, pero su administrador nuevo recibe una invitación que el endpoint de aceptación rechaza.
- El índice único de idempotencia de `EventoAnimal` impide guardar varios eventos sin clave en una misma finca. El segundo animal puede quedar persistido aunque su alta responda 400; sanidad, reproducción y compraventas también tropiezan con ese índice.
- Los traslados, transferencias internas, gastos compartidos y sus anulaciones fallan con 500 por creación múltiple dentro de transacciones sin `ordered: true`.

Además, faltan validaciones de arranque y un procedimiento completo de índices para producción; `EMAIL_TEST_TO` sigue activo en producción; `npm audit` informa dos dependencias backend con vulnerabilidades altas. La facturación comercial requiere conciliar los precios configurables con los importes de Stripe.

La PWA sí supera una prueba en Edge: no guarda la respuesta de prueba `/api/*` y adopta automáticamente una segunda versión de la aplicación cuando se comprueba la actualización del Service Worker.

**No se modificó código de negocio ni se aplicaron remediaciones.** Se añadieron scripts y evidencias de auditoría. Las escrituras de integración se limitaron a bases MongoDB nuevas, desechables, enlazadas a `127.0.0.1`, con datos sintéticos. No se cargó el `.env` de producción en esos scripts, no se contactó una base de clientes ni se enviaron correos reales. El correo se interceptó en memoria. La compilación usó la configuración normal de Vite, sin publicar sus valores privados en el informe.

No se certificaron los índices, secretos, copias de seguridad, certificados, proxy ni servicios externos de un despliegue real. Las comprobaciones locales y la inspección del repositorio se distinguen de esos requisitos de operación.

## 2. Resultados de ejecución global

Las rutas de evidencias de esta tabla son relativas a la raíz del repositorio.

| Ejecución | Resultado real | Evidencia |
|---|---|---|
| Backend `npm test` | **343/343 PASS**, 0 omitidas; 9,08 s | [Log](backend/documentation/cierre-backend-tests.txt) |
| Frontend `npm run test:lunar` | **6/6 PASS** | [Log](backend/documentation/cierre-frontend-lunar.txt) |
| Frontend `npm run test:tareas` | **4/4 PASS**; incluye conflicto e intercambio de finca offline | [Log](backend/documentation/cierre-frontend-tareas.txt) |
| Frontend `npm run build` | **PASS**, 118 módulos, advertencia de chunk grande | [Log](backend/documentation/cierre-frontend-build.txt) |
| Backend `npm audit --omit=dev --json` | **FAIL**, salida 1: **2 altas**, 0 críticas | [JSON](backend/documentation/cierre-backend-npm-audit.json) |
| Frontend `npm audit --omit=dev --json` | **PASS**, 0 vulnerabilidades de producción | [JSON](backend/documentation/cierre-frontend-npm-audit.json) |
| `auditoria-fincas-organizaciones.repro.cjs` | **PASS**, salida 0; 36 comprobaciones y 648 casos de matriz HTTP adaptada | [Log](backend/documentation/cierre-auditoria-fincas-organizaciones.repro.txt) |
| `auditoria-importaciones.repro.cjs` | **FAIL**, salida 1; **5/26** comprobaciones, 128,44 s | [Log](backend/documentation/cierre-auditoria-importaciones.repro.txt) |
| `auditoria-lotes-engorde.repro.cjs` | **FAIL**, salida 1; **4/18** comprobaciones, 80,87 s | [Log](backend/documentation/cierre-auditoria-lotes-engorde.repro.txt) |
| `auditoria-reportes.repro.cjs` | **FAIL**, salida 1; aserciones y adaptadores antiguos incompatibles | [Log](backend/documentation/cierre-auditoria-reportes.repro.txt) |
| `auditoria-usuarios.repro.cjs` | **FAIL**, salida 1; primera aserción espera 404 y recibe 401 | [Log](backend/documentation/cierre-auditoria-usuarios.repro.txt) |
| Smoke HTTP + replica set, índices intactos | **FAIL: 5/16 comprobaciones**; incluye los 9 pasos y 7 cruces adicionales | [JSON](backend/documentation/cierre-smoke-resultados.json) |
| Smoke diagnóstico, sin índice defectuoso de eventos, en otra base temporal | **FAIL: 12/16**; no constituye aprobación del producto | [JSON](backend/documentation/cierre-smoke-diagnostico-resultados.json) |
| Configuración de producción | 7 comprobaciones ejecutadas; documentan tanto controles correctos como deficiencias | [JSON](backend/documentation/cierre-configuracion-resultados.json) |
| Arranque con MongoDB standalone real | Reproducción confirmada: escucha HTTP 200 y después la transacción falla con código 20 | [JSON](backend/documentation/cierre-standalone-resultados.json) |
| Cruce `api` + `offlineSync` + `offlineStorage` | 3 escenarios ejecutados con IndexedDB adaptado; éxito, separación de finca y comportamiento ante 401 | [JSON](backend/documentation/cierre-offline-resultados.json) |
| PWA en Edge headless | **PASS**: API sin caché y shell v1 → v2 | [JSON](backend/documentation/cierre-pwa-navegador-resultados.json) |

Estos son **todos los cinco archivos `.repro.cjs` encontrados** en `backend/documentation`. El reproductor de importaciones inicialmente agotó 120 segundos; se volvió a ejecutar con límite de 300 segundos y terminó con salida 1. [Inventario de ejecuciones](backend/documentation/cierre-reproductores.json).

Los fallos de los reproductores heredados **no prueban que todos los defectos históricos sigan presentes**. Por ejemplo, usuarios conserva una expectativa de enumeración anterior; reportes espera ocho alturas distintas en un PDF y ahora observa tres; importaciones llama dependencias nuevas de organización sin simularlas y agota el buffer de Mongoose. Lotes también mezcla expectativas antiguas con consultas sin adaptar. Deben convertirse en pruebas de regresión del comportamiento corregido antes de tratarlos como barrera de lanzamiento.

La instalación y las dependencias no se actualizaron durante esta auditoría. La primera compilación no pudo iniciar correctamente esbuild dentro de la restricción del proceso; se repitió con la autorización automática de ejecución y pasó. Las consultas reales a npm también se completaron tras permitir el acceso al registro. Esas restricciones iniciales no se contabilizan como fallos del producto.

### Cruces entre módulos

| Cruce | Resultado observado |
|---|---|
| Plugin de organización ↔ traslado legítimo | **Falla 500**, tanto con índices intactos como en diagnóstico. La causa observada es `Model.create()` múltiple con sesión, no una denegación de pertenencia del usuario. |
| Plugin ↔ importación Excel | **PASS real**: preview y confirmación `solo_crear`, un bovino persistido en la finca de origen. Se probó un archivo pequeño; no es una prueba de carga ni de todas las variantes de Excel. |
| Plugin ↔ parto y ternero | Bloqueado por eventos con configuración intacta. En diagnóstico: **PASS**, madre, DIIO materno, especie, raza Brahman, finca y cupo 2 → 3 comprobados. |
| Plugin ↔ cron | **PASS real** para alertas y resúmenes: HTTP 200; el job corrige una categoría sintética desactualizada. No había correos elegibles; no certifica entrega por Resend. |
| `tokenVersion` ↔ selector de organizaciones | **PASS real**: cambio A → B → A, preserva `authTime` y `exp`; otra organización no ve animales de A. |
| Membresía ↔ `X-Finca-Id` | **PASS**: encabezado coherente permite consultar; finca de otra organización devuelve 403. Tras cambiar contraseña, el token anterior devuelve 401 en perfil, inventario y cambio de organización; nuevo login válido. |
| Sesión ↔ offline | Éxito y separación por `organización:finca:usuario` verificados. Con 401, `api.js` elimina sesión y emite expiración; `offlineSync` después intenta actualizar la cola sin contexto y rechaza la promesa. Véase CL-12; no se observó aceptación de un token revocado. |
| Protección financiera ↔ compra/venta | Bloqueada por el índice de eventos en el flujo normal. En diagnóstico: compra genera egreso CRC 600; venta genera ingreso CRC 900, estado `Vendido` y cero pertenencias activas. |
| Finanzas ↔ transferencias/gastos/anulación | **Falla 500** en las cuatro rutas. Para probar anulación independientemente del alta fallida, se sembraron grupos sintéticos preexistentes, documento por documento, únicamente en la base temporal; su anulación HTTP también falla. |

### Cómo reproducir las evidencias nuevas

Desde `backend`, con MongoDB 8 instalado localmente y dependencias existentes:

```powershell
node documentation/cierre-ejecutar-reproductores.cjs
node documentation/cierre-smoke-integrado.cjs
node documentation/cierre-smoke-integrado.cjs --diagnostico-sin-indice-eventos
node documentation/cierre-smoke-integrado.cjs --diagnostico-sin-indice-eventos --moneda-usd
node documentation/cierre-standalone.cjs
node documentation/cierre-configuracion.cjs
node documentation/cierre-offline.cjs
node documentation/cierre-pwa-navegador.cjs
```

`CIERRE_MONGOD` permite seleccionar otro ejecutable local. Los scripts MongoDB no aceptan una URI externa. La prueba PWA requiere Edge instalado y `frontend/dist` compilado. Usa un perfil temporal y bloquea destinos externos con un proxy cerrado. Los procesos propios se cierran al terminar; se conservan directorios temporales para diagnóstico. Un código de salida 1 del smoke refleja los fallos auditados y no debe ocultarse en CI.

## 3. Resultado del flujo E2E de humo

Se recorrieron las rutas HTTP reales, con middleware, cuotas, hooks, modelos, índices y transacciones reales. Es integración de API y persistencia; no automatización de formularios React. La comprobación PWA sí utilizó navegador real por separado.

**Continuaciones diagnósticas explícitas:** en ambas ejecuciones, tras fallar la invitación, se usó el mismo token en la ruta existente de restablecimiento para poder continuar. El paso 1 permanece fallido. En la segunda base, además, se retiró exclusivamente el índice defectuoso de `EventoAnimal`; no se cambió el esquema ni ninguna base existente. Los éxitos de esa columna no convierten el flujo original en válido.

| Paso | Con índices declarados intactos | Diagnóstico aislado | Evidencia/valor comprobado |
|---|---|---|---|
| 1. Organización, administrador y finca | **FAIL** | **FAIL** | Aprovisionamiento 201; aceptación de invitación 400. Continuación por reset 200. |
| 2. Login, Encargado y Veterinario | PASS después de la continuación indicada | PASS asistido | Usuarios locales con credencial temporal y roles correspondientes. |
| 3. Potrero y lote de engorde | PASS | PASS | Potrero de pastoreo de 2 ha y lote bovino. |
| 4. Dos animales, lote y rotación | **FAIL** | PASS | Segunda alta responde 400 por E11000, aunque el animal queda guardado. Sin ese índice, pertenencias y rotación funcionan. |
| 5. Pesajes y alimentación | **BLOQUEADO por paso 4** | PASS | Pesajes 420/450 kg; suministro total 20 kg, sobrante 2 kg. |
| 6. Tratamiento y alerta de retiro | **FAIL por índice de eventos** | PASS | `diasRetiroCarne=30`; venta sin confirmación devuelve 409 y un retiro activo. |
| 7. Ciclo, parto y ternero | **FAIL por índice de eventos** | PASS | Filiación materna y raza heredadas; finca correcta; uso del cupo de animales pasa de 2 a 3. |
| 8. Venta confirmada e ingreso | **FAIL por índice de eventos** | PASS | Venta CRC 900; animal `Vendido`, cero pertenencias activas, un movimiento de ingreso. |
| 9. Dashboard y resumen | **No satisface el ciclo esperado** | PASS | Endpoints 200; después del ciclo diagnóstico: 3 animales históricos, 2 activos, 1 parto e ingreso CRC 900. |

El paso 9 normal no demuestra un error independiente de cálculo: faltan operaciones anteriores que fueron bloqueadas. En la ejecución diagnóstica las cifras verificadas coinciden con los datos persistidos. Los errores 500 se observaron en los cruces multi-finca posteriores, no en estas consultas de resumen.

Se realizó también una prueba adicional enviando `moneda: 'USD'` a ventas: la API respondió 201 y guardó CRC. Se conserva en [cierre-smoke-moneda-usd-resultados.json](backend/documentation/cierre-smoke-moneda-usd-resultados.json). **La UI y el modelo de compraventa actuales operan en CRC**; por eso el smoke principal usa CRC. La prueba adicional demuestra que un campo de moneda no soportado se ignora silenciosamente, no que exista una promesa implementada de vender en USD. Los reportes reflejan correctamente el CRC persistido; no se atribuye a reportes una conversión que realizó implícitamente el contrato de venta.

## 4. Tabla maestra definitiva de los cuatro planes

Fuente ejecutada: [backend/config/planes.js](backend/config/planes.js), recogida en [cierre-configuracion-resultados.json](backend/documentation/cierre-configuracion-resultados.json). Los valores siguientes son los **defaults del código auditado**, no una lectura del entorno productivo ni de Stripe.

| Propiedad | ESENCIAL | GESTIÓN (`GESTION`) | PRO | PREMIUM |
|---|---|---|---|---|
| Precio mensual por defecto, USD | **6** | **12** | **20** | **35** |
| Variable del precio mostrado | `PLAN_PRECIO_ESENCIAL_USD` | `PLAN_PRECIO_GESTION_USD` | `PLAN_PRECIO_PRO_USD` | `PLAN_PRECIO_PREMIUM_USD` |
| Precio comercial indicado en el encargo, pendiente de conciliar | 10 | 20 | 35 | 60 |
| ID de precio usado para cobrar en Stripe | `STRIPE_PRICE_ESENCIAL` | `STRIPE_PRICE_GESTION` | `STRIPE_PRICE_PRO` | `STRIPE_PRICE_PREMIUM` |
| Fincas activas permitidas | 1 | 2 | 5 | 10 |
| Cupos de usuarios | 3 | 8 | 20 | 50 |
| Animales activos | **210 bovinos o 500 porcinos**, según especie elegida | 2.000 totales | 5.000 totales | 10.000 totales |
| Especies permitidas | Una: Bovino **o** Porcino | Ambas | Ambas | Ambas |
| Dron por mes | 15 si Bovino; **0** si Porcino | 60 | 150 | Sin tope numérico en código; `USO_INTENSIVO` |
| Roles | Administrador, Encargado, Trabajador, Veterinario, Contador, Consulta | Los mismos seis | Los mismos seis | Los mismos seis |
| Soporte prioritario comercial | No declarado | No declarado | No declarado | `soportePrioritario: true` |

El cupo de usuarios cuenta **membresías activas más invitaciones pendientes no vencidas**, mediante `contarUsuariosActivos`. No representa solamente personas que ya ingresaron. En Esencial, `animalesActivosTotal: null` no significa animales ilimitados: se aplica el límite específico de la especie. Las fincas no operativas tras un descenso de plan conservan consulta histórica; la selección operativa está limitada por el plan.

Las **17 claves** actuales de funcionalidades son:

| Clave exacta | ESENCIAL | GESTIÓN | PRO | PREMIUM |
|---|:---:|:---:|:---:|:---:|
| `centroAlertas` | Sí | Sí | Sí | Sí |
| `emailsOperativos` | No | No | Sí | Sí |
| `reportesBasicos` | Sí | Sí | Sí | Sí |
| `analiticaProductiva` | No | Sí | Sí | Sí |
| `analiticaEconomica` | No | No | Sí | Sí |
| `ambosTiposAnimales` | No | Sí | Sí | Sí |
| `configuracionEmailAvanzada` | No | No | No | Sí |
| `reportesMultiFinca` | No | No | No | Sí |
| `auditoriaAvanzada` | No | No | Sí | Sí |
| `bancosForrajeros` | Sí | Sí | Sí | Sí |
| `lotes` | Sí | Sí | Sí | Sí |
| `planesAlimentacion` | Sí | Sí | Sí | Sí |
| `iatfReproductivo` | No | No | Sí | Sí |
| `protocolosEngorde` | No | No | Sí | Sí |
| `protocolosReproductivosPorcinos` | No | No | Sí | Sí |
| `fotosAnimales` | No | No | Sí | Sí |
| `operacionMultiFinca` | No | Sí | Sí | Sí |

### Contraste Backend ↔ React ↔ cobro

- `PlanContext` obtiene `/api/plan/actual`, comprueba vigencia y utiliza sus límites y funcionalidades. `MiPlan` muestra el precio de esa respuesta; `FacturacionPlan` muestra el catálogo recibido del backend. Los mínimos de las diez funcionalidades presentadas en `MiPlan` coinciden con la configuración.
- Las rutas revisadas aplican `requireFeature` para analítica, auditoría, IATF, protocolos, fotos, configuración de correos y operaciones/reportes multi-finca. Las pruebas de matriz de planes y de fincas pasan. **Esto valida permisos y declaración, no elimina los fallos funcionales del servicio multi-finca encontrados aquí.**
- Hay dos detalles de presentación: `MiPlan` fija literalmente 210/500 animales y 15 conteos en el selector de Esencial —coinciden hoy, pero duplican configuración— y etiqueta como «Usuarios activos» una cuenta que incluye invitaciones pendientes. No se encontró una contradicción actual entre los cuatro límites numéricos declarados y sus controles backend.
- Los valores comerciales **10/20/35/60 no son los defaults actuales**. Para adoptarlos deben configurarse explícitamente las cuatro variables `PLAN_PRECIO_*_USD` y alinear los cuatro precios reales de Stripe. Estas variables de presentación no aparecen en `backend/.env.example`.
- `facturacion-service.js` cobra por `STRIPE_PRICE_*`, independientemente de `PLAN_PRECIO_*_USD`. No valida que el importe, moneda y periodicidad del Price de Stripe coincidan con la tarjeta mostrada. **No hay conciliación verificable del cobro real con acceso solamente al repositorio.** Esto queda como requisito antes del registro comercial; no se afirma que hoy se haya cobrado un importe incorrecto.

## 5. Checklist de infraestructura y variables de entorno

### Variables para producción

«Obligatoria» en esta tabla significa requisito de despliegue seguro o de la funcionalidad ofrecida. **El servidor actual no hace cumplir este conjunto al arrancar.** No se leyeron ni publicaron valores de secretos existentes. [Inventario de referencias](backend/documentation/cierre-variables-inventario.txt).

| Clasificación | Variables exactas | Condición y estado actual |
|---|---|---|
| Obligatorias de despliegue | `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, `CRON_SECRET` | URI explícita de replica set/servicio compatible; secreto JWT aleatorio de al menos 32 caracteres; origen frontend HTTPS; secreto independiente para cron HTTP. Sin validación global de arranque. `CRON_SECRET` se exige al invocar HTTP; el cron interno no lo utiliza. |
| Obligatoria de frontend al compilar | `VITE_API_URL` | Debe señalar la API pública, incluida su base `/api`. En build de producción, sin esta variable el cliente lanza «VITE_API_URL no configurado». No debe contener secretos. |
| Obligatorias para onboarding y recuperación por correo | `RESEND_API_KEY`, `EMAIL_FROM` | Proveedor real y remitente verificado. Sin API key el envío lanza error en producción; no se evita el arranque. El fallback de remitente es `onboarding@resend.dev`, que no acredita un dominio propio apto para clientes. |
| Obligatorias si se ofrece contratación por Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ESENCIAL`, `STRIPE_PRICE_GESTION`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PREMIUM` | Claves, firma webhook e IDs reales. Comprobar importe USD y periodicidad mensual por cada ID. Ausencias se detectan durante la operación, no al arrancar. No se ejecutaron cargos reales. |
| Configuración comercial | `PLAN_PRECIO_ESENCIAL_USD`, `PLAN_PRECIO_GESTION_USD`, `PLAN_PRECIO_PRO_USD`, `PLAN_PRECIO_PREMIUM_USD` | Defaults 6/12/20/35; fijarlas al catálogo comercial elegido y contrastarlas con Stripe. No confundir importe mostrado con ID de precio cobrado. |
| Obligatorias si se ofrece IA/dron | `IA_SERVICE_URL`, `IA_INTERNAL_TOKEN` | Servicio real y autenticación interna. En producción no hay fallback simulado autorizado. No se verificó un proveedor externo. |
| Obligatorias para R2 según uso | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; `R2_BUCKET` + `R2_PUBLIC_URL` para apariencia pública; `R2_PRIVATE_BUCKET` para fotos operativas privadas | El código diferencia apariencia pública y fotos privadas. El bucket y sus políticas reales no fueron consultados. `R2_ENDPOINT` es opcional. |
| Opcionales generales | `PORT`, `MONGODB_DB`, `DB_NAME` | Puerto por defecto 4000. Base por defecto `dataganado`; `MONGODB_DB` precede a `DB_NAME`. `database.js` pasa `dbName` explícito: confirmar que corresponde a la base pretendida en la URI. |
| Opcionales de autenticación | `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_SESSION_SECONDS` | Defaults `ganaderia-romilio-api`, `ganaderia-romilio-web`, 28.800 s. Validar valores en despliegue. |
| Opcionales de correo/jobs | `EMAIL_PASSWORD_RESET_FROM`, `EMAIL_ALERTS_ENABLED`, `EMAIL_ALERTS_INTERVAL_MS`, `EMAIL_DIGEST_INTERVAL_MS`, `CRON_MODE`, `CRON_LOCK_MS` | Remitente de recuperación opcional; `CRON_MODE` default `internal`; elegir explícitamente `external` si dispara el scheduler externo. Evitar programadores duplicados. |
| Opcionales de límites Excel | `IMPORT_MAX_BYTES`, `IMPORT_MAX_ROWS_PER_SHEET`, `IMPORT_MAX_COLUMNS_PER_SHEET`, `IMPORT_MAX_CELL_LENGTH`, `IMPORT_MAX_SHEETS`, `IMPORT_PARSE_TIMEOUT_MS`, `IMPORT_WORKER_MEMORY_MB`, `IMPORT_LOCK_TIMEOUT_MS`, `IMPORT_PROCESSING_STALE_MINUTES`, `IMPORT_PREVIEW_TTL_HOURS` | Defaults: 5 MiB, 5.000 filas, 60 columnas, 1.000 caracteres/celda, 8 hojas, 15.000 ms, 128 MiB, 1.200.000 ms, 20 min y 24 h, respectivamente. |
| Prohibida con valor en producción | **`EMAIL_TEST_TO`** | **Defecto confirmado:** el código la respeta en producción para destinatarios administrativos/alertas. Debe bloquearse o ignorarse en producción. No afirmar que redirige recuperación/invitación: esos envíos usan el destinatario explícito. |
| No habilitar en producción | `IA_ALLOW_SIMULATION=true` | Correctamente ignorada/bloqueada por la condición de producción. Mantenerla ausente para evitar ambigüedad de configuración. |
| Solo administración/migraciones, no requisito de la API | `SUPERADMIN_EMAIL`, `ORGANIZACION_INICIAL_SLUG`, `ORGANIZACION_INICIAL_NOMBRE`, alias legado `DB_URI` | No ejecutar scripts de migración contra producción sin plan revisado. `EMAIL_ADMIN` aparece en el ejemplo, pero no es leído por el servicio actual de correo. |

Prueba real de arranque: `cierre-standalone.cjs` ejecuta el entrypoint con `dotenv` desactivado, puerto loopback aleatorio y MongoDB standalone temporal. Con `JWT_SECRET`, `CRON_SECRET` y `FRONTEND_URL` ausentes, **el servidor escucha y responde 200**. Al iniciar una transacción Mongo devuelve **20: “Transaction numbers are only allowed on a replica set member or mongos”**. La prueba complementaria del entrypoint con conexión adaptada confirma que sin `MONGODB_URI` usa silenciosamente `mongodb://localhost/dataganado`.

La validación JWT sí rechaza secretos cortos **al usar** autenticación, pero acepta 32 caracteres repetidos: controla longitud, no aleatoriedad. El aprovisionamiento de secretos debe generar material aleatorio; la ausencia de fail-fast no se soluciona únicamente documentando un valor.

### Transacciones y dependencia de replica set

Los **12 puntos directos de `withTransaction`** localizados son:

| Archivo / línea | Operación |
|---|---|
| `services/aprovisionamientoOrganizacion-service.js:142` | Organización, finca, membresía y datos iniciales |
| `services/consolidacionMultiFinca-service.js:151` | Trasladar animales entre fincas |
| `services/consolidacionMultiFinca-service.js:267` | Transferencia financiera interna |
| `services/consolidacionMultiFinca-service.js:295` | Gasto compartido |
| `services/consolidacionMultiFinca-service.js:350` | Anulación del grupo financiero |
| `services/iatf-service.js:265` | Crear campaña |
| `services/iatf-service.js:417` | Ejecutar paso |
| `services/iatf-service.js:515` | Registrar IATF |
| `services/iatf-service.js:622` | Registrar diagnósticos |
| `services/importarExcel-confirmacion-service.js:327` | Confirmar Excel de manera atómica |
| `services/potreroCobertura-service.js:226` | Guardar cobertura y su historial; reutiliza sesión recibida cuando existe |
| `services/mongo-transaccion-service.js:7` | Envoltorio compartido `ejecutarEnTransaccion` |

El envoltorio se utiliza además en compras, ventas, planes/tratamientos/aplicaciones/estados sanitarios, tareas y comentarios, pesajes, reproducción, creación/edición de lotes, pertenencias y salidas, etapas, pesajes colectivos, rotaciones, raciones, suministros, planes de alimentación y protocolos de engorde. **Todas las llamadas con archivo y línea** están en [cierre-transacciones-inventario.txt](backend/documentation/cierre-transacciones-inventario.txt); no quedan limitadas a los doce puntos directos de la tabla.

No hay comprobación de replica set antes de anunciar disponibilidad. Tampoco un fallback general que vuelva atómicas las operaciones sobre standalone. El paso de despliegue debe comprobar soporte transaccional antes de abrir tráfico; no basta con que `mongoose.connect()` resuelva.

### Índices críticos: declarados, creados y despliegue

Se inicializaron los **65 modelos** cargados en una base vacía y se consultó `collection.indexes()` en MongoDB real. El inventario completo está en `indices` del [resultado del smoke](backend/documentation/cierre-smoke-resultados.json). Las filas siguientes describen esa base temporal; **no son comprobaciones de una base desplegada**.

| Modelo | Índice físico observado | Evaluación |
|---|---|---|
| `Usuario` | `correo` único | Creado; requiere comprobar duplicados y presencia en despliegue. |
| `Membresia` | `organizacionId + usuario` único | Creado. |
| `ReservaCuotaPlan` | `organizacionId + recurso` único | Creado; reservas con vencimiento en arreglo, no un TTL de toda la colección. |
| `UsoPlan` | `organizacionId + periodo` único | Contador mensual declarado y recogido en inventario. |
| `Animal` | `organizacionId + diio` único parcial, `diio` de tipo string | Creado; permite registros sin DIIO. |
| `Animal` | `organizacionId + fincaId + identificadorFinca` único | Creado. |
| `Animal` | `organizacionId + fincaId + claveImportacion` único parcial string | Creado; deduplicación de filas importadas. |
| `PertenenciaLote` | `organizacionId + fincaId + animal` único, parcial `activo: true` | Creado; una pertenencia activa dentro del ámbito de finca. No es una restricción global independiente de finca. |
| `RotacionPotrero` | `una_rotacion_activa_por_potrero`: organización + finca + potrero + estado, parcial `Activa` | Creado. También hay unicidad de lote activo con `loteRef` ObjectId. |
| `Notificacion` | `organizacionId + destinatario + dedupKey` único, parcial string | Creado. |
| `MovimientoFinanciero` | `organizacionId + fincaId + claveImportacion` único, parcial string | Creado. |
| `ImportacionExcel` | `organizacionId + fincaId + hashArchivo` **no único** | El hash no constituye por sí solo una restricción de unicidad. El proceso usa estados, bloqueo y claves de filas; no se debe añadir unicidad sin revisar la semántica de reimportación. |
| `BloqueoImportacion` | `organizacionId` único y TTL `expiraEn` | Complemento de exclusión de importaciones por organización. |
| `EventoAnimal` | organización + finca + `claveIdempotencia`, único **sparse** | **Defectuoso y reproducido**: los campos de organización/finca presentes hacen que también se indexen documentos sin clave. CL-01. |

`database.js` no fija `autoIndex: false`. El arranque normal depende de creación automática de Mongoose y no espera ni verifica de forma integral los índices críticos antes de escuchar. Que un esquema declare un índice no garantiza su presencia en una base migrada.

Existe `migrarSaasOrganizacion.js`, que con `--apply` ejecuta `syncIndexes()` solamente para AlertaCorreo, Animal, AplicacionSanitaria, Camada, CatalogoFinanciero, Notificacion, Potrero y Finca. No cubre toda esta tabla. `verificarAislamientoSaas.js` busca índices únicos sin organización en un subconjunto; no prueba que todos los índices requeridos existan con sus filtros correctos. **No se ejecutaron migraciones ni `syncIndexes()` sobre datos existentes.**

Requisito antes de abrir tráfico: inventario real de índices y duplicados, migración versionada revisada, creación controlada, verificación posterior y configuración explícita de `autoIndex`. Para CL-01, conservar la protección de idempotencia mediante un índice parcial apropiado; **retirar el índice como en el diagnóstico no es la solución productiva aprobada**.

### Red, secretos y dependencias

| Control | Estado verificado |
|---|---|
| `trust proxy` | **Configurado a 1**. Petición loopback con `X-Forwarded-For: 203.0.113.7` produce esa IP. Debe coincidir con un salto de proxy confiable; no se validó la topología Render/Railway/Cloudflare/Nginx del despliegue. |
| HTTPS | En producción, `X-Forwarded-Proto: http` devuelve 400. Sin esa cabecera el servidor acepta HTTP directo; el borde debe terminar TLS y limitar el acceso directo al origen. |
| CORS | Origen explícito `FRONTEND_URL`, credenciales habilitadas. Una solicitud con origen ajeno no obtiene un `Access-Control-Allow-Origin` que coincida con ese origen. No se encontró wildcard con credenciales. |
| Cabeceras | Implementadas manualmente: HSTS 31.536.000 s con subdominios, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP, Referrer-Policy y Permissions-Policy. No depende de Helmet. Comprobadas sobre respuestas reales. |
| Errores 500 | La envoltura de producción sustituye el JSON por «Error interno del servidor.». Los detalles técnicos de los smoke corresponden a `NODE_ENV=test`. Los errores 400 pueden contener detalles de MongoDB: CL-01 también expone información interna en ese caso. |
| Sin `RESEND_API_KEY` | El envío falla en producción; en la prueba de recuperación no se imprimió el marcador del token. La inspección de envío de invitaciones y credenciales no encontró logs de tokens/contraseñas temporales. |
| Simulación IA/dron | `NODE_ENV=production` bloquea el fallback aun con `IA_ALLOW_SIMULATION=true`; verificado. |
| `EMAIL_TEST_TO` | **No protegido** en producción para alertas/destinatarios administrativos. |
| Dependencias | Backend: `body-parser 1.20.8` y `multer 2.4.0`, ambas reportadas altas. Frontend producción: cero. |

`body-parser` está detrás de `express.json()` global, antes de las rutas autenticadas. El aviso [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) describe un DoS por cuerpos comprimidos con bytes sobrantes y fija la rama 1.x en **1.20.9**. La combinación instalada y la configuración predeterminada merecen corrección antes de exposición pública; no se lanzó un ataque contra un servicio desplegado.

El aviso [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m) de Multer se corrige en **2.5.0** y requiere un `fileFilter` asíncrono pendiente al abortar. Los tres filtros inspeccionados —Excel, apariencia y carga por organización— son síncronos; **no se demostró esa condición de explotación en estas rutas**. El hallazgo de dependencia sigue abierto, sin equipararlo a un exploit comprobado de la aplicación. Ambos resultados provienen del registro real de npm, no de una suposición basada en versiones antiguas.

### Frontend, bundle y PWA

- Bundle principal: **967,87 kB minificado / 249,16 kB gzip**. CSS: 106,55 kB / 19,87 kB gzip. Workbox-window: 5,75 kB / 2,36 kB gzip. La advertencia de Vite sobre 500 kB persiste; no impide compilar.
- Precache generado: **14 entradas, 2.694,30 KiB**. `registerType: 'autoUpdate'`, registro inmediato, `skipWaiting`, `clientsClaim` y limpieza de cachés obsoletas están presentes.
- No hay regla de runtime cache para `/api/*`. La prueba con Edge **156.0.4314.42**, perfil nuevo y build real, consultó `/api/audit-local`: ninguna entrada API apareció en CacheStorage; al simular desconexión, esa solicitud falló por red en vez de devolver una respuesta guardada.
- Al servir una segunda shell y revisión de precache en memoria, y ejecutar la comprobación de actualización del registro, la página pasó **v1 → v2 automáticamente**, sin recarga manual. No se alteraron archivos de aplicación para esta prueba. El servidor local usó `Cache-Control: no-store`; es necesario validar las cabeceras equivalentes del hosting real para `sw.js` y HTML. No se certifica el tiempo de detección de versiones en una pestaña que permanezca abierta indefinidamente.
- `navigateFallback: '/index.html'` no excluye `/api`. No equivale a cachear respuestas XHR de API, pero una navegación de documento a `/api/...` en el mismo origen puede recibir la shell. Conviene excluir ese prefijo si frontend y API comparten origen.

## 6. Bloqueadores restantes y acciones verificables

Las prioridades se refieren al lanzamiento de las funciones actualmente ofrecidas. No se reabren todos los hallazgos de auditorías anteriores a partir de reproductores desactualizados.

| ID | Prioridad | Problema real / evidencia | Condición para darlo por cerrado |
|---|---|---|---|
| **CL-01** | **P0 — bloquea salida** | Índice `EventoAnimal` único+sparse: segunda alta 400 con animal persistido; E11000 en sanidad/reproducción/compraventas. Modelo y `ALTA_ANIMAL_PARCIAL` del smoke. | Migración del índice con filtro correcto; varias altas/eventos sin clave permitidos; misma clave idempotente sin duplicar; fallos sin persistencia parcial. Repetir smoke con todos los índices productivos, sin retirarlos. |
| **CL-02** | **P0 — bloquea salida** | Aprovisionamiento almacena el token como reset en `Usuario`, pero envía enlace de `aceptar-invitacion`; la aceptación busca `Invitacion`. Organización 201 → aceptación 400; reset con el mismo token 200. | Unificar emisión/consumo y expiración de invitación. Administrador nuevo debe completar el flujo desde el enlace recibido sin recurrir a restablecimiento. Repetir paso 1 completo. |
| **CL-03** | **P0 — bloquea salida** | `consolidacionMultiFinca-service.js` crea eventos/movimientos múltiples con `session` y sin `ordered: true`. Mongoose 8.24.1 lo rechaza; traslado, transferencia, gasto compartido y ambas anulaciones retornan 500. | Corregir creación transaccional ordenada y comprobar commit/rollback real; anulación por contrapartidas idempotente y netos correctos. Mantener controles de organización y finca. |
| **CL-04** | **P1 — antes del registro comercial** | Producción arranca sin variables clave y sobre standalone; falla transacción con código 20 después de anunciar disponibilidad. | Validación de entorno y capacidad transaccional antes de escuchar; ensayos negativos de variables faltantes y standalone deben abortar de manera controlada. |
| **CL-05** | **P1** | No existe rutina integral de índices; `autoIndex` no se desactiva explícitamente en runtime; migración/verificación cubren solo parte de modelos. | Procedimiento de migración y verificación completa sobre staging y despliegue real, con evidencia de índices y filtros. |
| **CL-06** | **P1** | `EMAIL_TEST_TO` redirige destinatarios administrativos y alertas incluso en producción. Comprobación ejecutada y fuente de `alertasCorreo-service.js`. | Rechazar configuración o ignorar la variable en producción; probar que cada correo operativo llega solo al destinatario previsto. |
| **CL-07** | **P1** | Dos dependencias backend vulnerables en auditoría npm; `body-parser` procesa solicitudes antes de autenticación. Multer tiene condición de explotación no observada en filtros actuales. | Actualizar a versiones corregidas compatibles, revisar lockfile, repetir suites, importación/subidas y `npm audit --omit=dev`. |
| **CL-08** | **P1** | Declaración comercial 10/20/35/60 frente a defaults 6/12/20/35; presentación y Price IDs independientes, sin conciliación automática. | Fijar catálogo único y acreditar los cuatro importes/moneda/periodicidad en Stripe frente a React/backend antes de cobrar. No exige elegir un precio sin decisión comercial. |
| **CL-09** | **P1** | Cuatro reproductores históricos no ofrecen una barrera de regresión válida: salida 1, expectativas antiguas o dependencias sin adaptar. | Actualizar verificaciones al comportamiento corregido y hacerlas pasar, conservando cobertura real de las invariantes. No cambiar assertions solo para ocultar fallos. |
| **CL-10** | **P2 — mejora de contrato** | API de venta ignora `moneda: 'USD'` y registra CRC. Compras también fija CRC en fuente. La interfaz actual no ofrece USD en compraventas. | Hacer explícita la operación en CRC y rechazar moneda no soportada, o implementar moneda de extremo a extremo con prueba de movimiento y reporte. No atribuir esta limitación al cálculo del reporte. |
| **CL-11** | **P2** | Chunk principal de 967,87 kB; Vite mantiene advertencia. | Dividir por pantallas o dependencias y medir carga real; no ocultar únicamente el umbral de advertencia. |
| **CL-12** | **P2** | En el cruce real de módulos frontend con adaptador IndexedDB, un 401 elimina sesión antes de que `offlineSync` pueda marcar la operación `Fallido`; rechaza por falta de contexto. El listener de `App` limpia los datos del usuario. | Terminar sincronización de forma controlada al revocar acceso y probar la política de descarte de pendientes en navegador; conservar aislamiento y prohibición de reenvío. El adaptador no monta React ni demuestra persistencia tras su limpieza. |
| **CL-13** | **P2** | Fallback de navegación PWA sin exclusión `/api`; selector Esencial duplica límites literales y etiqueta de usuarios omite invitaciones pendientes. | Ajustar presentación/fallback según despliegue y centralizar valores. No hay evidencia de caché de respuestas de API. |

Para reconsiderar el dictamen, cerrar CL-01 a CL-09 con evidencias, ejecutar nuevamente el smoke **sin continuaciones ni retirada de índices**, obtener suites/reproductores válidos y verificar el entorno real de staging/producción. El informe entrega los hallazgos y la reproducción; las remediaciones quedan pendientes por la regla de auditoría sin cambios de negocio.
