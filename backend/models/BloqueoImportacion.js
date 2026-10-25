const { Schema, model } = require('mongoose');

const bloqueoImportacionSchema = new Schema({
    organizacionId: { type: Schema.Types.ObjectId, ref: 'Organizacion', required: true, unique: true },
    token: { type: String, required: true },
    operacion: { type: String, enum: ['Vista previa', 'Confirmacion'], required: true },
    expiraEn: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

module.exports = model('BloqueoImportacion', bloqueoImportacionSchema);
