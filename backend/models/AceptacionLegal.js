const { Schema, model } = require('mongoose');
const { createHash } = require('node:crypto');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const schema = new Schema({
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    rolEnMomento: { type: String, required: true },
    contexto: { type: String, enum: ['ACTIVACION_ORGANIZACION', 'ACEPTACION_INVITACION_COLABORADOR', 'PANEL_CUENTA', 'ACTUALIZACION_CONSENTIMIENTO'], required: true },
    tipoAceptacion: { type: String, enum: ['TERMINOS_Y_SUSCRIPCION_ORG', 'REGLAS_USO_COLABORADOR', 'CONSENTIMIENTO_PRIVACIDAD_LEY8968', 'COMUNICACIONES_OPCIONALES'], required: true },
    otorgado: { type: Boolean, required: true },
    documentoSlug: { type: String, enum: ['terminos', 'privacidad', 'suscripciones', 'soporte'], required: true },
    versionDocumento: { type: String, required: true },
    estadoDocumento: { type: String, enum: ['BORRADOR_PRUEBA', 'VIGENTE'], required: true },
    hashTexto: { type: String, required: true },
    copiaTextoExacto: { type: String, required: true },
    declaracion: { type: String, required: true },
    fechaAceptacion: { type: Date, default: Date.now, required: true },
    ip: { type: String, maxlength: 128 },
    userAgent: { type: String, maxlength: 1000 },
    claveSolicitud: { type: String, required: true, select: false },
    solicitudHash: { type: String, required: true, select: false }
}, { versionKey: false });
schema.plugin(aplicarAislamientoOrganizacion);
schema.index({ organizacionId: 1, usuarioId: 1, fechaAceptacion: -1 });
schema.index({ organizacionId: 1, usuarioId: 1, claveSolicitud: 1, tipoAceptacion: 1, documentoSlug: 1 }, { unique: true });
schema.pre('validate', function comprobarTexto(next) {
    if (createHash('sha256').update(this.copiaTextoExacto || '', 'utf8').digest('hex') !== this.hashTexto) return next(new Error('La copia legal no coincide con su hash.'));
    next();
});
schema.pre('save', function impedirEdicion(next) { next(this.isNew ? undefined : new Error('La evidencia legal es inmutable.')); });
for (const operacion of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite']) {
    schema.pre(operacion, function impedir(next) { next(new Error('La evidencia legal no admite edición ni eliminación.')); });
}
schema.pre('deleteOne', { document: true, query: false }, function impedir(next) { next(new Error('La evidencia legal es inmutable.')); });
module.exports = model('AceptacionLegal', schema);
