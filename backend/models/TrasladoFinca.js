const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const itemTrasladoSchema = new Schema({
    animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
    identificador: { type: String, trim: true },
    especie: { type: String, enum: ['Bovino', 'Porcino'], required: true },
    pesoTraslado: { type: Number, min: 0 }
}, { _id: false });

const trasladoFincaSchema = new Schema({
    fincaOrigen: { type: Schema.Types.ObjectId, ref: 'Finca', required: true },
    fincaDestino: { type: Schema.Types.ObjectId, ref: 'Finca', required: true },
    fecha: { type: Date, required: true, default: Date.now },
    animales: { type: [itemTrasladoSchema], required: true },
    motivo: { type: String, required: true, trim: true },
    observaciones: { type: String, trim: true },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    estado: { type: String, enum: ['Completado'], default: 'Completado' }
}, { timestamps: true });

trasladoFincaSchema.plugin(aplicarAislamientoOrganizacion);
trasladoFincaSchema.index({ organizacionId: 1, fecha: -1 });
trasladoFincaSchema.index({ organizacionId: 1, fincaOrigen: 1, fincaDestino: 1, fecha: -1 });
trasladoFincaSchema.index({ organizacionId: 1, 'animales.animal': 1, fecha: -1 });

module.exports = model('TrasladoFinca', trasladoFincaSchema);
