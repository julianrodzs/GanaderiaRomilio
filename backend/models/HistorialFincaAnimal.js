const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const historialFincaAnimalSchema = new Schema({
    animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
    tipo: { type: String, enum: ['Ingreso inicial', 'Traslado'], required: true },
    fincaOrigen: { type: Schema.Types.ObjectId, ref: 'Finca' },
    fincaDestino: { type: Schema.Types.ObjectId, ref: 'Finca', required: true },
    fecha: { type: Date, required: true },
    pesoTraslado: { type: Number, min: 0 },
    motivo: { type: String, trim: true },
    traslado: { type: Schema.Types.ObjectId, ref: 'TrasladoFinca' },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

historialFincaAnimalSchema.plugin(aplicarAislamientoOrganizacion);
historialFincaAnimalSchema.index({ organizacionId: 1, animal: 1, fecha: 1 });
historialFincaAnimalSchema.index({ organizacionId: 1, fincaDestino: 1, fecha: -1 });

module.exports = model('HistorialFincaAnimal', historialFincaAnimalSchema);
