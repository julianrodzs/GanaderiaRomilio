const { Schema, model } = require('mongoose');

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
        dedupKey: { type: String, trim: true },
        metadata: { type: Schema.Types.Mixed }
    },
    { timestamps: true }
);

notificacionSchema.index({ destinatario: 1, createdAt: -1 });
notificacionSchema.index({ destinatario: 1, leida: 1, createdAt: -1 });
notificacionSchema.index(
    { destinatario: 1, dedupKey: 1 },
    {
        unique: true,
        partialFilterExpression: { dedupKey: { $type: 'string' } }
    }
);

module.exports = model('Notificacion', notificacionSchema);
