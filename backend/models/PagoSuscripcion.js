const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const schema = new Schema({
    plan: { type: String, enum: ['ESENCIAL', 'GESTION', 'PRO', 'PREMIUM'], required: true, immutable: true },
    metodoPago: { type: String, enum: ['SINPE_MOVIL', 'TRANSFERENCIA_IBAN', 'EFECTIVO', 'TARJETA_MANUAL', 'STRIPE', 'OTRO'], required: true, immutable: true },
    moneda: { type: String, enum: ['CRC', 'USD'], required: true, immutable: true },
    monto: { type: Number, required: true, min: 0.01, immutable: true },
    referenciaComprobante: { type: String, trim: true, maxlength: 200, immutable: true },
    mesesCubiertos: { type: Number, min: 1, max: 120, immutable: true },
    periodoCubiertoInicio: { type: Date, required: true, immutable: true },
    periodoCubiertoFin: { type: Date, required: true, immutable: true },
    fechaPago: { type: Date, default: Date.now, immutable: true },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, immutable: true },
    notas: { type: String, trim: true, maxlength: 2000, immutable: true },
    estado: { type: String, enum: ['REGISTRADO', 'ANULADO'], default: 'REGISTRADO' },
    motivoAnulacion: { type: String, maxlength: 2000 }, fechaAnulacion: Date,
    anuladoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    claveIdempotencia: { type: String, required: true, immutable: true },
    solicitudHash: { type: String, required: true, immutable: true, select: false },
    estadoPrevio: { type: Schema.Types.Mixed, required: true, immutable: true, select: false },
    revisionAplicada: { type: Number, required: true, immutable: true }
}, { timestamps: true });
schema.plugin(aplicarAislamientoOrganizacion);
schema.index({ organizacionId: 1, fechaPago: -1 });
schema.index({ organizacionId: 1, claveIdempotencia: 1 }, { unique: true });
schema.index({ organizacionId: 1, metodoPago: 1, referenciaComprobante: 1 }, { unique: true,
    partialFilterExpression: { referenciaComprobante: { $type: 'string' }, estado: 'REGISTRADO', metodoPago: { $in: ['SINPE_MOVIL', 'TRANSFERENCIA_IBAN'] } } });
schema.pre('save', function proteger(next) {
    if (!this.isNew && this.modifiedPaths().some((p) => !['estado', 'motivoAnulacion', 'fechaAnulacion', 'anuladoPor', 'updatedAt'].includes(p))) return next(new Error('El historial de pagos es inmutable.'));
    if (!this.isNew && !this.$locals.anularPago) return next(new Error('Solo se permite anular desde el flujo autorizado.'));
    next();
});
for (const metodo of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(metodo, function impedir(next) { next(new Error('El historial de pagos no admite edición ni eliminación.')); });
}
module.exports = model('PagoSuscripcion', schema);
