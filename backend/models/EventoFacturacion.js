const { Schema, model } = require('mongoose');

const eventoFacturacionSchema = new Schema({
    proveedor: { type: String, enum: ['Stripe'], required: true },
    eventoId: { type: String, required: true, trim: true },
    tipo: { type: String, required: true, trim: true },
    organizacionId: { type: Schema.Types.ObjectId, ref: 'Organizacion' },
    estado: { type: String, enum: ['Procesando', 'Procesado', 'Error', 'Ignorado'], default: 'Procesando' },
    intentos: { type: Number, default: 1 },
    procesadoEn: { type: Date },
    error: { type: String, default: '' }
}, { timestamps: true });

eventoFacturacionSchema.index({ proveedor: 1, eventoId: 1 }, { unique: true });

module.exports = model('EventoFacturacion', eventoFacturacionSchema);
