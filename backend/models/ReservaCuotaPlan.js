const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const reservaSchema = new Schema({
    token: { type: String, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    expiraEn: { type: Date, required: true }
}, { _id: false });

const reservaCuotaPlanSchema = new Schema({
    recurso: { type: String, enum: ['animales', 'usuarios', 'fincas'], required: true },
    reservas: { type: [reservaSchema], default: [] }
}, { timestamps: true });

reservaCuotaPlanSchema.plugin(aplicarAislamientoOrganizacion);
reservaCuotaPlanSchema.index({ organizacionId: 1, recurso: 1 }, { unique: true });

module.exports = model('ReservaCuotaPlan', reservaCuotaPlanSchema);
