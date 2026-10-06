const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const diagnosticoGestacionIATFSchema = new Schema({
    animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
    campanaIATF: { type: Schema.Types.ObjectId, ref: 'CampanaIATF', required: true },
    fecha: { type: Date, required: true },
    metodo: { type: String, enum: ['ECOGRAFIA', 'PALPACION', 'PAG', 'OTRO'], required: true },
    resultado: { type: String, enum: ['PREÑADA', 'VACIA', 'DUDOSA', 'REQUIERE_RECONFIRMACION'], required: true },
    responsable: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    observaciones: { type: String, trim: true },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

diagnosticoGestacionIATFSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
diagnosticoGestacionIATFSchema.index({ campanaIATF: 1, animal: 1, fecha: -1 });

module.exports = model('DiagnosticoGestacionIATF', diagnosticoGestacionIATFSchema);
