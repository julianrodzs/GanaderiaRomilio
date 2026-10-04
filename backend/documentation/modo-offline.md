# Modo offline operativo

El modo offline es deliberadamente acotado. No intenta replicar toda la aplicacion ni permite operaciones financieras desconectadas.

## Alcance soportado

| Modulo | Consulta offline | Escritura offline |
| --- | --- | --- |
| Inventario | Lista previamente descargada, separada por especie | No |
| Potreros | Lista previamente descargada | No |
| Tareas | Lista visible para el rol, periodo y filtros previamente descargados | Completar tarea y observaciones |

Reproduccion, Sanidad, Pesajes, Compras, Ventas, Finanzas, Reportes, Importacion, Drone y Usuarios requieren conexion. Cuando la aplicacion detecta que no hay red, los formularios que ya soportan modo consulta se bloquean.

## Aislamiento SaaS

IndexedDB separa cada coleccion y operacion pendiente mediante:

```txt
organizacionId + fincaId + usuarioId + recurso + variante
```

Inventario agrega la especie a la variante. Tareas agrega los filtros y periodo consultado y se conserva para cualquier rol con acceso al módulo, incluidos Administrador y Encargado. Los datos de otra organizacion, finca o usuario no se devuelven aunque compartan el mismo navegador.

La finca activa forma parte de la sesión local y de cada solicitud mediante `X-Finca-Id`. Al cambiarla, la interfaz vuelve a montar los módulos para no conservar resultados visuales de la finca anterior. Las descargas y operaciones pendientes no se trasladan: permanecen bajo la clave de su finca original y reaparecen al volver a ella. Si hay tareas pendientes, el selector advierte antes del cambio, pero no las descarta.

El cierre de sesion voluntario elimina el contexto local completo. Si existen operaciones pendientes, el usuario debe confirmar que desea descartarlas. Un token JWT vencido no permite abrir la sesion offline, pero conserva la cola aislada para recuperarla cuando el mismo usuario vuelva a autenticarse.

El service worker conserva solamente la interfaz estatica. Las respuestas `/api` no se guardan en Cache Storage; las colecciones permitidas se administran expresamente en IndexedDB.

## Cola de tareas

Cada finalizacion offline guarda:

- clave de idempotencia unica;
- version `updatedAt` que tenia la tarea al descargarse;
- estado de sincronizacion;
- cantidad y fecha de intentos;
- observaciones;
- contexto de organizacion, finca y usuario.

Estados locales:

- `Pendiente`: esperando conexion o siguiente reintento.
- `Sincronizando`: solicitud en curso.
- `Fallido`: alcanzo el maximo de reintentos automaticos.
- `Conflicto`: la tarea fue modificada, cancelada o completada desde otro dispositivo.

Los reintentos usan espera progresiva y un maximo de cinco intentos automaticos. El panel de conexion permite revisar cada cambio, reintentar y descartar. Una clave ya aplicada devuelve el resultado actual sin repetir bitacoras ni notificaciones.

## Operacion recomendada

1. Abrir la aplicacion con conexion antes de salir al campo.
2. Entrar a Inventario, Potreros y Mis tareas para descargar las vistas necesarias.
3. Verificar en el indicador del encabezado la fecha de `Datos guardados`.
4. Completar tareas asignadas durante la desconexion.
5. Al recuperar red, mantener la sesion abierta hasta que el contador llegue a cero.
6. Resolver cualquier elemento `Requiere revision` antes de cerrar sesion.

Los datos guardados con mas de 24 horas se identifican como datos que requieren actualizacion. El alcance puede ampliarse en el futuro, pero no debe agregarse un modulo sin definir conflictos, seguridad, volumen y reglas de sincronizacion.
