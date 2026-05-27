const { Schema, model } = require('mongoose');

const costoSchema = new Schema(
    {
        fecha: { type: Date, default: Date.now },
        categoria: { type: String, required: true, trim: true },
        descripcion: { type: String, required: true, trim: true },
        monto: { type: Number, required: true, min: 0 },
        proveedor: { type: String, trim: true },
        comprobante: { type: String, trim: true },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

module.exports = model('Costo', costoSchema);
