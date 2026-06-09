const { Schema, model } = require('mongoose');

const importacionExcelSchema = new Schema(
    {
        archivo: { type: String, trim: true },
        modulosSolicitados: [{ type: String, trim: true }],
        hojasDetectadas: [
            {
                nombre: String,
                rango: String,
                reconocida: Boolean,
                modulo: String,
                registrosDetectados: Schema.Types.Mixed
            }
        ],
        resumenDetectado: Schema.Types.Mixed,
        resultado: Schema.Types.Mixed,
        advertencias: [
            {
                hoja: String,
                mensaje: String
            }
        ],
        usuario: { type: Schema.Types.ObjectId, ref: 'Usuario' }
    },
    {
        timestamps: true
    }
);

module.exports = model('ImportacionExcel', importacionExcelSchema);
