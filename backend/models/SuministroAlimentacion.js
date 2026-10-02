const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const detalleSchema = new Schema({
    alimento: { type: Schema.Types.ObjectId, ref: 'Alimento', required: true },
    alimentoNombreSnapshot: { type: String, required: true, trim: true },
    cantidadIngresada: { type: Number, required: true, min: 0 },
    unidadIngresada: { type: String, enum: ['KG', 'TONELADA', 'SACO', 'PACA', 'BALDE', 'CARRETA', 'OTRA'], required: true },
    presentacionId: { type: Schema.Types.ObjectId, default: null },
    presentacionNombreSnapshot: { type: String, trim: true },
    factorConversionKgSnapshot: { type: Number, min: 0.001 },
    cantidadKg: { type: Number, required: true, min: 0 },
    tipoMedicion: { type: String, enum: ['PESADA', 'POR_PRESENTACION', 'ESTIMADA'], required: true },
    sobranteKg: { type: Number, min: 0, default: null },
    origenTipo: { type: String, enum: ['CORTE_FORRAJE', 'COMPRA', 'OTRO'], default: null },
    origenReferenciaId: { type: Schema.Types.ObjectId, default: null },
    observaciones: { type: String, trim: true }
}, { _id: true });

const schema = new Schema({
    lote: { type: Schema.Types.ObjectId, ref: 'Lote', required: true },
    fechaHora: { type: Date, required: true, default: Date.now },
    planAlimentacion: { type: Schema.Types.ObjectId, ref: 'PlanAlimentacion', default: null },
    planAlimentacionSnapshot: { type: Schema.Types.Mixed, default: null },
    racion: { type: Schema.Types.ObjectId, ref: 'Racion', default: null },
    racionSnapshot: { type: Schema.Types.Mixed, default: null },
    etapaOperativaSnapshot: { type: String, default: null },
    cantidadAnimalesSnapshot: { type: Number, required: true, min: 1 },
    detalles: { type: [detalleSchema], required: true },
    totalKgSuministrados: { type: Number, required: true, min: 0 },
    totalConsumoEstimadoKg: { type: Number, default: null, min: 0 },
    kgSuministradosPorCabeza: { type: Number, required: true, min: 0 },
    consumoEstimadoPorCabeza: { type: Number, default: null, min: 0 },
    responsable: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    observaciones: { type: String, trim: true },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    actualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    motivoCorreccion: { type: String, trim: true },
    historialCorrecciones: [{ fecha: { type: Date, default: Date.now }, usuario: { type: Schema.Types.ObjectId, ref: 'Usuario' }, motivo: String, valorAnterior: Schema.Types.Mixed, valorNuevo: Schema.Types.Mixed }]
}, { timestamps: true, optimisticConcurrency: true });

schema.plugin(aplicarAislamientoOrganizacion, { finca: true });
schema.index({ organizacionId: 1, fincaId: 1, lote: 1, fechaHora: -1 });
schema.index({ organizacionId: 1, fincaId: 1, fechaHora: -1 });
schema.index({ organizacionId: 1, fincaId: 1, registradoPor: 1, fechaHora: -1 });
schema.index({ 'detalles.alimento': 1, fechaHora: -1 });

module.exports = model('SuministroAlimentacion', schema);
