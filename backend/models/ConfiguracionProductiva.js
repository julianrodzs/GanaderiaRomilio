const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const metaSchema = new Schema({
    gmdFase1KgDia: { type: Number, min: 0.001, default: 0.300 },
    gmdFase2KgDia: { type: Number, min: 0.001, default: 0.400 },
    gmdFase3KgDia: { type: Number, min: 0.001, default: 0.550 },
    gmdDesarrolloKgDia: { type: Number, min: 0.001, default: 0.750 },
    gmdEngordeKgDia: { type: Number, min: 0.001, default: 0.850 },
    pesoObjetivoEngordeKg: { type: Number, min: 0.01, default: 110 }
}, { _id: false });

const bovinosEngordeSchema = new Schema({
    gmdObjetivoKgDia: { type: Number, min: 0.001, default: 0.90 },
    pesoObjetivoKg: { type: Number, min: 0.01, default: 500 }
}, { _id: false });

const porcinosCriaSchema = new Schema({
    nacidosVivosObjetivoCamada: { type: Number, min: 0.01, default: 12 },
    destetadosObjetivoCamada: { type: Number, min: 0.01, default: 11 },
    supervivenciaPredesteteObjetivoPct: { type: Number, min: 0.01, max: 100, default: 90 }
}, { _id: false });

const configuracionProductivaSchema = new Schema({
    clave: { type: String, default: 'principal', trim: true },
    porcinos: { type: metaSchema, default: () => ({}) },
    porcinosCria: { type: porcinosCriaSchema, default: () => ({}) },
    bovinosEngorde: { type: bovinosEngordeSchema, default: () => ({}) },
    diasPesajeReciente: { type: Number, min: 1, default: 60 },
    actualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

configuracionProductivaSchema.plugin(aplicarAislamientoOrganizacion);
configuracionProductivaSchema.index({ organizacionId: 1, clave: 1 }, { unique: true });

module.exports = model('ConfiguracionProductiva', configuracionProductivaSchema);
