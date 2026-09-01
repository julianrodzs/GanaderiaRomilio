const { Schema, model } = require('mongoose');
const { normalizarMovimientoFinanciero } = require('../services/normalizacionFinanciera-service');

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
        categoriaNormalizada: { type: String, trim: true, default: 'Otros' },
        descripcion: { type: String, required: true, trim: true },
        producto: { type: String, trim: true },
        cantidad: { type: Number, min: 0 },
        unidad: { type: String, trim: true },
        unidadNormalizada: { type: String, trim: true },
        factorUnidad: { type: Number, min: 0 },
        cantidadFisica: { type: Number, min: 0 },
        precioUnitario: { type: Number, min: 0 },
        precioUnitarioFisico: { type: Number, min: 0 },
        periodoInicio: { type: Date },
        periodoFin: { type: Date },
        tipoTrabajo: { type: String, trim: true },
        cantidadPersonas: { type: Number, min: 0 },
        diasTrabajados: { type: Number, min: 0 },
        horasTrabajadas: { type: Number, min: 0 },
        costoUnitario: { type: Number, min: 0 },
        tipoInversion: { type: String, trim: true },
        activoAsociado: { type: String, trim: true },
        destinoUso: { type: String, trim: true },
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

movimientoFinancieroSchema.pre('validate', function normalizarMovimiento(next) {
    const normalizado = normalizarMovimientoFinanciero(this.toObject());

    this.categoriaNormalizada = normalizado.categoriaNormalizada;
    this.unidadNormalizada = normalizado.unidadNormalizada;
    this.factorUnidad = normalizado.factorUnidad;
    this.cantidadFisica = normalizado.cantidadFisica;
    this.precioUnitarioFisico = normalizado.precioUnitarioFisico;

    next();
});

movimientoFinancieroSchema.pre('findOneAndUpdate', function normalizarMovimientoActualizado(next) {
    const update = this.getUpdate() || {};
    const datos = {
        ...(update.$set || {}),
        ...Object.fromEntries(
            Object.entries(update).filter(([clave]) => !clave.startsWith('$'))
        )
    };
    const normalizado = normalizarMovimientoFinanciero(datos);
    const cambiaCategoria = ['categoria', 'producto', 'descripcion', 'tipoMovimiento'].some((campo) => Object.prototype.hasOwnProperty.call(datos, campo));
    const cambiaUnidad = ['unidad', 'cantidad'].some((campo) => Object.prototype.hasOwnProperty.call(datos, campo));
    const cambiaPrecioFisico = ['unidad', 'cantidad', 'monto'].some((campo) => Object.prototype.hasOwnProperty.call(datos, campo));
    const camposNormalizados = {};

    if (cambiaCategoria) {
        camposNormalizados.categoriaNormalizada = normalizado.categoriaNormalizada;
    }

    if (cambiaUnidad) {
        camposNormalizados.unidadNormalizada = normalizado.unidadNormalizada;
        camposNormalizados.factorUnidad = normalizado.factorUnidad;
        camposNormalizados.cantidadFisica = normalizado.cantidadFisica;
    }

    if (cambiaPrecioFisico) {
        camposNormalizados.precioUnitarioFisico = normalizado.precioUnitarioFisico;
    }

    if (!Object.keys(camposNormalizados).length) {
        return next();
    }

    if (update.$set) {
        update.$set = {
            ...update.$set,
            ...camposNormalizados
        };
    } else {
        Object.assign(update, camposNormalizados);
    }

    this.setUpdate(update);
    next();
});

movimientoFinancieroSchema.index({ fecha: -1 });
movimientoFinancieroSchema.index({ tipoMovimiento: 1, fecha: -1 });
movimientoFinancieroSchema.index({ categoria: 1, fecha: -1 });
movimientoFinancieroSchema.index({ categoriaNormalizada: 1, fecha: -1 });
movimientoFinancieroSchema.index({ producto: 1, unidad: 1, fecha: -1 });
movimientoFinancieroSchema.index({ producto: 1, unidadNormalizada: 1, fecha: -1 });
movimientoFinancieroSchema.index({ destinoUso: 1, fecha: -1 });
movimientoFinancieroSchema.index({ tipoMovimiento: 1, tipoTrabajo: 1, fecha: -1 });
movimientoFinancieroSchema.index({ tipoMovimiento: 1, tipoInversion: 1, fecha: -1 });
movimientoFinancieroSchema.index({ referenciaModelo: 1, referenciaId: 1 });

module.exports = model('MovimientoFinanciero', movimientoFinancieroSchema);
