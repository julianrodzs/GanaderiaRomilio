const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const { ETAPAS_LOTE } = require('../config/lotes');

const historialEtapaLoteSchema = new Schema({
    lote: { type: Schema.Types.ObjectId, ref: 'Lote', required: true },
    etapa: { type: String, enum: ETAPAS_LOTE, required: true },
    fechaInicio: { type: Date, required: true, default: Date.now },
    fechaFin: { type: Date, default: null },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

historialEtapaLoteSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
historialEtapaLoteSchema.index({ organizacionId: 1, fincaId: 1, lote: 1, fechaInicio: -1 });
historialEtapaLoteSchema.index(
    { organizacionId: 1, fincaId: 1, lote: 1 },
    { unique: true, partialFilterExpression: { fechaFin: null } }
);

module.exports = model('HistorialEtapaLote', historialEtapaLoteSchema);
