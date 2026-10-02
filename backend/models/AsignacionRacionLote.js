const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const schema = new Schema({
    lote: { type: Schema.Types.ObjectId, ref: 'Lote', required: true },
    racion: { type: Schema.Types.ObjectId, ref: 'Racion', required: true },
    fechaInicio: { type: Date, required: true, default: Date.now },
    fechaFin: { type: Date, default: null },
    activo: { type: Boolean, default: true },
    asignadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    observaciones: { type: String, trim: true }
}, { timestamps: true });

schema.plugin(aplicarAislamientoOrganizacion, { finca: true });
schema.index({ organizacionId: 1, fincaId: 1, lote: 1, fechaInicio: -1 });
schema.index({ organizacionId: 1, fincaId: 1, racion: 1, activo: 1 });
schema.index({ organizacionId: 1, fincaId: 1, lote: 1 }, { unique: true, partialFilterExpression: { activo: true } });

module.exports = model('AsignacionRacionLote', schema);
