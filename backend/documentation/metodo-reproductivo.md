# Metodo reproductivo unificado y transferencia de embriones

Fecha: 2026-11-03. Implementacion local; no implica migracion ni despliegue de datos del cliente.

## Fase 0: mapa de inspeccion

| Campo o flujo anterior | Adaptacion |
| --- | --- |
| Animal.madre y madreDiio | Compatibilidad genetica; madreGeneticaId y madreGestanteId distinguen donante y receptora. |
| RegistroReproductivo.tipoRegistro | Se conserva para clientes anteriores. metodo es el contrato nuevo. |
| origenGestacion, tipoInseminacion | Compatibilidad con MONTA_NATURAL, IA_CONVENCIONAL, IATF, TE y DESCONOCIDO. |
| Un ciclo por hembra | Se reutiliza RegistroReproductivo; servicios[] permite repaso sin abrir otra gestacion. |
| Fecha de monta usada como prueba de gestacion | Un servicio queda pendiente; gestacionConfirmada requiere diagnostico positivo. |
| fechaPartoEstimada como unico antecedente | Registro de gestacion sin servicio; no se inventa una monta. |
| DiagnosticoGestacionIATF y diagnosticos de bandas | Siguen existiendo; el ciclo conserva historialDiagnosticos para la linea de tiempo comun. |
| fechaPartoReal | Se conserva como fuente del conteo de partos; resultado separa parto, perdida, aborto y otro. |
| Herencia desde semenSnapshot | Se conserva cuando hay atribucion confirmada; se evita con origen incierto o sin servicio. |
| Banco de semen y reservas IATF | No se duplican existencias. La campana sigue consumiendo sus asignaciones; el servicio individual usa reproductiva. |
| EventoAnimal | Servicio, diagnostico y resultado tienen claves distintas, estables e idempotentes. |
| genealogiaService: madre | Arbol, ancestros y descendencia genetica usan madreGeneticaId, con fallback legado. |
| Seguimiento bovino y destete | Buscan la cria de la madre gestante, no la donante. |
| Reporte de descendencia | Separa progenieGenetica de criasGestadas; partos siguen agrupados por el animal del ciclo. |
| Reportes de destete y vacas a revisar | La contribucion maternal de TE corresponde a la receptora. |
| IATF: tasa de prenez y costo/preñez | No se acredita una gestacion incierta o atribuida a monta a la campana. |

El metodo se perdia en la tabla reproductiva, la bitacora generica y los reportes de partos. No existia TE ni una representacion separada de donante y receptora. Algunos recorridos convencionales declaraban Gestante por tener fecha de servicio, sin diagnostico.

## Modelo y atribucion

- Catalogo canonico: `shared/metodos-reproductivos.json`. Artefactos generados dentro de backend y frontend permiten desplegarlos con root directories independientes.
- Verificar catalogos: `node scripts/sincronizarMetodosReproductivos.cjs` desde la raiz. Regenerar: agregar `--escribir`.
- No se crea otro modelo de gestacion ni otro inventario de semen. El ciclo contiene servicios, diagnosticos, resultado y atribucion.
- Los servicios tienen ID propio; servicioAtribuidoId y serviciosCandidatos referencian esos eventos.
- Unico servicio compatible: CONFIRMADA. Varios compatibles: INCIERTA, metodo DESCONOCIDO hasta confirmacion manual. Ninguno: SIN_SERVICIO. El enum admite PROBABLE para evidencia futura, pero este sprint no elige candidatos de forma heuristica.
- La confirmacion manual solo admite candidatos de ese animal y finca. Agregar otro servicio invalida la eleccion anterior para revisar nuevamente.
- La compatibilidad usa dias estimados del diagnostico o parto real/probable menos duracion de gestacion. TE considera la edad del embrion (7 dias por defecto, configurable por registro).
- Configuracion por finca: diasGestacionBovinaGeneral (283 por defecto), diasGestacionPorcinaGeneral (114 para registros nuevos), toleranciaAtribucionDias (21 por defecto).
- Estas ventanas no son pruebas geneticas. Con repaso compatible se conserva la incertidumbre; no se atribuye paternidad por ser el ultimo servicio.
- En TE, `madre` se mantiene como alias genetico para compatibilidad. La receptora esta en madreGestanteId; donante externa en madreGeneticaExterna y campos legados externos.
- No se modifica paternidad historica de crias durante la migracion.
- Conservar PARTO y repetir el resultado no borra su lista de crias.

## Planes y permisos

| Funcionalidad | Esencial | Gestion | Pro | Premium |
| --- | --- | --- | --- | --- |
| Servicios informativos de metodos validos por especie | Si | Si | Si | Si |
| Gestacion sin servicio conocido | Si | Si | Si | Si |
| TE basica, donante, receptora y nacimiento | Si | Si | Si | Si |
| Historial y partos por metodo | Si | Si | Si | Si |
| Indicadores por metodo | No | Si | Si | Si |
| Campanas IATF y banco de semen | No | No | Si | Si |
| Programa TE: colectas/FIV, embriones, receptoras y costos | No | No | Si | Si |
| Consolidado por metodo de fincas autorizadas | No | No | No | Si |

