const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const CATEGORIAS_INSUMO_REPRODUCTIVO = [
    'HORMONA_REPRODUCTIVA',
    'DISPOSITIVO_REPRODUCTIVO',
    'SEMEN',
    'INSUMO_REPRODUCTIVO',
    'OTRO'
];

const cantidadValidaSegunCategoria = function validarCantidad(valor) {
    return this.categoria !== 'SEMEN' || Number.isInteger(valor);
};

const insumoReproductivoSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    categoria: { type: String, enum: CATEGORIAS_INSUMO_REPRODUCTIVO, required: true },
    unidad: { type: String, required: true, trim: true },
    cantidadDisponible: {
        type: Number,
        min: 0,
        default: 0,
        validate: { validator: cantidadValidaSegunCategoria, message: 'Las pajuelas disponibles deben ser un numero entero' }
    },
    cantidadEnUso: {
        type: Number,
        min: 0,
        default: 0,
        validate: { validator: cantidadValidaSegunCategoria, message: 'Las pajuelas en uso deben ser un numero entero' }
    },
    costoUnitario: { type: Number, min: 0, default: 0 },
    moneda: { type: String, enum: ['CRC', 'USD'], default: 'CRC' },
    lote: { type: String, trim: true },
    fechaVencimiento: { type: Date },
    tipoDispositivo: { type: String, enum: ['DESECHABLE', 'REUTILIZABLE_CONTROLADO'] },
    tipoSemen: { type: String, enum: ['CONVENCIONAL', 'SEXADO', 'OTRO'] },
    toro: { type: String, trim: true },
    codigoToro: { type: String, trim: true },
    razaToro: { type: String, trim: true },
    activo: { type: Boolean, default: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    bancoSemenId: { type: Schema.Types.ObjectId, ref: 'BancoSemen' }
}, { timestamps: true });

insumoReproductivoSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
insumoReproductivoSchema.index({ organizacionId: 1, fincaId: 1, categoria: 1, activo: 1 });
insumoReproductivoSchema.index({ organizacionId: 1, fincaId: 1, nombre: 1, lote: 1 });

module.exports = {
    CATEGORIAS_INSUMO_REPRODUCTIVO,
    InsumoReproductivo: model('InsumoReproductivo', insumoReproductivoSchema)
};
