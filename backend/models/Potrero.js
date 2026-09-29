const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const potreroSchema = new Schema(
    {
        codigo: { type: String, required: true, trim: true },
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

potreroSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
potreroSchema.index({ organizacionId: 1, fincaId: 1, codigo: 1 }, { unique: true });
potreroSchema.index({ estado: 1 });

module.exports = model('Potrero', potreroSchema);
