# Remediacion final pre-lanzamiento

Fecha: 25 de octubre de 2026. Alcance: CL-01 a CL-13 de `AUDIT_CIERRE_PRE_LANZAMIENTO.md`.

## Aplicacion en el despliegue

1. Tener un respaldo restaurable de la base de destino y desplegar primero en staging.
2. Instalar las dependencias con el lockfile actualizado: `npm ci` en backend y frontend.
3. Configurar `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `CRON_SECRET` y `FRONTEND_URL` HTTPS. Los secretos exigen 32 caracteres y 16 caracteres distintos. La API utiliza transacciones y requiere Atlas, replica set o un cluster con soporte transaccional.
4. Mantener `MONGODB_AUTO_INDEX=false` en el proceso de la API. Durante una ventana sin escrituras, ejecutar desde backend `npm run indexes:sync` con las variables de la base de destino. El comando carga los 65 modelos, sustituye el indice sparse de eventos por el parcial, elimina claves vacias/nulas y sincroniza/verifica las definiciones completas, incluidos unicidad, filtros parciales y TTL.
5. Revisar la salida del comando. Si hay duplicados o no se puede crear/verificar un indice, el proceso termina con salida 1; corregir los datos antes de abrir trafico. No elimina documentos de negocio. `syncIndexes()` si puede retirar indices que ya no aparecen declarados en los esquemas: conservar el inventario anterior del despliegue.
6. Configurar los Price IDs de Stripe activos, recurrentes mensuales en USD. Los importes por defecto son Esencial 10, Gestion 20, Pro 35 y Premium 60 USD. Si se personalizan `PLAN_PRECIO_*_USD`, el Price correspondiente debe coincidir; checkout devuelve `503 BILLING_PRICE_MISMATCH` si hay discrepancias.
7. Configurar el proveedor real de correo. `EMAIL_TEST_TO` se ignora en produccion. El administrador nuevo recibe una invitacion formal de 72 horas; al aceptarla se activan su usuario y membresia. Las cuentas ya existentes conservan el comportamiento de aprovisionamiento previo.
8. Publicar el frontend compilado y verificar la actualizacion del Service Worker en el dominio real.

El sincronizador no se ejecuta automaticamente al arrancar la API. Las pruebas de este sprint lo ejecutan solamente contra bases sinteticas en loopback. No se ha modificado una base de clientes ni configurado servicios externos.

## Contratos corregidos

- El alta individual de Animal, la reserva de cria colectiva si corresponde y los eventos iniciales comparten transaccion. Un fallo de bitacora revierte la operacion.
- Los eventos sin idempotencia omiten la clave. El indice parcial solo indexa claves string y sigue rechazando duplicados reales.
- Las creaciones con arreglo y sesion usan `ordered: true`, tambien en los caminos condicionales de lotes, sanidad, cobertura, IATF e importacion.
- Los traslados crean bitacora en finca origen y destino mediante la opcion interna autorizada del plugin tenant.
- Compras y ventas de animales operan en CRC y rechazan otras monedas con 400. Finanzas conserva CRC y USD por separado.
- Un 401 durante sincronizacion offline detiene el ciclo aunque `api.js` ya haya eliminado la sesion. No intenta seguir escribiendo sin contexto.
- Mi Plan recibe limites por especie del backend y muestra "Usuarios e invitaciones activas".
- La PWA excluye navegaciones `/api/` del fallback HTML. La aplicacion autenticada y Sanidad se cargan con lazy/Suspense y las vistas pesadas tienen chunks separados.

## Repetir el cierre

Desde backend, en una maquina con MongoDB 8 local y Microsoft Edge:

```powershell
node documentation/cierre-ejecutar-remediacion.cjs
node documentation/cierre-verificar-evidencias.cjs
```

El primer comando ejecuta build, smoke, reproductores, arranque negativo, configuracion, offline, PWA, pruebas backend/frontend y auditorias npm. El segundo verifica las evidencias y genera sus hashes una vez actualizado el informe. `CIERRE_MONGOD` permite indicar el ejecutable de MongoDB local.

Los reproductores de importaciones, lotes, reportes y usuarios comparten las suites mantenidas en `tests/`, con un mapa explicito a los hallazgos originales. No conservan las antiguas expectativas que exigian reproducir vulnerabilidades. La integracion HTTP con transacciones, rollback e indices reales se verifica en el smoke.
