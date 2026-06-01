# Agente Fullstack - GanaderiaRomilio

Necesito remodelar el módulo de costos/finanzas.

Actualmente tengo varias hojas de Excel relacionadas con dinero:
- Pago de planillas
- Inversión de ganado y fincas
- Control de compra

Quiero unificarlas en la app bajo un módulo llamado Finanzas o Costos, pero manteniendo filtros y formularios separados para cada tipo.

Crea un modelo Mongoose llamado MovimientoFinanciero con estos campos:

- fecha: Date, requerido
- tipoMovimiento: String enum ['Planilla', 'Inversion', 'Compra'], requerido
- categoria: String, requerido
- descripcion: String, requerido
- monto: Number, requerido
- metodoPago: String
- proveedor: String
- empleado: String
- finca: String
- potrero: ObjectId ref Potrero
- animal: ObjectId ref Animal
- comprobante: String
- observaciones: String

Crea controlador y rutas:
- GET /api/finanzas
- POST /api/finanzas
- GET /api/finanzas/resumen
- GET /api/finanzas/tipo/:tipoMovimiento
- PUT /api/finanzas/:id
- DELETE /api/finanzas/:id

El resumen debe devolver:
- totalGeneral
- totalPlanillas
- totalInversiones
- totalCompras
- totalPorCategoria
- totalPorMes

No borres el modelo Costo todavía. Déjalo por compatibilidad, pero el nuevo módulo principal será MovimientoFinanciero.