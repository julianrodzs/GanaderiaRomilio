const { Schema, model } = require('mongoose');

const movimientoFinancieroSchema = new Schema(
    {
        fecha: { type: Date, required: true },
        tipoMovimiento: {
            type: String,
            enum: ['Planilla', 'Inversion', 'Compra', 'Venta de animales', 'Compra de animales'],
            required: true,
            trim: true
        },
        naturaleza: {
            type: String,
            enum: ['Ingreso', 'Egreso'],
            default: 'Egreso',
            required: true,
            trim: true
        },
        categoria: { type: String, required: true, trim: true },
        descripcion: { type: String, required: true, trim: true },
        producto: { type: String, trim: true },
        cantidad: { type: Number, min: 0 },
        unidad: { type: String, trim: true },
        precioUnitario: { type: Number, min: 0 },
        periodoInicio: { type: Date },
        periodoFin: { type: Date },
        tipoTrabajo: { type: String, trim: true },
        cantidadPersonas: { type: Number, min: 0 },
        diasTrabajados: { type: Number, min: 0 },
        horasTrabajadas: { type: Number, min: 0 },
        costoUnitario: { type: Number, min: 0 },
        tipoInversion: { type: String, trim: true },
        activoAsociado: { type: String, trim: true },
        depreciable: { type: Boolean, default: false },
        vidaUtilMeses: { type: Number, min: 0 },
        fechaInicioUso: { type: Date },
        valorResidual: { type: Number, min: 0 },
        depreciacionMensual: { type: Number, min: 0 },
        estadoActivo: { type: String, trim: true },
        monto: { type: Number, required: true, min: 0 },
        moneda: {
            type: String,
            enum: ['CRC', 'USD'],
            default: 'CRC',
            trim: true
        },
        metodoPago: { type: String, trim: true },
        proveedor: { type: String, trim: true },
        empleado: { type: String, trim: true },
        finca: { type: String, trim: true },
        potrero: { type: Schema.Types.ObjectId, ref: 'Potrero' },
        animal: { type: Schema.Types.ObjectId, ref: 'Animal' },
        referenciaId: { type: Schema.Types.ObjectId },
        referenciaModelo: { type: String, trim: true },
        comprobante: { type: String, trim: true },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

movimientoFinancieroSchema.index({ fecha: -1 });
movimientoFinancieroSchema.index({ tipoMovimiento: 1, fecha: -1 });
movimientoFinancieroSchema.index({ categoria: 1, fecha: -1 });
movimientoFinancieroSchema.index({ producto: 1, unidad: 1, fecha: -1 });
movimientoFinancieroSchema.index({ tipoMovimiento: 1, tipoTrabajo: 1, fecha: -1 });
movimientoFinancieroSchema.index({ tipoMovimiento: 1, tipoInversion: 1, fecha: -1 });
movimientoFinancieroSchema.index({ referenciaModelo: 1, referenciaId: 1 });

module.exports = model('MovimientoFinanciero', movimientoFinancieroSchema);
