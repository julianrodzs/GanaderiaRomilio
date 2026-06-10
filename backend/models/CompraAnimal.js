const { Schema, model } = require('mongoose');

const detalleCompraAnimalSchema = new Schema(
    {
        animal: { type: Schema.Types.ObjectId, ref: 'Animal' },
        identificadorFinca: { type: String, trim: true },
        diio: { type: String, trim: true },
        nombre: { type: String, trim: true },
        sexo: { type: String, enum: ['Macho', 'Hembra'], required: true },
        raza: { type: String, trim: true },
        fechaNacimiento: { type: Date },
        pesoCompraKg: { type: Number, required: true, min: 0.01 },
        precioKg: { type: Number, required: true, min: 0.01 },
        subtotal: { type: Number, min: 0 },
        observaciones: { type: String, trim: true }
    },
    { _id: false }
);

const compraAnimalSchema = new Schema(
    {
        fechaCompra: { type: Date, required: true },
        proveedor: { type: String, required: true, trim: true },
        identificacionProveedor: { type: String, trim: true },
        telefonoProveedor: { type: String, trim: true },
        observaciones: { type: String, trim: true },
        animales: {
            type: [detalleCompraAnimalSchema],
            validate: {
                validator: (items) => Array.isArray(items) && items.length > 0,
                message: 'Debe agregar al menos un animal a la compra'
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

compraAnimalSchema.pre('validate', function calcularTotales(next) {
    this.animales = (this.animales || []).map((item) => ({
        animal: item.animal,
        identificadorFinca: item.identificadorFinca,
        diio: item.diio,
        nombre: item.nombre,
        sexo: item.sexo,
        raza: item.raza,
        fechaNacimiento: item.fechaNacimiento,
        pesoCompraKg: item.pesoCompraKg,
        precioKg: item.precioKg,
        subtotal: Number(item.pesoCompraKg || 0) * Number(item.precioKg || 0),
        observaciones: item.observaciones
    }));
    this.totalAnimales = this.animales.length;
    this.pesoTotalKg = this.animales.reduce((total, item) => total + Number(item.pesoCompraKg || 0), 0);
    this.montoTotal = this.animales.reduce((total, item) => total + Number(item.subtotal || 0), 0);
    next();
});

compraAnimalSchema.index({ estado: 1, fechaCompra: -1 });
compraAnimalSchema.index({ proveedor: 1 });
compraAnimalSchema.index({ 'animales.animal': 1 });

module.exports = model('CompraAnimal', compraAnimalSchema);
