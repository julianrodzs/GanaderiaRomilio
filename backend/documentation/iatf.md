# IATF configurable

El módulo IATF amplía Reproducción bovina sin reemplazar la monta natural ni la inseminación convencional. Está protegido por la capacidad `iatfReproductivo`, disponible en PRO y PREMIUM.

La aplicación no prescribe protocolos, productos ni dosis. El profesional autorizado configura una plantilla y la campaña conserva una copia de esa versión para que una edición futura no altere su historia.

## Flujo

```txt
PlantillaProtocoloIATF
  -> CampanaIATF
  -> EjecucionPasoIATF
  -> RegistroReproductivo / DiagnosticoGestacionIATF
  -> EventoAnimal y métricas
```

1. Administrador o Veterinario crea un protocolo con pasos y tiempos configurables.
2. Crea una campaña desde un lote bovino reproductivo activo o una selección manual.
3. El sistema toma un snapshot del protocolo y de las hembras, genera el cronograma y una tarea por actividad de campaña.
4. El inventario solo se descuenta al registrar la ejecución real. Una campaña programada no consume existencias.
5. La IATF descuenta una pajuela por hembra realmente inseminada y crea o vincula su `RegistroReproductivo`.
6. Los diagnósticos son históricos: una reconfirmación no sobrescribe la observación anterior.

Las plantillas de finca u organización se pueden editar y duplicar. Las plantillas de sistema no se editan desde una finca: primero se duplican para conservar el ejemplo original. Las campañas iniciadas siempre conservan el snapshot con el que fueron creadas.

## Modelos

- `PlantillaProtocoloIATF`: estructura, criterios recomendados, pasos y versión.
- `CampanaIATF`: snapshot, participantes, condición corporal, costos y estado.
- `EjecucionPasoIATF`: fecha programada/real, animales, consumo y costo congelado.
- `DiagnosticoGestacionIATF`: fecha, método y resultado por animal.
- `InsumoReproductivo`: hormonas, dispositivos, semen y otros insumos físicos.
- `EventoCampanaIATF`: auditoría operativa de la campaña.

Todos se aíslan por organización; los documentos operativos también se aíslan por finca. Las plantillas de alcance organización se comparten únicamente dentro del mismo tenant.

## Cronograma

Cada paso usa `DESDE_INICIO` o `DESDE_PASO`, un desplazamiento en horas y una ventana opcional. Si un paso ocurre tarde, el usuario autorizado decide si recalcula las actividades dependientes. Nunca se cambian fechas silenciosamente.

Las tareas usan `tipo = Reproducción`, `moduloOrigen = Reproduccion` y `categoriaAutomatica = IATF`, por lo que aparecen en el Calendario Operativo y reciben la información lunar ya existente únicamente como contexto informativo.

Una tarea IATF no se puede completar con el cierre genérico de tareas. El responsable abre su actividad asignada, registra fecha y hora reales, animales atendidos y cantidades consumidas; si el paso es una inseminación también selecciona el semen usado. Solo esa ejecución real actualiza inventario, campaña, reproducción y bitácora.

## Inventario y costos

Categorías disponibles:

- `HORMONA_REPRODUCTIVA`
- `DISPOSITIVO_REPRODUCTIVO`
- `SEMEN`
- `INSUMO_REPRODUCTIVO`
- `OTRO`

Los dispositivos `REUTILIZABLE_CONTROLADO` pasan de disponible a en uso al insertarse y vuelven a disponible al retirarse. No se habilita reutilización por defecto. El consumo guarda cantidad, lote, vencimiento, costo unitario y moneda como snapshot. No crea otro egreso financiero porque la compra ya representa ese egreso.

## Integración reproductiva

`RegistroReproductivo` incorpora `tipoInseminacion`, `campanaIATF` y `origenGestacion`. Una IATF usa `tipoInseminacion = IATF` y queda como `Inseminada pendiente diagnóstico`; no se declara gestante por haber sido inseminada. Solo un diagnóstico `PREÑADA` genera la fecha probable de parto usando `Finca.configuracionReproductiva.diasGestacionBovinaGeneral`, editable desde Mi plan. El destete definitivo sigue dependiendo del parto real y no existe fecha de secado.

## Métricas

P/AI se calcula así:

```txt
hembras preñadas / hembras realmente inseminadas * 100
```

El denominador usa la evidencia `fechaInseminacion`, no el estado actual de participación. Por eso una hembra inseminada y retirada posteriormente continúa formando parte del resultado observado de esa campaña.

También se exponen inscritas, completaron, inseminadas, vacías, dudosas, resultados por fecha de diagnóstico, resultados observados por toro, costo de insumos, semen, costos adicionales y costo por preñez. El consolidado PREMIUM pondera P/AI usando las sumas de preñadas e inseminadas, no un promedio simple de porcentajes.

## Permisos

| Acción | Administrador | Veterinario | Encargado | Trabajador |
| --- | --- | --- | --- | --- |
| Ver campañas | Sí | Sí | Sí | Solo tarea asignada |
| Configurar protocolos e inventario | Sí | Sí | No | No |
| Crear/finalizar campañas | Sí | Sí | No | No |
| Ejecutar pasos | Sí | Sí | Sí | Desde su tarea asignada |
| Registrar diagnósticos | Sí | Sí | No | No |

## API

- `GET/POST /api/iatf/protocolos`
- `GET/PUT /api/iatf/protocolos/:id`
- `GET/POST /api/iatf/campanas`
- `GET /api/iatf/tareas/:tareaId` (actividad limitada al responsable asignado)
- `GET /api/iatf/campanas/:id`
- `POST /api/iatf/campanas/:id/pasos/:pasoId/ejecutar`
- `POST /api/iatf/campanas/:id/pasos/:pasoId/reprogramar`
- `POST /api/iatf/campanas/:id/inseminaciones`
- `POST /api/iatf/campanas/:id/diagnosticos`
- `GET /api/iatf/campanas/:id/metricas`
- `POST /api/iatf/campanas/:id/finalizar`
- `POST /api/iatf/campanas/:id/cancelar`
- `POST /api/iatf/campanas/:id/participantes/:participanteId/retirar`
- `POST /api/iatf/campanas/:id/resincronizar`
- `GET/POST /api/iatf/insumos`
- `PUT /api/iatf/insumos/:id`
- `GET /api/iatf/metricas/consolidado` (PREMIUM)

## Compatibilidad y despliegue

El cambio es aditivo y no necesita una migración obligatoria. MongoDB crea las nuevas colecciones al primer uso. Los registros históricos de reproducción no se modifican. La operación transaccional requiere MongoDB Atlas o un replica set, igual que otros flujos transaccionales del SaaS.
