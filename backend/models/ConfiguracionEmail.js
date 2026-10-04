const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const configuracionEmailSchema = new Schema({
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    frecuencia: { type: String, enum: ['Desactivado', 'Diario', 'Semanal'], default: 'Desactivado' },
    horaPreferida: { type: String, default: '06:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    diaSemana: { type: Number, min: 0, max: 6, default: 1 },
    modulos: {
        resumenGanadero: { type: Boolean, default: true },
        finanzas: { type: Boolean, default: true },
        tareasPendientes: { type: Boolean, default: true }
    },
    ultimoEnvio: { type: Date, default: null },
    ultimoPeriodo: { type: String, default: '', trim: true }
}, { timestamps: true });

configuracionEmailSchema.plugin(aplicarAislamientoOrganizacion);
configuracionEmailSchema.index({ organizacionId: 1, usuario: 1 }, { unique: true });

module.exports = model('ConfiguracionEmail', configuracionEmailSchema);
