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

const detalleVentaCamadaSchema = new Schema(
    {
        camada: { type: Schema.Types.ObjectId, ref: 'Camada', required: true },
        cantidad: { type: Number, required: true, min: 1 },
        pesoTotalKg: { type: Number, required: true, min: 0.01 },
        precioKg: { type: Number, required: true, min: 0.01 },
        subtotal: { type: Number, min: 0 }
    },
    { _id: false }
);

const ventaAnimalSchema = new Schema(
    {
        especie: { type: String, enum: ['Bovino', 'Porcino'], default: 'Bovino' },
        fechaVenta: { type: Date, required: true },
        comprador: { type: String, required: true, trim: true },
        identificacionComprador: { type: String, trim: true },
        telefonoComprador: { type: String, trim: true },
        observaciones: { type: String, trim: true },
        animales: { type: [detalleVentaAnimalSchema], default: [] },
        camadas: { type: [detalleVentaCamadaSchema], default: [] },
        totalAnimales: { type: Number, default: 0, min: 0 },
        pesoTotalKg: { type: Number, default: 0, min: 0 },
        montoCalculado: { type: Number, default: 0, min: 0 },
        montoFinal: { type: Number, min: 0, default: null },
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

const calcularTotalesVenta = ({ animales = [], camadas = [], montoFinal } = {}) => {
    const animalesCalculados = (animales || []).map((item) => ({
        animal: item.animal?._id || item.animal,
        pesoVentaKg: item.pesoVentaKg,
        precioKg: item.precioKg,
        subtotal: Number(item.pesoVentaKg || 0) * Number(item.precioKg || 0)
    }));
    const camadasCalculadas = (camadas || []).map((item) => ({
        camada: item.camada?._id || item.camada,
        cantidad: Number(item.cantidad || 0),
        pesoTotalKg: item.pesoTotalKg,
        precioKg: item.precioKg,
        subtotal: Number(item.pesoTotalKg || 0) * Number(item.precioKg || 0)
    }));

    const montoCalculado = animalesCalculados.reduce((total, item) => total + Number(item.subtotal || 0), 0)
        + camadasCalculadas.reduce((total, item) => total + Number(item.subtotal || 0), 0);
    const montoFinalNumero = montoFinal === undefined || montoFinal === null || montoFinal === ''
        ? undefined
        : Number(montoFinal);
    const montoFinalValido = Number.isFinite(montoFinalNumero) ? montoFinalNumero : null;
    const montoTotal = Number.isFinite(montoFinalValido) ? montoFinalValido : montoCalculado;

    return {
        animales: animalesCalculados,
        camadas: camadasCalculadas,
        totalAnimales: animalesCalculados.length + camadasCalculadas.reduce((total, item) => total + Number(item.cantidad || 0), 0),
        pesoTotalKg: animalesCalculados.reduce((total, item) => total + Number(item.pesoVentaKg || 0), 0)
            + camadasCalculadas.reduce((total, item) => total + Number(item.pesoTotalKg || 0), 0),
        montoCalculado,
        montoFinal: montoFinalValido,
        montoTotal,
        ajusteMonto: montoTotal - montoCalculado
    };
};

ventaAnimalSchema.pre('validate', function calcularTotales(next) {
    if ((!this.animales || this.animales.length === 0) && (!this.camadas || this.camadas.length === 0)) {
        this.invalidate('animales', 'Debe agregar al menos un animal o una camada a la venta');
    }

    Object.assign(this, calcularTotalesVenta({
        animales: this.animales,
        camadas: this.camadas,
        montoFinal: this.montoFinal
    }));
    next();
});

ventaAnimalSchema.pre('findOneAndUpdate', function calcularTotalesEnActualizacion(next) {
    const update = this.getUpdate() || {};
    const animales = update.animales || update.$set?.animales;
    const camadas = update.camadas || update.$set?.camadas;
    const montoFinal = Object.prototype.hasOwnProperty.call(update, 'montoFinal')
        ? update.montoFinal
        : update.$set?.montoFinal;

    if (!animales && !camadas) return next();

    const totales = calcularTotalesVenta({ animales: animales || [], camadas: camadas || [], montoFinal });

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

ventaAnimalSchema.index({ estado: 1, fechaVenta: -1 });
ventaAnimalSchema.index({ especie: 1, estado: 1, fechaVenta: -1 });
ventaAnimalSchema.index({ comprador: 1 });
ventaAnimalSchema.index({ 'animales.animal': 1 });
ventaAnimalSchema.index({ 'camadas.camada': 1 });

module.exports = model('VentaAnimal', ventaAnimalSchema);
