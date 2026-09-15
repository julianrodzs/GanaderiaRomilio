const { Schema, model } = require('mongoose');

const auditoriaSchema = new Schema(
    {
        usuario: { type: Schema.Types.ObjectId, ref: 'Usuario' },
        usuarioNombre: { type: String, trim: true },
        usuarioCorreo: { type: String, trim: true },
        usuarioRol: { type: String, trim: true },
        accion: { type: String, required: true, trim: true },
        modulo: { type: String, required: true, trim: true },
        metodo: { type: String, required: true, trim: true },
        ruta: { type: String, required: true, trim: true },
        recursoTipo: { type: String, trim: true },
        recursoId: { type: String, trim: true },
        descripcion: { type: String, trim: true },
        datos: { type: Schema.Types.Mixed },
        ip: { type: String, trim: true },
        userAgent: { type: String, trim: true },
        estado: {
            type: String,
            enum: ['Exitoso', 'Fallido', 'Denegado'],
            default: 'Exitoso'
        },
        codigoRespuesta: { type: Number },
        error: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

auditoriaSchema.index({ createdAt: -1 });
auditoriaSchema.index({ usuario: 1, createdAt: -1 });
auditoriaSchema.index({ modulo: 1, createdAt: -1 });
auditoriaSchema.index({ estado: 1, createdAt: -1 });

module.exports = model('Auditoria', auditoriaSchema);
