const { Schema, model } = require('mongoose');

const rateLimitSeguridadSchema = new Schema({
    clave: { type: String, required: true, unique: true, index: true },
    intentos: { type: Number, required: true, default: 0 },
    ventanaHasta: { type: Date, required: true },
    expiraEn: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = model('RateLimitSeguridad', rateLimitSeguridadSchema);
