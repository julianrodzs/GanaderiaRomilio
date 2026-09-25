const { Schema, model } = require('mongoose');

const importacionExcelSchema = new Schema(
    {
        archivo: { type: String, trim: true },
        versionPlantilla: { type: String, trim: true },
        hashArchivo: { type: String, trim: true, index: true },
        estado: {
            type: String,
            enum: ['Pendiente', 'Con errores', 'Confirmada', 'Confirmada con errores'],
            default: 'Pendiente',
            index: true
        },
        modo: {
            type: String,
            enum: ['crear_actualizar', 'solo_crear'],
            default: 'crear_actualizar'
        },
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
        registros: Schema.Types.Mixed,
        resultado: Schema.Types.Mixed,
        errores: Schema.Types.Mixed,
        advertencias: [
            {
                hoja: String,
                mensaje: String
            }
        ],
        usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', index: true },
        confirmadaAt: Date
    },
    {
        timestamps: true
    }
);

module.exports = model('ImportacionExcel', importacionExcelSchema);
