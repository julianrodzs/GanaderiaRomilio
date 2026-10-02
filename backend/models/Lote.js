const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const { ESPECIES_LOTE, PROPOSITOS_LOTE, ESTADOS_LOTE, ETAPAS_LOTE, normalizarPropositoLote } = require('../config/lotes');

const loteSchema = new Schema({
    codigo: { type: String, required: true, trim: true, uppercase: true },
    nombre: { type: String, required: true, trim: true },
    especie: { type: String, enum: ESPECIES_LOTE, required: true },
    proposito: { type: String, enum: PROPOSITOS_LOTE, required: true, set: (valor) => normalizarPropositoLote(valor) || valor },
    etapaOperativa: { type: String, enum: ETAPAS_LOTE, default: null },
    fechaInicio: { type: Date, required: true, default: Date.now },
    fechaCierre: { type: Date },
    estado: { type: String, enum: ESTADOS_LOTE, default: 'ACTIVO' },
    descripcion: { type: String, trim: true },
    pesoObjetivoKg: { type: Number, min: 0 },
    gmdObjetivoKgDia: { type: Number, min: 0 },
    ubicacionActual: { type: Schema.Types.ObjectId, ref: 'Potrero' },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

loteSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
loteSchema.index({ organizacionId: 1, fincaId: 1, codigo: 1 }, { unique: true });
loteSchema.index({ organizacionId: 1, fincaId: 1, especie: 1, estado: 1 });
loteSchema.index({ organizacionId: 1, fincaId: 1, proposito: 1, etapaOperativa: 1, estado: 1 });
loteSchema.index({ ubicacionActual: 1, estado: 1 });

module.exports = model('Lote', loteSchema);
