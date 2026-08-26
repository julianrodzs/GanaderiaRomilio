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
        especie: { type: String, enum: ['Bovino', 'Porcino'], default: 'Bovino' },
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
        montoCalculado: { type: Number, default: 0, min: 0 },
        montoFinal: { type: Number, min: 0 },
        montoTotal: { type: Number, default: 0, min: 0 },
        ajusteMonto: { type: Number, default: 0 },
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

const calcularTotalesCompra = ({ animales = [], montoFinal } = {}) => {
    const animalesCalculados = (animales || []).map((item) => {
        const subtotal = Number(item.pesoCompraKg || 0) * Number(item.precioKg || 0);

        return {
            animal: item.animal?._id || item.animal,
            identificadorFinca: item.identificadorFinca,
            diio: item.diio,
            nombre: item.nombre,
            sexo: item.sexo,
            raza: item.raza,
            fechaNacimiento: item.fechaNacimiento,
            pesoCompraKg: item.pesoCompraKg,
            precioKg: item.precioKg,
            subtotal,
            observaciones: item.observaciones
        };
    });

    const montoCalculado = animalesCalculados.reduce((total, item) => total + Number(item.subtotal || 0), 0);
    const montoFinalNumero = montoFinal === undefined || montoFinal === null || montoFinal === ''
        ? undefined
        : Number(montoFinal);
    const montoFinalValido = Number.isFinite(montoFinalNumero) ? montoFinalNumero : undefined;
    const montoTotal = Number.isFinite(montoFinalValido) ? montoFinalValido : montoCalculado;

    return {
        animales: animalesCalculados,
        totalAnimales: animalesCalculados.length,
        pesoTotalKg: animalesCalculados.reduce((total, item) => total + Number(item.pesoCompraKg || 0), 0),
        montoCalculado,
        montoFinal: montoFinalValido,
        montoTotal,
        ajusteMonto: montoTotal - montoCalculado
    };
};

compraAnimalSchema.pre('validate', function calcularTotales(next) {
    Object.assign(this, calcularTotalesCompra({
        animales: this.animales,
        montoFinal: this.montoFinal
    }));
    next();
});

compraAnimalSchema.pre('findOneAndUpdate', function calcularTotalesEnActualizacion(next) {
    const update = this.getUpdate() || {};
    const animales = update.animales || update.$set?.animales;
    const montoFinal = Object.prototype.hasOwnProperty.call(update, 'montoFinal')
        ? update.montoFinal
        : update.$set?.montoFinal;

    if (!animales) return next();

    const totales = calcularTotalesCompra({ animales, montoFinal });

    if (update.$set) {
        update.$set = {
            ...update.$set,
            ...totales
        };
    } else {
        Object.assign(update, totales);
    }

    this.setUpdate(update);
    next();
});

compraAnimalSchema.index({ estado: 1, fechaCompra: -1 });
compraAnimalSchema.index({ especie: 1, estado: 1, fechaCompra: -1 });
compraAnimalSchema.index({ proveedor: 1 });
compraAnimalSchema.index({ 'animales.animal': 1 });

module.exports = model('CompraAnimal', compraAnimalSchema);
