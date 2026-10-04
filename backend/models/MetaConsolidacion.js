const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const valoresMetaSchema = new Schema({
    animalesActivos: { type: Number, min: 0 },
    pesoPromedioKg: { type: Number, min: 0 },
    ingresos: { type: Number, min: 0 },
    egresosMaximos: { type: Number, min: 0 },
    balance: { type: Number },
    partos: { type: Number, min: 0 },
    destetes: { type: Number, min: 0 },
    aplicacionesSanitarias: { type: Number, min: 0 }
}, { _id: false });

const metaConsolidacionSchema = new Schema({
    alcance: { type: String, enum: ['ORGANIZACION', 'FINCA'], required: true },
    finca: { type: Schema.Types.ObjectId, ref: 'Finca' },
    nombre: { type: String, required: true, trim: true },
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date, required: true },
    metas: { type: valoresMetaSchema, required: true },
    actualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

metaConsolidacionSchema.plugin(aplicarAislamientoOrganizacion);
metaConsolidacionSchema.index({ organizacionId: 1, alcance: 1, finca: 1, fechaInicio: 1, fechaFin: 1 });

module.exports = model('MetaConsolidacion', metaConsolidacionSchema);