Porcinos rechazan IATF y TRANSFERENCIA_EMBRIONES con 400. Registrar historicamente una IATF no concede acceso a campanas ni al banco. La historia basica sigue visible al bajar de plan. Las escrituras requieren vigencia y los permisos existentes reproduccion.gestionar; los reportes usan reportes.ver.

## Programa TE

`ProgramaTransferencia` se amplia como sesion de colecta/OPU/FIV sin crear otra coleccion de colectas. El programa integral reemplaza las reservas de embriones individuales por lotes centrales con gavetas reproductiva y comercial, campanas TETF, protocolos de donantes y ventas con anulacion.

Consultar [programa-te-integral.md](programa-te-integral.md) para el mapa de reutilizacion, API actual, costos por moneda, permisos, operacion y migracion de las reservas anteriores. Registrar una transferencia real sigue creando un RegistroReproductivo normal y no confirma una gestacion por si solo.

## API

| Ruta | Uso |
| --- | --- |
| POST /api/reproduccion | Nuevo contrato: metodo, servicio opcional, diagnostico/resultado opcionales, claveIdempotencia. |
| POST /api/reproduccion/:id/servicios | Agregar servicio o repaso al ciclo activo. |
| POST /api/reproduccion/:id/diagnosticos | Diagnostico fechado, tecnica, dias estimados y parto probable. |
| POST /api/reproduccion/:id/resultado | Parto, perdida, aborto u otro resultado. |
| POST /api/reproduccion/:id/atribucion | Confirmar servicioId de los candidatos. |
| POST /api/reproduccion/:id/ternero | Nacimiento con herencia genetica/gestante. |
| GET /api/reportes/reproduccion/partos-metodo | Todas las suscripciones; filtros especie, metodo, fechaInicio y fechaFin. |
| GET /api/reportes/reproduccion/metodos | Indicadores desde Gestion. |
| GET /api/reportes/multi-finca/metodos-reproductivos | Premium; fincaIds resueltos contra membresia. |
| GET/POST /api/te/colectas | Programa integral desde Pro. |
| GET/POST /api/te/campanas | Receptoras y protocolo TETF. |
| GET /api/reproduccion/programa-te/colectas | Lectura legada; sus escrituras responden 409 TE_ACTUALIZAR_CLIENTE. |

La entrada informativa sin banco no mueve existencias. Si se selecciona semen, el servicio central conserva el descuento transaccional, moneda y snapshot; no puede consumir desde la gaveta comercial.

## Indicadores

- Cohorte: servicios realmente registrados en el periodo, no creaciones de ciclos ni planes.
- Preñez/servicios: servicios con concepcion confirmada atribuida / servicios del metodo. Una concepcion incierta no se acredita a IATF ni a monta.
- Servicios/concepcion: servicios del metodo / concepciones atribuidas. Es una razon de cohorte, no el numero de intentos de una vaca especifica.
- Intervalo entre partos: diferencia entre partos reales consecutivos de la misma hembra/finca; se clasifica por el metodo del parto final.
- Perdidas: resultados ABORTO, REABSORCION o PERDIDA_GESTACIONAL fechados en el periodo.
- Sin denominador se devuelve null, mostrado como --, no un cero que sugiera rendimiento medido.
- IA total suma IA_CONVENCIONAL e IATF.
- El reporte de partos advierte que faltantes anteriores al ingreso a la app no forman parte del total registrado.

## Migracion y despliegue

Desde backend:

```powershell
npm run migrate:metodo-reproductivo:check
# Revisar informe, respaldo restaurable y destino antes de aplicar:
npm run migrate:metodo-reproductivo
```

El script `scripts/migrar-metodo-reproductivo.js` acepta `--dry-run` (por defecto) o `--aplicar`, nunca ambos. Necesita MONGODB_URI explicita y deshabilita autoCreate/autoIndex para que dry-run solo lea.

- No elimina registros ni cambia fechaPartoReal. Verifica los totales de partos antes/despues.
- Conflictos entre metodo, tipo y origen se informan sin sobrescribir el ciclo.
- Reconstruye servicios legados con ID determinista. Si hay un repaso compatible en otro ciclo historico, lo conserva como candidato con cicloOrigenId, sin contabilizarlo dos veces en indicadores.
- Sella versionMetodo=1 para que aplicar dos veces no cambie el resultado.
- Deriva ambas madres desde la madre existente solo cuando la relacion es verificable dentro del tenant; informa problemas en vez de corregirlos silenciosamente.
- Congela la duracion historica, especialmente los 118 dias porcinos legados, para no desplazar tareas al utilizar 114 en registros nuevos.
- No migra ni cambia inventarios de semen, campanas, pagos ni paternidades existentes.

Antes de produccion: respaldo verificado, sincronizacion de indices existente, dry-run autorizado contra la base objetivo y revision de discrepancias. No ejecutar --aplicar por el hecho de que el codigo ya este desplegado.

## Verificacion

Ver `metodo-reproductivo-verificacion.md`. El dry-run informado alli usa datos sinteticos locales, no la finca del cliente. No se leyo ni migro Atlas en este sprint.
