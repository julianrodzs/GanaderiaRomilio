const { Schema, model } = require('mongoose');

const alertaCorreoSchema = new Schema(
    {
        clave: { type: String, required: true, unique: true, trim: true },
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

module.exports = model('AlertaCorreo', alertaCorreoSchema);
