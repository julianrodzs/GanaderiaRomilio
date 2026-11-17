const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const { despuesDeDias, DIAS_PURGA_PREVIEW, ESTADOS_IMPORTACION_TEMPORAL } = require('../services/retencionDatos-service');

const importacionExcelSchema = new Schema(
    {
        archivo: { type: String, trim: true },
        versionPlantilla: { type: String, trim: true },
        hashArchivo: { type: String, trim: true, index: true },
        estado: {
            type: String,
            enum: ['Pendiente', 'Con errores', 'Procesando', 'Aplicada', 'Fallida', 'Expirada', 'Confirmada', 'Confirmada con errores'],
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
        confirmadaAt: Date,
        iniciadoEn: Date,
        finalizadoEn: Date,
        expiraEn: { type: Date, index: true },
        purgarEn: { type: Date, select: false },
        errorFinal: Schema.Types.Mixed
    },
    {
        timestamps: true
    }
);

importacionExcelSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
importacionExcelSchema.pre('validate', function () {
    if (this.expiraEn && ESTADOS_IMPORTACION_TEMPORAL.includes(this.estado)) {
        this.purgarEn = despuesDeDias(this.expiraEn, DIAS_PURGA_PREVIEW);
    }
});
importacionExcelSchema.index({ purgarEn: 1 }, {
    expireAfterSeconds: 0, partialFilterExpression: { estado: { $in: ESTADOS_IMPORTACION_TEMPORAL } }
});
importacionExcelSchema.index({ organizacionId: 1, fincaId: 1, hashArchivo: 1 });

module.exports = model('ImportacionExcel', importacionExcelSchema);
