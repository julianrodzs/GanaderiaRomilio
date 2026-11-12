# Reprogramacion del destete bovino

## Uso

En Reproduccion, editar un seguimiento nuevo con parto real muestra
**Programacion de destete > Destete estimado**. Los siete meses siguen siendo
la propuesta inicial; el ganadero puede adelantarla o posponerla. Al cambiar
la fecha se solicita un motivo.

Se mantienen separados:

- `RegistroReproductivo.fechaDestete`: programacion estimada del ciclo.
- `Animal.fechaDesteteEstimada`: programacion de la cria.
- `Animal.fechaDestete`: ejecucion real; nunca se modifica al reprogramar.

## Backend

`PUT /api/reproduccion/:id` admite, para el contrato nuevo:

```json
{
  "fechaDestete": "2027-04-02",
  "motivoCambioDestete": "Adelanto por condicion de la cria"
}
```

El servicio `desteteEstimado-service` valida una fecha civil real, posterior
o igual al parto, y un motivo de 3 a 1000 caracteres. Requiere seguimiento
bovino vigente con parto real, incluido el posparto de un ciclo cerrado.
No cambia gestacion, servicios, diagnosticos, fecha del parto ni estado del
ciclo. No modifica el contrato anterior ni el destete porcino por camada.

Una transaccion guarda el ciclo, la fecha estimada de las crias vinculadas,
la fecha programada/limite de las tareas automaticas pendientes o en proceso
y eventos de observacion con fecha anterior/nueva, motivo y autor. Conserva
los IDs de las tareas y sus responsables manuales. La misma fecha no agrega
evidencia repetida. Tareas completadas y destetes reales impiden reprogramar.
Las tareas canceladas no se modifican por el servicio de reprogramacion.

Las crias se resuelven por madre gestante y dia del parto dentro de la finca;
se admite `madre` como compatibilidad solo si no existe madre gestante. En TE
se utiliza la receptora, no la donante. Si no existe cria vinculada, el ciclo
conserva su programacion; al crear despues la cria desde Reproduccion se le
asigna la estimacion vigente. No se adivinan relaciones externas incompletas.

## Confirmacion real

Tareas muestra un aviso en el detalle y pide confirmacion antes de completar
un destete bovino, tanto desde la lista como desde el detalle o la edicion de
estado. La ejecucion guarda la fecha de realizacion en la ficha de la cria
vinculada, no la fecha programada; respeta fechas reales que ya existan.
Tambien admite correctamente una cria de receptora TE.

Una tarea vinculada solo a la madre no escribe el destete real en ella. El
aviso indica registrar primero la cria o completar el dato desde Inventario.
El peso de destete sigue registrandose en Inventario. Offline mantiene el
flujo existente: la fecha de campo se concilia al sincronizar.

## Verificacion y despliegue

- Pruebas con replica set MongoDB local: sincronizacion, validaciones,
  rollback, idempotencia, aislamiento por finca, receptora TE, preservacion
  del responsable y fecha real al completar.
- Pruebas de frontend y navegador con componentes reales en 1440, 820,
  390 y 320 px, motivo obligatorio y cancelacion de la confirmacion.
- Desplegar backend y frontend juntos. Sin variables, indices ni migracion
  nuevos. No se modifican historicos de produccion durante el despliegue.
