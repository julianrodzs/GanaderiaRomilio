const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const { despuesDeDias, DIAS_NOTIFICACIONES } = require('../services/retencionDatos-service');

const notificacionSchema = new Schema(
    {
        destinatario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
        actor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
        naturaleza: { type: String, enum: ['Operativa', 'Informativa'], required: true },
        tipo: { type: String, required: true, trim: true },
        titulo: { type: String, required: true, trim: true },
        mensaje: { type: String, required: true, trim: true },
        moduloOrigen: { type: String, trim: true },
        entidadTipo: { type: String, trim: true },
        entidadId: { type: Schema.Types.ObjectId },
        url: { type: String, trim: true },
        leida: { type: Boolean, default: false, index: true },
        fechaLectura: { type: Date, default: null },
        expiraEn: { type: Date, default: null, select: false },
        dedupKey: { type: String, trim: true },
        metadata: { type: Schema.Types.Mixed }
    },
    { timestamps: true }
);

notificacionSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
notificacionSchema.pre('validate', function () {
    if (!this.leida) this.expiraEn = null;
    else if (!this.expiraEn) {
        this.fechaLectura = this.fechaLectura || new Date();
        this.expiraEn = despuesDeDias(this.fechaLectura, DIAS_NOTIFICACIONES);
    }
});
notificacionSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { leida: true } });
notificacionSchema.index({ destinatario: 1, createdAt: -1 });
notificacionSchema.index({ destinatario: 1, leida: 1, createdAt: -1 });
notificacionSchema.index(
    { organizacionId: 1, destinatario: 1, dedupKey: 1 },
    {
        unique: true,
        partialFilterExpression: { dedupKey: { $type: 'string' } }
    }
);

module.exports = model('Notificacion', notificacionSchema);
