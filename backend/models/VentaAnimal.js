const { Schema, model } = require('mongoose');

const detalleVentaAnimalSchema = new Schema(
    {
        animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
        pesoVentaKg: { type: Number, required: true, min: 0.01 },
        precioKg: { type: Number, required: true, min: 0.01 },
        subtotal: { type: Number, min: 0 }
    },
    { _id: false }
);

const ventaAnimalSchema = new Schema(
    {
        fechaVenta: { type: Date, required: true },
        comprador: { type: String, required: true, trim: true },
        identificacionComprador: { type: String, trim: true },
        telefonoComprador: { type: String, trim: true },
        observaciones: { type: String, trim: true },
        animales: {
            type: [detalleVentaAnimalSchema],
            validate: {
                validator: (items) => Array.isArray(items) && items.length > 0,
                message: 'Debe agregar al menos un animal a la venta'
            }
        },
        totalAnimales: { type: Number, default: 0, min: 0 },
        pesoTotalKg: { type: Number, default: 0, min: 0 },
        montoTotal: { type: Number, default: 0, min: 0 },
        comprobanteUrl: { type: String, trim: true },
        estado: {
            type: String,
            enum: ['Pendiente', 'Confirmada', 'Anulada'],
            default: 'Confirmada'
        },
        registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
    },
    {
        timestamps: true
    }
);

ventaAnimalSchema.pre('validate', function calcularTotales(next) {
    this.animales = (this.animales || []).map((item) => ({
        animal: item.animal,
        pesoVentaKg: item.pesoVentaKg,
        precioKg: item.precioKg,
        subtotal: Number(item.pesoVentaKg || 0) * Number(item.precioKg || 0)
    }));
    this.totalAnimales = this.animales.length;
    this.pesoTotalKg = this.animales.reduce((total, item) => total + Number(item.pesoVentaKg || 0), 0);
    this.montoTotal = this.animales.reduce((total, item) => total + Number(item.subtotal || 0), 0);
    next();
});

module.exports = model('VentaAnimal', ventaAnimalSchema);
