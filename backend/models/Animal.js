const { Schema, model } = require('mongoose');

const animalSchema = new Schema(
    {
        identificadorFinca: { type: String, required: true, unique: true, trim: true },
        diio: { type: String, unique: true, sparse: true, trim: true },
        nombre: { type: String, trim: true },
        sexo: { type: String, enum: ['Macho', 'Hembra'], required: true },
        raza: { type: String, trim: true },
        madreDiio: { type: String, trim: true },
        padreDiio: { type: String, trim: true },
        fechaNacimiento: { type: Date },
        fechaDestete: { type: Date },
        pesoNacimiento: { type: Number, min: 0 },
        pesoDestete: { type: Number, min: 0 },
        pesoActual: { type: Number, min: 0 },
        estado: {
            type: String,
            enum: ['Activo', 'Vendido', 'Muerto', 'En tratamiento'],
            default: 'Activo'
        },
        potreroActual: { type: Schema.Types.ObjectId, ref: 'Potrero' },
        fotoUrl: { type: String, trim: true },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

module.exports = model('Animal', animalSchema);
