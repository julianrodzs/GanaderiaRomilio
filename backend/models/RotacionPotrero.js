const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const rotacionPotreroSchema = new Schema(
    {
        potrero: { type: Schema.Types.ObjectId, ref: 'Potrero', required: true },
        lote: { type: String, trim: true },
        fechaEntrada: { type: Date, required: true },
        fechaSalida: { type: Date },
        numeroAnimales: { type: Number, min: 0 },
        diasOcupado: { type: Number, min: 0 },
        diasDescansoPrevio: { type: Number, min: 0 },
        estado: {
            type: String,
            enum: ['Activa', 'Finalizada', 'Planificada'],
            default: 'Activa'
        },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

rotacionPotreroSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });

module.exports = model('RotacionPotrero', rotacionPotreroSchema);
