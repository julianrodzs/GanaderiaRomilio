# Programa integral de transferencia de embriones

Fecha: 2026-11-03. Complementa metodo-reproductivo.md. No constituye un protocolo veterinario recomendado ni un despliegue de datos reales.

## Fase 0: mapa de reutilizacion

| Estructura existente | Ampliacion |
| --- | --- |
| RegistroReproductivo y sus servicios/diagnosticos/resultado | La transferencia real crea un ciclo normal. Ni una campana ni un servicio confirman gestacion. |
| ProgramaTransferencia | Misma coleccion para sesiones de colecta/lavado y OPU/FIV, protocolo de donante, ejecuciones y produccion. versionProgramaTE=2; no se crea ColectaEmbrion paralela. |
| IATF: calcularCronograma y validarPlantilla | Mismo motor de fechas y validacion para donantes y TETF. Los pasos se configuran por el profesional, sin dosis predefinidas. |
| IATF: consumirInsumos e InsumoReproductivo | Stock hormonal compartido, dispositivos reutilizables y snapshots de costo al ejecutar; no otro almacen de hormonas. |
| BancoSemen y consumirSemen | La produccion puede consumir semen reproductivo al finalizar; planificar no descuenta, transferir un embrion ya producido tampoco. |
| Tarea | Categorias TE_DONANTE/TETF; ejecucion desde el origen, no desde un cambio generico de estado. Acceso desde Tareas abre la colecta/campana. |
| Animal y genealogiaService | Donante genetica para pedigrí; receptora para parto y seguimiento. Ficha separa partos biologicos y progenie genetica TE. |
| EventoAnimal | Ejecuciones de protocolo, transferencia, diagnostico y parto trazables; donante no recibe un parto ficticio. |
| MovimientoFinanciero y proteccion de origen | VentaEmbrion genera ingreso y anulacion con contrapartida; no se borra ni edita manualmente desde Finanzas. |
| requireFeature / membresias / aislamiento de finca | Mismos guards, vigencia y tenant; consolidacion solo con fincas autorizadas. |

Se agregan cuatro modelos necesarios: LoteEmbrion, MovimientoEmbrion, CampanaTE y VentaEmbrion. CampanaTE contiene reservas y receptoras, sin una segunda coleccion de asignaciones.

## Acceso y planes

| Capacidad | Esencial | Gestion | Pro | Premium |
| --- | --- | --- | --- | --- |
| Metodo, gestacion desconocida, TE puntual informativa, historia y genealogia dual | Si | Si | Si | Si |
| Indicadores comparados por metodo | No | Si | Si | Si |
| Colectas, protocolos, banco, TETF, costos y ventas de embriones | No | No | Si | Si |
| Consolidacion TE multi-finca | No | No | No | Si |

Las capacidades exclusivas devuelven 403 PLAN_UPGRADE_REQUIRED, salvo errores de vigencia que conservan su codigo central. La historia basica no se oculta por bajar de plan. Porcino rechaza IATF y TE con 400.

Lecturas reproductivas: reproduccion.ver. Operaciones de produccion/campana: reproduccion.gestionar. Evaluar CL y diagnosticar exige reproduccion.iatfDiagnosticar (Administrador/Veterinario). Ventas usa ventas.ver/ventas.gestionar, sin conceder administracion del inventario reproductivo al Contador. Los responsables muestran nombre y rol de la membresia de la organizacion, no el rol global antiguo.

## Uso

1. Reproduccion > Bovino > Programa TE > Donantes y colectas / FIV. Registrar donante interna o externa, padre o semen del banco, fecha y costos por moneda. Puede planificar el protocolo o registrar produccion ya realizada.
2. Ejecutar pasos reales de donante, registrando insumos. Planificar no descuenta stock. Finalizar exige los pasos obligatorios y estructuras conciliadas; permite cero viables.
3. Repartir viables en uno o varios lotes por calidad, estadio y conservacion; cada lote tiene gaveta reproductiva y comercial. Compras externas ingresan desde Banco de embriones.
4. Receptoras TETF: seleccionar hembras bovinas activas, responsable y actividades del protocolo. Ejecutar sincronizacion y evaluar CL individualmente. APTA exige lado del ovario.
5. Reservar embriones reproductivos; una transferencia real consume una reserva o stock reproductivo directo y genera el servicio TE del ciclo. NO_APTA y sincronizacion pendiente impiden transferir.
6. Registrar diagnostico y continuar parto/cria desde Reproduccion. Cerrar/cancelar TETF devuelve reservas no utilizadas y cancela tareas pendientes de campana; no cancela gestaciones ni seguimientos ya creados.
7. Ventas > Genetica - Embriones: vender exclusivamente stock comercial; anular con motivo conserva venta e ingreso y genera la contrapartida.

Las entradas por compra y costos de produccion son costos operativos del programa; no se crean egresos financieros automaticos adicionales que pudieran duplicar facturas ya registradas en Finanzas. Las ventas y sus anulaciones si generan movimientos financieros automaticos.

## Existencias, costos e integridad

`totalIngresados = stockReproductivo + stockComercial + asignadoCampanas + totalTransferidos + totalVendidos + totalMermas`.

