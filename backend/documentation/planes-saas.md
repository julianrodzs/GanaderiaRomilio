# Planes comerciales SaaS

La configuración fuente está en `backend/config/planes.js`. Los precios pueden cambiarse con variables de entorno y no deben duplicarse en controladores ni frontend.

| Plan | USD/mes | Fincas | Usuarios activos | Animales activos | Dron/mes | Productiva | Económica | Emails |
| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Esencial | 6 | 1 | 3 | 210 bovinos o 500 porcinos | 15 si elige bovinos | No | No | No |
| Gestión | 12 | 2 | 8 | 2.000 total | 60 | Sí | No | No |
| Pro | 20 | 5 | 20 | 5.000 total | 150 | Sí | Sí | Sí |
| Premium | 35 | 10 | 50 | 10.000 total | Uso intensivo medido | Sí | Sí | Sí |

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

La validación de fincas está preparada en `PlanService`. No se expone una administración multi-finca nueva porque ese flujo todavía no existe completo.

## Funciones protegidas

Analítica productiva, desde Gestión: productividad/IPG, vacas improductivas, partos por vaca y año, crecimiento por pesajes, reproducción porcina avanzada y rendimiento de potreros.

Analítica económica, desde Pro: finanzas y sustentabilidad de cría, compras avanzadas, economía por camada, ventas por origen y rotación de inventario vendido.

Auditoría avanzada se consulta desde Pro. La captura continúa en todos los planes para conservar historial.

El Centro de Alertas permanece activo en todos los planes. Los correos operativos de tareas se envían solo en Pro y Premium; recuperación de contraseña y seguridad no dependen del plan.

## Dron

Antes de procesar una imagen se reserva capacidad mensual. Solo un conteo guardado incrementa consumo. Los fallos liberan la reserva y una clave de idempotencia evita cobrar dos veces un reintento técnico.

## Frontend

- `PlanContext` comparte el plan actual.
- `SelectorEspecie` oculta especies no contratadas en Esencial.
- `FeatureGate`, `PlanLimit` y `UpgradeMessage` son reutilizables.
- `Mi plan` muestra precio, consumo, límites, capacidades y selección de especie.
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

Un correo que ya tenga una membresía en otra organización se rechaza durante esta primera fase. Esto evita cambiar silenciosamente la organización principal del usuario mientras se implementa el selector de organizaciones.

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

## Pendiente deliberadamente

- Pagos, cobros y facturación.
- Cambio automático de plan por suscripción.
- Administración completa de varias fincas.
- Política de uso justo y límite técnico de dron Premium.
- Configuración avanzada y resumen diario de correos Premium.
- Cambio de organización para usuarios que pertenezcan a más de un cliente.
