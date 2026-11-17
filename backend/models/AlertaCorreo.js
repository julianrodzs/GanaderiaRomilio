const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const { DIAS_ALERTAS_CORREO } = require('../services/retencionDatos-service');

const alertaCorreoSchema = new Schema(
    {
        clave: { type: String, required: true, trim: true },
        tipo: { type: String, required: true, trim: true },
        referenciaModelo: { type: String, required: true, trim: true },
        referenciaId: { type: Schema.Types.ObjectId, required: true },
        fechaObjetivoKey: { type: String, trim: true },
        ultimoEnvio: { type: Date },
        vecesEnviada: { type: Number, default: 0 }
    },
    {
        timestamps: true
    }
);

alertaCorreoSchema.plugin(aplicarAislamientoOrganizacion);
alertaCorreoSchema.index({ organizacionId: 1, clave: 1 }, { unique: true });
// Los avisos que siguen enviandose conservan su ventana de idempotencia.
alertaCorreoSchema.index({ updatedAt: 1 }, { expireAfterSeconds: DIAS_ALERTAS_CORREO * 86400 });

module.exports = model('AlertaCorreo', alertaCorreoSchema);
