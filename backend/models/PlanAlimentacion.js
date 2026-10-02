const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const { ESPECIES_LOTE, PROPOSITOS_LOTE, ETAPAS_ALIMENTACION, normalizarPropositoLote } = require('../config/lotes');

const planAlimentacionSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    especie: { type: String, enum: ESPECIES_LOTE, required: true },
    proposito: { type: String, enum: PROPOSITOS_LOTE, required: true, set: (valor) => normalizarPropositoLote(valor) || valor },
    etapa: { type: String, enum: ETAPAS_ALIMENTACION, required: true },
    tipoManejoAlimenticio: { type: String, enum: ['PASTOREO', 'CORTE_ACARREO', 'ESTABULADO', 'MIXTO'], default: null },
    vigenciaInicio: { type: Date },
    vigenciaFin: { type: Date },
    activo: { type: Boolean, default: true },
    observaciones: { type: String, trim: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

planAlimentacionSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
planAlimentacionSchema.index({ organizacionId: 1, fincaId: 1, especie: 1, proposito: 1, activo: 1 });
planAlimentacionSchema.index({ organizacionId: 1, fincaId: 1, nombre: 1 });

module.exports = model('PlanAlimentacion', planAlimentacionSchema);
