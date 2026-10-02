const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const { ESPECIES_LOTE, PROPOSITOS_LOTE, ETAPAS_ALIMENTACION, normalizarPropositoLote } = require('../config/lotes');

const detalleRacionSchema = new Schema({
    alimento: { type: Schema.Types.ObjectId, ref: 'Alimento', required: true },
    cantidad: { type: Number, min: 0 },
    unidad: { type: String, enum: ['KG', 'TONELADA', 'SACO', 'PACA', 'BALDE', 'CARRETA', 'OTRA'], required: true },
    presentacion: { type: Schema.Types.ObjectId },
    baseCalculo: { type: String, enum: ['POR_ANIMAL_DIA', 'POR_LOTE_DIA', 'LIBRE_ACCESO', 'OTRO'], required: true },
    observaciones: { type: String, trim: true }
}, { _id: true });

const racionSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    especie: { type: String, enum: ESPECIES_LOTE, required: true },
    proposito: { type: String, enum: PROPOSITOS_LOTE, required: true, set: (valor) => normalizarPropositoLote(valor) || valor },
    etapa: { type: String, enum: ETAPAS_ALIMENTACION, required: true },
    planAlimentacion: { type: Schema.Types.ObjectId, ref: 'PlanAlimentacion', default: null },
    detalles: { type: [detalleRacionSchema], default: [] },
    activo: { type: Boolean, default: true },
    observaciones: { type: String, trim: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

racionSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
racionSchema.index({ organizacionId: 1, fincaId: 1, especie: 1, proposito: 1, activo: 1 });
racionSchema.index({ organizacionId: 1, fincaId: 1, planAlimentacion: 1, activo: 1 });

module.exports = model('Racion', racionSchema);
