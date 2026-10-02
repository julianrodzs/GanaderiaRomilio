const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const presentacionSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    unidad: { type: String, enum: ['SACO', 'PACA', 'BALDE', 'CARRETA', 'OTRA'], required: true },
    cantidadBaseKg: { type: Number, required: true, min: 0.001 },
    estimada: { type: Boolean, default: false },
    activo: { type: Boolean, default: true }
}, { timestamps: true });

const alimentoSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    nombreNormalizado: { type: String, required: true, trim: true },
    tipo: { type: String, enum: ['FORRAJE', 'CONCENTRADO', 'GRANO', 'SUBPRODUCTO', 'MINERAL', 'SUPLEMENTO', 'OTRO'], required: true },
    catalogoPasto: { type: Schema.Types.ObjectId, ref: 'CatalogoPasto', default: null },
    descripcion: { type: String, trim: true },
    activo: { type: Boolean, default: true },
    presentaciones: { type: [presentacionSchema], default: [] },
    metadataNutricional: { type: Schema.Types.Mixed, default: {} },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

alimentoSchema.pre('validate', function normalizar(next) {
    this.nombreNormalizado = String(this.nombre || '').trim().toLocaleLowerCase('es');
    next();
});
alimentoSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
alimentoSchema.index({ organizacionId: 1, fincaId: 1, nombreNormalizado: 1 }, { unique: true });
alimentoSchema.index({ organizacionId: 1, fincaId: 1, tipo: 1, activo: 1 });

module.exports = model('Alimento', alimentoSchema);
