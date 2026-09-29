const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const registroSanitarioSchema = new Schema(
    {
        animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
        fecha: { type: Date, default: Date.now },
        tipo: { type: String, required: true, trim: true },
        producto: { type: String, trim: true },
        dosis: { type: String, trim: true },
        viaAplicacion: { type: String, trim: true },
        responsable: { type: String, trim: true },
        proximaAplicacion: { type: Date },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

registroSanitarioSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });

module.exports = model('RegistroSanitario', registroSanitarioSchema);
