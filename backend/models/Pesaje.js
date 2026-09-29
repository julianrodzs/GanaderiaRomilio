const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const pesajeSchema = new Schema(
    {
        animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
        fecha: { type: Date, required: true, default: Date.now },
        peso: { type: Number, required: true, min: 0.01 },
        etapaProductiva: {
            type: String,
            enum: ['Fase 1', 'Fase 2', 'Fase 3', 'Desarrollo', 'Engorde'],
            trim: true
        },
        aumentoKg: { type: Number },
        diasDesdeUltimoPesaje: { type: Number, min: 0 },
        observaciones: { type: String, trim: true },
        registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
    },
    {
        timestamps: true
    }
);

pesajeSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
pesajeSchema.index({ animal: 1, fecha: -1 });

module.exports = model('Pesaje', pesajeSchema);
