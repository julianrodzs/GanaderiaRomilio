const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const pertenenciaLoteSchema = new Schema({
    animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
    lote: { type: Schema.Types.ObjectId, ref: 'Lote', required: true },
    fechaEntrada: { type: Date, required: true, default: Date.now },
    fechaSalida: { type: Date },
    motivoEntrada: { type: String, trim: true },
    motivoSalida: { type: String, trim: true },
    activo: { type: Boolean, default: true },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

pertenenciaLoteSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
pertenenciaLoteSchema.index({ organizacionId: 1, fincaId: 1, lote: 1, activo: 1 });
pertenenciaLoteSchema.index({ organizacionId: 1, fincaId: 1, animal: 1, fechaEntrada: -1 });
pertenenciaLoteSchema.index(
    { organizacionId: 1, fincaId: 1, animal: 1 },
    { unique: true, partialFilterExpression: { activo: true } }
);

module.exports = model('PertenenciaLote', pertenenciaLoteSchema);
