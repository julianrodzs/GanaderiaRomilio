const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const eventoCampanaIATFSchema = new Schema({
    campana: { type: Schema.Types.ObjectId, ref: 'CampanaIATF', required: true },
    tipo: { type: String, enum: ['CREADA', 'PASO_EJECUTADO', 'REPROGRAMADA', 'INSEMINACION', 'DIAGNOSTICO', 'FINALIZADA', 'CANCELADA', 'ANIMAL_RETIRADO'], required: true },
    fecha: { type: Date, default: Date.now },
    descripcion: { type: String, trim: true },
    datos: { type: Schema.Types.Mixed },
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

eventoCampanaIATFSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
eventoCampanaIATFSchema.index({ campana: 1, fecha: -1 });

module.exports = model('EventoCampanaIATF', eventoCampanaIATFSchema);
