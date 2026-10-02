const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const asignacionSchema = new Schema({
    plan: { type: Schema.Types.ObjectId, ref: 'PlanAlimentacion', required: true },
    lote: { type: Schema.Types.ObjectId, ref: 'Lote', required: true },
    fechaInicio: { type: Date, required: true, default: Date.now },
    fechaFin: { type: Date },
    activo: { type: Boolean, default: true },
    observaciones: { type: String, trim: true },
    asignadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

asignacionSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
asignacionSchema.index({ organizacionId: 1, fincaId: 1, plan: 1, activo: 1 });
asignacionSchema.index({ organizacionId: 1, fincaId: 1, lote: 1, fechaInicio: -1 });
asignacionSchema.index(
    { organizacionId: 1, fincaId: 1, lote: 1 },
    { unique: true, partialFilterExpression: { activo: true } }
);

module.exports = model('AsignacionPlanAlimentacion', asignacionSchema);
