# Verificacion: metodo reproductivo

Fecha: 2026-11-03.

## Entorno

- MongoDB 8.0.5 real, replica set temporal en 127.0.0.1 y base desechable creada por cada harness.
- 75 modelos con sus indices intactos, incluyendo la ampliacion del programa integral TE.
- No se lee .env ni se permiten conexiones externas en las integraciones. Correo y servicios externos simulados.
- No se aplico migracion en la base de la finca principal ni en Atlas.

## Comandos

Resultados: backend 382/382; frontend 44/44; integracion reproductiva 13/13; programa TE 13/13; banco de semen 16/16; smoke integrado 16/16; compilacion de produccion y verificacion visual correctas. Consultar programa-te-integral.md para las verificaciones ampliadas y su dry-run.

```powershell
# backend
npm test
npm run test:metodo-reproductivo:integracion
npm run test:te:integracion
npm run test:banco-semen:integracion
$env:CIERRE_OUTPUT_DIR = Join-Path $env:TEMP 'cir-metodo-smoke'
node documentation/cierre-smoke-integrado.cjs

# frontend
npm test
npm run build
node tests/bancoSemen.navegador.mjs
```

El verificador visual usa Edge con perfil aislado y API sintetica. Cubre banco/ventas y ahora TE, responsables con rol, envio del formulario sin servicio y opciones porcinas restringidas. Capturas en TEMP: cir-metodo-escritorio.png, cir-metodo-ipad.png, cir-metodo-movil.png.

## Resultado del dry-run local

```json
{
  "modo": "dry-run",
  "sinEscrituras": true,
  "ciclos": 7,
  "partosAntes": 5,
  "ciclosPendientes": 1,
  "ciclosMigrados": 0,
  "animalesPendientes": 1,
  "animalesMigrados": 0,
  "discrepancias": [],
  "partosDespues": 5
}
```

El harness compara los documentos antes y despues del dry-run. Luego aplica sobre esos fixtures locales, repite la aplicacion y comprueba que no vuelve a migrar ni cambia el numero de partos. Estos conteos NO describen los datos del cliente.

## Casos

- Servicio pendiente sin gestacion confirmada; diagnostico positivo e idempotencia.
- IATF con repaso compatible: INCIERTA y sin padre automatico.
- IATF unica compatible: herencia de padre y ambas madres naturales.
- Gestacion desconocida: parto sin monta ficticia.
- TE en Esencial: parto de receptora, madre genetica donante, arbol y descendencia separados.
- Creacion concurrente idempotente: un ciclo y un evento de servicio.
- PUT de diagnostico/resultado: rollback y sesion transaccional.
- Cuatro planes, downgrade e historial basico conservado.
- Rechazo porcino de IATF y TE.
- Aislamiento entre fincas y rechazo de operadores Mongo.
- Migracion dry-run, repeticion y conservacion de partos.
- Programa Pro anterior: conserva lectura, bloquea escrituras aisladas y conduce al programa integral.
- Consolidado Premium con fincas autorizadas; denegado fuera del plan.

La prueba anterior del banco simulaba un parto el mismo dia de la inseminacion. Ahora usa la duracion de gestacion del ciclo para verificar paternidad con fechas biologicamente compatibles.

El smoke tiene dos avisos previos de auditoria durante la inyeccion deliberada de fallos (`docs?.some is not a function`); sus comprobaciones de rollback y los 16 recorridos pasan. No se silencian como si fueran una validacion de auditoria sin advertencias.

Pendiente operativo: dry-run autorizado y revision de datos reales antes de aplicar en produccion.
