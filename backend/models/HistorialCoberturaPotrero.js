const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const porcentajeSchema = new Schema({
    catalogoPasto: { type: Schema.Types.ObjectId, ref: 'CatalogoPasto', required: true },
    porcentajeEstimado: { type: Number, min: 0, max: 100 }
}, { _id: false });

const historialCoberturaPotreroSchema = new Schema({
    potrero: { type: Schema.Types.ObjectId, ref: 'Potrero', required: true, index: true },
    pastoPrincipal: { type: Schema.Types.ObjectId, ref: 'CatalogoPasto' },
    pastosSecundarios: [{ type: Schema.Types.ObjectId, ref: 'CatalogoPasto' }],
    leguminosasAsociadas: [{ type: Schema.Types.ObjectId, ref: 'CatalogoPasto' }],
    porcentajesCobertura: [porcentajeSchema],
    fechaEstablecimientoPasto: { type: Date },
    diasDescansoObjetivo: { type: Number, min: 0 },
    intervaloCorteObjetivoDias: { type: Number, min: 1 },
    observacionCobertura: { type: String, trim: true },
    descripcionCobertura: { type: String, trim: true },
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date, default: null },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

historialCoberturaPotreroSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
historialCoberturaPotreroSchema.index({ organizacionId: 1, fincaId: 1, potrero: 1, fechaInicio: 1 }, { unique: true });
historialCoberturaPotreroSchema.index({ organizacionId: 1, fincaId: 1, potrero: 1, fechaInicio: 1, fechaFin: 1 });
historialCoberturaPotreroSchema.index(
    { organizacionId: 1, fincaId: 1, potrero: 1, fechaFin: 1 },
    { unique: true, partialFilterExpression: { fechaFin: null }, name: 'una_cobertura_vigente_por_potrero' }
);

module.exports = model('HistorialCoberturaPotrero', historialCoberturaPotreroSchema);
