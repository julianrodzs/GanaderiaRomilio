# Planes comerciales SaaS

La configuración fuente está en `backend/config/planes.js`. Los precios pueden cambiarse con variables de entorno y no deben duplicarse en controladores ni frontend.

| Plan | USD/mes | Fincas | Usuarios activos | Animales activos | Dron/mes | Productiva | Económica | IATF | Emails |
| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |
| Esencial | 6 | 1 | 3 | 210 bovinos o 500 porcinos | 15 si elige bovinos | No | No | No | No |
| Gestión | 12 | 2 | 8 | 2.000 total | 60 | Sí | No | No | No |
| Pro | 20 | 5 | 20 | 5.000 total | 150 | Sí | Sí | Sí | Sí |
| Premium | 35 | 10 | 50 | 10.000 total | Uso intensivo medido | Sí | Sí | Sí | Sí |

Premium no tiene un límite comercial fijo de dron, pero cada conteo exitoso queda registrado en `UsoPlan`.

## Datos y servicios

- `Organizacion.plan` guarda código, estado, especie elegida y fecha de asignación.
- `UsoPlan` guarda uso mensual por organización y período `YYYY-MM`.
- `plan-service.js` centraliza plan, capacidades, especies, límites, sobrelímite y consumo.
- `GET /api/plan/actual` devuelve plan, límites, uso, funciones y roles permitidos.
- `PATCH /api/plan/especie` selecciona Bovino o Porcino para Esencial.
- `requireFeature(feature)` responde `403` con `PLAN_FEATURE_NOT_AVAILABLE`.

Los animales activos son los que tienen `estado = Activo`. Vendidos y muertos no consumen cupo. Los usuarios inactivos tampoco consumen cupo.

## Validaciones y downgrade

La creación de animales se valida desde inventario, compras, importación y nacimientos registrados en reproducción. También se valida la reactivación. La creación o reactivación de usuarios valida cupo y rol.

Una reducción de plan nunca elimina información. Si la cuenta queda sobre el nuevo límite, conserva lectura e historial y no puede crear más recursos de ese tipo hasta volver al cupo o mejorar el plan.

La administración multi-finca valida el límite del plan al crear o reactivar una finca. Una reducción de plan tampoco elimina fincas: las fincas existentes se conservan y la organización debe volver al límite antes de crear o reactivar otra.

Desde Gestión se habilita `operacionMultiFinca`: traslado de animales, pertenencia histórica y operaciones financieras entre fincas. La consolidación gerencial simultánea, metas, cierres y exportación requieren `reportesMultiFinca` y permanecen en Premium.

## Operación multi-finca

Cada solicitud autenticada puede enviar `X-Finca-Id`. El middleware comprueba que la finca esté activa, pertenezca a la organización y esté autorizada por la membresía antes de establecer el contexto de consulta. Si no se envía el encabezado se utiliza la finca principal como compatibilidad.

La membresía puede conceder acceso a todas las fincas mediante `accesoTodasFincas`, o solamente a las incluidas en `fincas`. El selector global muestra únicamente las fincas activas autorizadas. Cambiar la finca activa no emite un JWT nuevo: la identidad y la organización permanecen en el token, mientras cada petición vuelve a validar el contexto solicitado.

Endpoints de finca para administradores:

- `GET /api/fincas`: fincas autorizadas; para administradores incluye las inactivas.
- `POST /api/fincas`: crea una finca respetando el cupo del plan.
- `PUT /api/fincas/:id`: actualiza sus datos generales.
- `PATCH /api/fincas/:id/estado`: activa o desactiva una finca.
- `PATCH /api/fincas/:id/principal`: cambia la finca principal.
- `PATCH /api/fincas/:id/lineas-productivas`: configura especies y objetivos.

No se puede desactivar la finca activa ni la principal. Primero se debe seleccionar otra finca y, en el segundo caso, marcarla como principal. Esta regla evita dejar sesiones y procesos sin un contexto válido.

Gestión y Pro pueden operar más de una finca según su cupo, pero sus reportes normales continúan siendo por finca activa. Premium agrega `GET /api/reportes/multi-finca`, que acepta `fincaIds`, `fechaInicio`, `fechaFin` y `especie`, siempre limitado a fincas autorizadas de la misma organización. El comparativo presenta inventario, peso actual, finanzas, partos, destetes y sanidad por finca y consolidados. Los promedios consolidados se recalculan desde totales y cantidades, no promediando promedios de fincas. Las monedas se mantienen separadas y las transferencias internas quedan fuera del resultado consolidado.

## Funciones protegidas

Analítica productiva, desde Gestión: productividad/IPG, vacas improductivas, partos por vaca y año, crecimiento por pesajes, reproducción porcina avanzada y rendimiento de potreros.

Analítica económica, desde Pro: finanzas y sustentabilidad de cría, compras avanzadas, economía por camada, ventas por origen y rotación de inventario vendido.

Auditoría avanzada se consulta desde Pro. La captura continúa en todos los planes para conservar historial.

IATF y los protocolos reproductivos configurables se habilitan desde Pro mediante `iatfReproductivo`. Premium agrega el consolidado observado entre fincas. La operación completa está documentada en `iatf.md`.

El Centro de Alertas permanece activo en todos los planes. Los correos operativos de tareas se envían solo en Pro y Premium; recuperación de contraseña y seguridad no dependen del plan.

## Dron

