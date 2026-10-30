# Verificacion del sprint de banco de semen

Fecha: 2026-10-29. Alcance: implementacion y verificacion local; no certifica despliegue
ni migracion sobre datos reales del cliente.

## Resultados

| Verificacion | Resultado |
| --- | --- |
| Backend, `npm.cmd test` | 368/368 PASS, incluidas 8 pruebas nuevas del banco. |
| `node documentation/banco-semen.integracion.cjs` | 16/16 PASS con MongoDB 8.0.5, replica set temporal y todos los indices. |
| `node documentation/cierre-smoke-integrado.cjs` | 16/16 PASS y controles adicionales de cierre; 70 modelos con indices verificados. |
| Frontend, `npm.cmd test` | 36/36 PASS. |
| Frontend, `npm.cmd run build` | PASS; chunks JavaScript inferiores a 500 kB. |
| `node tests/bancoSemen.navegador.mjs` | PASS: escritorio 1440x1000, viewport iPad 820x1180 y movil 390x844 en Edge aislado. |

La comprobacion de navegador cubre carga, paginacion, entrada dividida, venta,
error visible y reintento con la misma clave. No es una prueba en un iPad fisico ni
en Safari. Las capturas sinteticas se generan en el directorio temporal del sistema.

## Cobertura de integracion

1. Entrada 50 = 30 reproductivas + 20 comerciales, reposicion en una misma ficha e idempotencia.
2. Asignacion de dos toros: todo o nada; sin consumir gaveta comercial.
3. Consumo reservado y anulacion al origen, con costo aplicado fijo.
4. Cierre devuelve sobrantes y bloquea nuevas reservas en campana cerrada.
5. Venta USD con costo CRC, ingreso y anulacion sin borrar; resumen neto por moneda.
6. Ventas concurrentes sin sobregiro.
7. Fallo financiero provoca rollback de stock y venta.
8. Motivos obligatorios, traslado, merma e inmutabilidad.
9. Esencial/Gestion denegados; Pro/Premium habilitados; suspension denegada.
10. Aislamiento de finca y rechazo de operadores de payload.
11. Migracion sintetica dry-run sin escrituras, aplicacion repetible y costos historicos conservados.
12. Inseminacion IATF por HTTP, anulacion y nacimiento con paternidad del toro interno.
13. Reservas concurrentes y cierre concurrente no dejan unidades atrapadas.
14. Invariantes finales y opciones exactas de indices intactas.
15. Permisos de Contador y rechazo de sobreventa sin tomar stock reproductivo.
16. Banda porcina: fallo grupal revierte todo; cada cerda tiene consumo independiente y su anulacion no devuelve el de otra.

## Diagnostico de la base configurada

NO COMPLETADO. Se intento `node scripts/migrar-banco-semen.js --dry-run` sin permisos
externos y fallo la resolucion DNS de MongoDB (`querySrv ETIMEOUT`). La ejecucion con
acceso externo fue bloqueada por revision de permisos porque podria leer datos reales
de clientes. Se solicito autorizacion expresa al usuario; no se reintento por otra via.

No se pueden afirmar cantidades ni discrepancias de la base del cliente. No se
ejecuto `--aplicar`, no se sincronizaron indices en Atlas y no se modificaron datos
del cliente. El resultado PASS de migracion corresponde a fixtures locales desechables.

Antes de desplegar: revisar el mapa de [adaptacion y migracion](banco-semen.md),
confirmar respaldo/restauracion, obtener diagnostico autorizado, resolver discrepancias,
sincronizar indices y aplicar en ventana sin movimientos. Las operaciones antiguas
individuales no migradas conservan compatibilidad; las nuevas reservas IATF usan banco.
