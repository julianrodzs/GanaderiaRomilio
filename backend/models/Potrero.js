const { Schema, model } = require('mongoose');

const potreroSchema = new Schema(
    {
        codigo: { type: String, required: true, unique: true, trim: true },
        nombre: { type: String, required: true, trim: true },
        area: { type: Number, min: 0 },
        capacidadMaxima: { type: Number, min: 0 },
        ubicacion: { type: String, trim: true },
        ultimaAplicacionHerbicida: { type: Date },
        ultimaChapia: { type: Date },
        ultimaFertilizacion: { type: Date },
        estado: {
            type: String,
            enum: ['Disponible', 'Ocupado', 'Descanso', 'Mantenimiento'],
            default: 'Disponible'
        },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

module.exports = model('Potrero', potreroSchema);