- Mutaciones transaccionales y descuentos condicionales con saldo >= cantidad. Asignacion de varios lotes: todo o nada. Los reintentos idempotentes no vuelven a consumir.
- Movimientos inmutables; traslados y mermas exigen motivo. Las anulaciones usan movimientos inversos. No hay borrado de historia.
- Lotes propios distribuyen el costo de produccion entre viables, manteniendo un vector CRC/USD por unidad. La moneda de referencia no elimina el costo en la otra moneda.
- Costo por preñez: costo congelado de embriones efectivamente transferidos mas sincronizacion prorrateada por transferencias, dividido por preñeces atribuidas confirmadas. No mezcla monedas ni acredita origen incierto.
- Tasa: preñeces atribuidas / transferencias reales de la cohorte. No equivale a una tasa entre receptoras exclusivamente diagnosticadas; pendientes forman parte del denominador. Sin denominador: null/--.
- Indicadores incluyen produccion por colecta, conservacion, donante, padre, tecnico y consolidacion por finca. Se aplican fechas a produccion y transferencias; inventarioActual es saldo actual, no reconstruccion historica.

## API

Base `/api/te`:

| Ruta | Operacion |
| --- | --- |
| GET/POST /colectas | Listar/crear sesion de produccion |
| POST /colectas/:id/pasos/:pasoId/ejecutar | Ejecucion real de donante |
| POST /colectas/:id/finalizar | Producir e ingresar lotes |
| GET /banco, GET /banco/:id | Stock e historial |
| POST /banco/compras | Entrada externa |
| POST /banco/:id/traslados, /mermas | Traslado de gavetas/descarte con motivo |
| GET/POST /campanas | Listar/crear TETF |
| POST /campanas/:id/pasos/:pasoId/ejecutar | Ejecutar sincronizacion |
| POST /campanas/:id/receptoras/:animalId/evaluacion | Evaluacion CL |
| POST /campanas/:id/asignaciones | Reservas reproductivas |
| POST /campanas/:id/receptoras/:animalId/transferir | Transferencia real y ciclo |
| POST /campanas/:id/receptoras/:animalId/diagnosticos | Diagnostico en ciclo comun |
| POST /campanas/:id/cerrar | Cierre/cancelacion y devolucion |
| GET /indicadores | Reporte y costos TE |

Ventas: GET/POST `/api/ventas/embriones`, GET `/existencias`, POST `/:id/anular`. Premium: GET `/api/reportes/multi-finca/te?fincaIds=...`.

El formulario puntual comun admite `servicio.loteEmbrionId` solo desde Pro; toma genealogia y costo del banco y consume una unidad reproductiva. Sin ese campo sigue siendo TE informativa disponible en todos los planes.

Rutas anteriores `/api/reproduccion/programa-te/colectas`: GET conserva lectura; las escrituras responden 409 TE_ACTUALIZAR_CLIENTE para evitar crear otro inventario aislado.

## Migracion y despliegue

Desde backend, primero respaldo restaurable y revision del destino:

```powershell
npm run indexes:sync
npm run migrate:reproduccion-te:check
# Solo despues de revisar discrepancias y autorizar la aplicacion:
npm run migrate:reproduccion-te
```

`scripts/migrar-reproduccion-y-te.js` acepta --dry-run (por defecto) o --aplicar. No crea indices/colecciones en dry-run. Normaliza metodos y ambas madres verificables mediante el migrador compartido; luego convierte colectas antiguas al banco conservando costos y reservas. Si falta una de las dos madres ya parcialmente declaradas, informa el caso en vez de inventar la otra.

Reservas antiguas requieren revision de sincronizacion y CL, no se declaran realizadas. Tareas pendientes anteriores se conservan como canceladas y son reemplazadas por tareas TETF. Transferencias historicas requieren un ciclo verificable y no crean otro parto. La segunda aplicacion no vuelve a crear lotes; se valida el invariante y se reportan discrepancias sin corregir silenciosamente.

## Verificacion local

- Backend: 382/382 pruebas; frontend: 44/44.
- MongoDB 8.0.5 real, replica sets desechables con 75 modelos e indices: reproduccion 13/13, programa TE 13/13, banco de semen 16/16, smoke integrado 16/16.
- Build de produccion y navegador Edge aislado: correctos. Escritorio 1440, iPad 820, movil 390; capturas en TEMP `cir-te-*.png`. Se verifica envio 4 reproductivos/2 comerciales, banco paginado e indicadores sin errores JS.
- Smoke mantiene dos avisos preexistentes de auditoria `docs?.some is not a function` durante inyeccion deliberada de errores; sus pruebas pasan. No se presenta como auditoria libre de advertencias.
- Dry-run integral sobre fixtures: 1 colecta antigua pendiente, 1 lote previsto, 0 escrituras, 0 discrepancias; 1 parto antes/despues. Aplicar dos veces: 1 colecta/1 lote en la primera, 0 en la segunda.
- La suite reproductiva aparte verifica 7 ciclos y 5 partos historicos, sin cambios de totales al migrar.
- No se consulto ni migro Atlas, la finca principal ni datos de clientes. La migracion real sigue siendo una accion operativa posterior autorizada.

Comandos: `npm test`, `npm run test:metodo-reproductivo:integracion`, `npm run test:te:integracion`, `npm run test:banco-semen:integracion`; frontend `npm test`, `npm run build`, `node tests/bancoSemen.navegador.mjs`.
