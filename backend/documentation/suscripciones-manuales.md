# Suscripciones asistidas: SINPE / IBAN

## Flujo

Se implementa el diagrama del sprint: SuperAdmin -> Organizacion y PagoSuscripcion -> cron -> Mi plan. Stripe es una alternativa separada, no un requisito.

1. Clientes SaaS > Nuevo cliente permite Activo o Prueba, dias de prueba (15), gracia (5) y notas. Activo sin pago concede un mes segun acuerdo comercial; con pago inicial se aplica solo el periodo pagado, sin regalar otro mes.
2. Registrar pago / renovar: metodo, CRC/USD, monto positivo con hasta dos decimales, referencia textual, meses o fin personalizado y notas. Admite cambiar de plan en la misma renovacion. No se adjuntan fotos, recibos ni datos de tarjetas.
3. Cuenta activa: renovar desde el final ya pagado. Vencida o en prueba: desde el instante del pago. Enero 31 + un mes termina en febrero, no marzo. No se mezclan monedas.
4. Plan / vigencia ajusta fin, gracia, notas, prueba o suspension. Downgrade devuelve 409 con detalles si excede fincas, usuarios + invitaciones, especies o animales (incluidas crias porcinas colectivas). Las reservas en curso impiden el cambio; una alta con permiso anterior relee/reintenta.
5. Historial inmutable y paginado. Anular exige motivo y restaura el ultimo pago sin ajustes posteriores; pagos encadenados se anulan en orden inverso. Si existen ajustes comerciales posteriores devuelve 409 para no deshacerlos accidentalmente: revisar Plan / vigencia.

Los cobros del SaaS no son MovimientoFinanciero de la finca. Este registro comercial no sustituye una factura fiscal.

## Estados y acceso

- modoFacturacion: MANUAL o STRIPE; se reconoce tambien el proveedor Stripe legado.
- estadoSuscripcion: PRUEBA, ACTIVA, POR_VENCER, EN_GRACIA, VENCIDA, SUSPENDIDA, CANCELADA. plan.estado conserva su contrato anterior.
- fechaProximoVencimiento es canonica y se refleja en fechaFinPeriodoActual y metadatos legados. La prueba usa el mismo fin, sin otra fuente de verdad.
- POR_VENCER: hasta cinco dias locales. El semaforo de cartera agrupa hasta siete dias, incluidas pruebas proximas a terminar que conservan PRUEBA.
- EN_GRACIA: despues del vencimiento y hasta diasGracia. Permite operar con banner. Despues bloquea escrituras sin borrar datos. Mi plan, historial propio y gestion de acceso siguen accesibles.
- La API recalcula vigencia en cada peticion, sin depender del cron. No se suspende administrativamente la organizacion para impedir al cliente entrar a renovar.
- Cuentas antiguas sin fecha: Vigencia por configurar. No se les inventan fechas ni se suspenden al desplegar. El operador asigna la vigencia real en Plan / vigencia. Las nuevas altas reciben fecha inicial obligatoria.
- STRIPE conserva Checkout/Portal cuando esta configurado y no admite pagos/cambios manuales. Mi plan ofrece asistencia en MANUAL o si Stripe no esta disponible. Un cliente no puede cambiar su modo comercial llamando checkout.
- Organizacion, PagoSuscripcion y auditoria administrativa se confirman juntos en transaccion. El cron tambien audita transiciones. Se conserva ademas la auditoria HTTP global.

## Seguridad

Las rutas administrativas exigen SuperAdmin de plataforma, no Administrador de finca. Se rechazan operadores Mongo y campos ajenos al DTO. Los pagos se buscan en la organizacion objetivo, nunca por ID sin aislamiento.

Cada pago requiere claveIdempotencia, conservada por el formulario al reintentar. Reutilizarla con otros datos da 409. Indices unicos por organizacion/clave y por metodo/referencia bancaria vigente evitan duplicados. No se borran pagos. Estado previo y hashes no se muestran en el historial del cliente.

