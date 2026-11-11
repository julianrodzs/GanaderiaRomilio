const { Schema, model } = require('mongoose');

// Infraestructura global: todas las organizaciones comparten la cuenta del proveedor.
const esquema = new Schema({
    _id: { type: String, required: true },
    disponibleDesde: { type: Date, required: true }
}, { versionKey: false });

module.exports = model('LimiteProveedorCorreo', esquema);
