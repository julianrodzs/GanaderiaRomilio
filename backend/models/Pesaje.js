const { Schema, model } = require('mongoose');

const pesajeSchema = new Schema(
    {
        animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
        fecha: { type: Date, required: true, default: Date.now },
        peso: { type: Number, required: true, min: 0.01 },
        aumentoKg: { type: Number },
        diasDesdeUltimoPesaje: { type: Number, min: 0 },
        observaciones: { type: String, trim: true },
        registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
    },
    {
        timestamps: true
    }
);

module.exports = model('Pesaje', pesajeSchema);
