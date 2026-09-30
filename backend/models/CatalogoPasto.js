const { Schema, model } = require('mongoose');

const catalogoPastoSchema = new Schema({
    clave: { type: String, required: true, unique: true, trim: true, lowercase: true },
    nombre: { type: String, required: true, trim: true },
    nombreCientifico: { type: String, trim: true },
    especieBase: { type: String, trim: true },
    cultivar: { type: String, trim: true },
    categoria: { type: String, enum: ['Pasto', 'Pasto de corte', 'Leguminosa/Forraje'], required: true, index: true },
    usosPermitidos: [{ type: String, enum: ['PASTOREO', 'CORTE', 'ENSILAJE'] }],
    aliases: [{ type: String, trim: true }],
    orden: { type: Number, default: 0 },
    activo: { type: Boolean, default: true, index: true }
}, { timestamps: true });

catalogoPastoSchema.index({ categoria: 1, activo: 1, orden: 1, nombre: 1 });

module.exports = model('CatalogoPasto', catalogoPastoSchema);
