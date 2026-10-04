const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const cierreConsolidadoSchema = new Schema({
    clave: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date, required: true },
    especie: { type: String, enum: ['Todos', 'Bovino', 'Porcino'], default: 'Todos' },
    fincas: [{ type: Schema.Types.ObjectId, ref: 'Finca', required: true }],
    datos: { type: Schema.Types.Mixed, required: true },
    cerradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    estado: { type: String, enum: ['Cerrado'], default: 'Cerrado' }
}, { timestamps: true });

cierreConsolidadoSchema.plugin(aplicarAislamientoOrganizacion);
cierreConsolidadoSchema.index({ organizacionId: 1, clave: 1 }, { unique: true });
cierreConsolidadoSchema.index({ organizacionId: 1, fechaFin: -1 });

module.exports = model('CierreConsolidado', cierreConsolidadoSchema);
