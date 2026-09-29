const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const usoPlanSchema = new Schema(
    {
        periodo: {
            type: String,
            required: true,
            match: /^\d{4}-(0[1-9]|1[0-2])$/
        },
        conteosDrone: { type: Number, default: 0, min: 0 },
        conteosDroneReservados: { type: Number, default: 0, min: 0 },
        referenciasConteoDrone: [{ type: Schema.Types.ObjectId, ref: 'ConteoDrone' }],
        emailsOperativos: { type: Number, default: 0, min: 0 },
        otrosUsos: { type: Schema.Types.Mixed, default: {} }
    },
    { timestamps: true }
);

usoPlanSchema.plugin(aplicarAislamientoOrganizacion);
usoPlanSchema.index({ organizacionId: 1, periodo: 1 }, { unique: true });

module.exports = model('UsoPlan', usoPlanSchema);