GET /api/facturacion/pagos usa la organizacion de la sesion y exige Administrador del cliente. Historiales: 10 por pagina; maximo API 50.

## Cron

Un unico Render Cron Job: npm run job:alertas, `0 12 * * *` (06:00 Costa Rica). Suscripciones se ejecuta antes de categorias, alertas y resumenes, con errores/metricas independientes. Fallos dan salida CLI 1 / HTTP 500 despues de intentar las otras fases.

Cursor de 100 cuentas MANUAL con fecha. Aviso al entrar a la ventana de cinco dias para administradores activos; resumen de cartera para EMAIL_ADMIN. Deduplicacion por ciclo de vencimiento, no por dia. Si ya vencio sin aviso se intenta el aviso pendiente. Solo se marca despues de aceptar el proveedor. Idempotency-Key de Resend es proteccion adicional, no garantia absoluta ante fallos combinados proveedor/DB. EMAIL_ALERTS_ENABLED no desactiva los avisos comerciales.

## Despliegue

1. Respaldar la base por la politica habitual. No hay migracion destructiva.
2. Con el nuevo commit y entorno de la base correcta, ejecutar desde backend `npm run indexes:suscripciones` antes de cobrar. Es aditivo: prepara Organizacion/PagoSuscripcion, lista fechas pendientes y no modifica cuentas ni elimina indices. Produccion no depende de autoIndex.
3. Desplegar API y cron con el mismo commit. El Atlas existente soporta las transacciones; no se requiere otro servicio.
4. Configurar VITE_WHATSAPP_SOPORTE en el frontend y reconstruir/desplegar el Static Site. Numero internacional sin espacios: 506 seguido de los ocho digitos reales. Si falta, se informa contacto pendiente; no se abre un destino incorrecto.
5. En el cron verificar FRONTEND_URL, EMAIL_ADMIN, RESEND_API_KEY y EMAIL_FROM verificado, ademas de las variables DB/seguridad existentes. Command y horario no cambian.
6. Revisar las cuentas antiguas y asignar su vigencia real segun el acuerdo, sin inventar pagos historicos.

## Rutas

- GET /api/admin/organizaciones: clientes, estado calculado, dias y ultimo pago.
- GET /api/admin/organizaciones/cartera/resumen: indicadores y recaudacion mensual CRC/USD, mes de Costa Rica.
- POST /api/admin/organizaciones/:id/pagos: registrar/renovar.
- GET /api/admin/organizaciones/:id/pagos: historial paginado.
- POST /api/admin/organizaciones/:id/pagos/:pagoId/anular: anular con motivo.
- PATCH /api/admin/organizaciones/:id/suscripcion: plan/estado/vigencia/notas/gracia.
- GET /api/facturacion/estado y /api/facturacion/pagos: vista del cliente.

## Verificacion

Integracion con replica set MongoDB temporal en loopback, HTTP real y correos sustituidos. No lee .env ni usa Atlas. Cubre renovaciones, alta con pago, anulacion, concurrencia, rollback de auditoria, downgrade, crias colectivas, cron, cliente vencido e indices aditivos.

frontend/tests/suscripciones.navegador.mjs usa Edge aislado y API ficticia a 1440 y 390 px. Verifica modales, registro de pago, historial y WhatsApp sin overflow. Capturas en TEMP/cir-suscripciones-*.png y TEMP/cir-mi-plan-*.png. Las regresiones de Stripe y CL-08 se mantienen.

Resultado local del sprint: backend 450/450 PASS, frontend 66/66 PASS, build salida 0 sin advertencia de chunks grandes tras separar AdministracionSaas/MiPlan. Integracion comercial: 14 pruebas con replica set real temporal. Smoke completo: 16/16 pasos y 9/9 comprobaciones PASS, 76 modelos e indices y las cuatro fases del cron. Evidencias en TEMP/cir-suscripciones-manuales-smoke. Permanecen dos avisos preexistentes `docs?.some is not a function` al inyectar fallos deliberados de auditoria; no se ocultaron ni se modificaron en este alcance. No se enviaron correos reales ni se modifico Atlas, Render o Stripe.