Antes de procesar una imagen se reserva capacidad mensual. Solo un conteo guardado incrementa consumo. Los fallos liberan la reserva y una clave de idempotencia evita cobrar dos veces un reintento técnico.

## Frontend

- `PlanContext` comparte el plan actual.
- `SelectorEspecie` oculta especies no contratadas en Esencial.
- `FeatureGate`, `PlanLimit` y `UpgradeMessage` son reutilizables.
- `Mi plan` muestra precio, consumo, límites, capacidades y selección de especie.
- El encabezado permite cambiar la finca activa sin cerrar sesión.
- `Mi plan` administra fincas, estado, principal y líneas productivas.
- `Usuarios` permite acceso a todas las fincas o a una selección explícita.
- `Reportes` muestra el comparativo multi-finca únicamente cuando el plan incluye `reportesMultiFinca`.
- Drone se oculta en Esencial configurado para porcinos.

## Operación

El cliente existente se asigna a Premium con:

```bash
npm run migrate:plan-premium:check
npm run migrate:plan-premium
```

La operación es idempotente y no modifica datos de la finca.

## Administración de clientes

La administración global de la plataforma está separada del rol `Administrador` de cada organización. Solo un `Usuario` activo con `esSuperAdministrador = true` puede acceder a las rutas `/api/admin/organizaciones` y a la pantalla `Clientes SaaS`, disponible desde el módulo Usuarios. No se agrega otra opción al menú superior.

Endpoints internos:

- `GET /api/admin/organizaciones`: lista organizaciones, plan, finca principal y cantidades activas.
- `POST /api/admin/organizaciones`: aprovisiona un cliente completo.
- `PATCH /api/admin/organizaciones/:id/estado`: suspende, reactiva o inactiva una organización.

El alta se ejecuta dentro de una transacción de MongoDB. En una sola operación crea:

1. `Organizacion` con plan y estado comercial inicial.
2. `Finca` principal con líneas y objetivos productivos.
3. `Membresia` administrativa con acceso a la finca.
4. `Usuario` administrador global, sin compartir contraseñas temporales.
5. Catálogos financieros iniciales y `ConfiguracionProductiva`.
6. Invitación para que el administrador defina su contraseña.

Si falla cualquier escritura, la transacción revierte el alta completa. El correo se intenta después de confirmar la transacción: un fallo del proveedor no pierde el cliente creado. En desarrollo se devuelve un enlace de invitación para pruebas; en producción nunca se devuelve ese token en la respuesta.

Un correo puede pertenecer a varias organizaciones. El alta reutiliza la identidad existente sin cambiar su contraseña, nombre ni recuperación, y crea una membresía administrativa independiente para el cliente nuevo.

Para revisar y habilitar de forma explícita al operador de plataforma:

```bash
npm run superadmin:check
npm run superadmin:apply -- --email=operador@dominio.com
```

Después de habilitarlo, el usuario debe volver a iniciar sesión o recargar una sesión en línea para recibir `esSuperAdministrador` en su perfil.

### Ejemplo de aprovisionamiento

```json
{
  "organizacion": {
    "nombre": "Finca El Roble",
    "slug": "finca-el-roble",
    "pais": "Costa Rica",
    "zonaHoraria": "America/Costa_Rica"
  },
  "plan": {
    "codigo": "GESTION",
    "estado": "Prueba"
  },
  "finca": {
    "nombre": "El Roble",
    "codigo": "PRINCIPAL",
    "ubicacion": "Alajuela",
    "lineasProductivas": [
      { "especie": "Bovino", "objetivos": ["REPRODUCCION", "ENGORDE"] },
      { "especie": "Porcino", "objetivos": ["Reproducción", "Engorde"] }
    ]
  },
  "administrador": {
    "nombre": "Ana",
    "apellido": "Rojas",
    "correo": "ana@ejemplo.com",
    "telefono": "8888-8888"
  }
}
```

## Suscripciones y facturación

Stripe Checkout crea suscripciones nuevas y Customer Portal administra cambios posteriores. Solo los webhooks firmados cambian `Organizacion.plan.estado`, fechas de renovación/expiración y referencias externas. `EventoFacturacion` hace idempotente el procesamiento.

- `GET /api/facturacion/estado`: catálogo, estado y vigencia para administradores.
- `POST /api/facturacion/checkout`: crea una sesión alojada de Stripe.
- `POST /api/facturacion/portal`: abre la administración de una suscripción existente.
- `POST /api/facturacion/webhook/stripe`: webhook público protegido por firma Stripe.

## Correos Premium

`ConfiguracionEmail` guarda frecuencia diaria/semanal, horario, día y módulos por usuario y organización. `GET/PUT /api/usuario/configuracion-emails` exigen `configuracionEmailAvanzada`. El trabajo `npm run job:resumenes-email` procesa solamente organizaciones Premium vigentes y usa una clave de período para no duplicar envíos.

## Usuarios multi-organización

La identidad `Usuario` es global y cada vínculo se representa con `Membresia`, por lo que el mismo correo puede tener roles y fincas diferentes en distintas organizaciones. El selector superior aparece cuando hay más de una membresía activa. `POST /api/usuarios/cambiar-organizacion-activa` comprueba la membresía, elige una finca autorizada y emite un JWT nuevo con la organización y rol seleccionados.

## Pendiente deliberadamente

- Política de uso justo y límite técnico de dron Premium.
