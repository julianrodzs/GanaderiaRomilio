const { Schema, model } = require('mongoose');

const bloqueoSeguridadSchema = new Schema({
    clave: { type: String, required: true, unique: true, index: true },
    token: { type: String, required: true },
    expiraEn: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = model('BloqueoSeguridad', bloqueoSeguridadSchema);
