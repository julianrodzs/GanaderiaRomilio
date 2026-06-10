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
movimientoFinancieroSchema.index({ referenciaModelo: 1, referenciaId: 1 });

module.exports = model('MovimientoFinanciero', movimientoFinancieroSchema);
