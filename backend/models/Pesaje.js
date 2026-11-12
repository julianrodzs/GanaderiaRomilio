const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const { TIPOS_PESAJE, ORIGENES_PESAJE } = require('../config/tiposPesaje');

const pesajeSchema = new Schema(
    {
        animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
        lote: { type: Schema.Types.ObjectId, ref: 'Lote', default: null },
        fecha: { type: Date, required: true, default: Date.now },
        peso: { type: Number, required: true, min: 0.01 },
        tipoPesaje: { type: String, enum: TIPOS_PESAJE, default: 'REGULAR' },
        origenPesaje: { type: String, enum: ORIGENES_PESAJE, default: 'Individual' },
        etapaProductiva: {
            type: String,
            enum: ['Fase 1', 'Fase 2', 'Fase 3', 'Desarrollo', 'Engorde'],
            trim: true
        },
        aumentoKg: { type: Number },
        diasDesdeUltimoPesaje: { type: Number, min: 0 },
        observaciones: { type: String, trim: true },
        registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
        editadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
        fechaEdicion: { type: Date },
        claveImportacion: { type: String, trim: true },
        importacionOrigen: { type: Schema.Types.ObjectId, ref: 'ImportacionExcel' }
    },
    {
        timestamps: true
    }
);

pesajeSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
pesajeSchema.pre('init', function compatibilidadTipoAnterior(datos) {
    if (ORIGENES_PESAJE.includes(datos.tipoPesaje)) {
        datos.origenPesaje ||= datos.tipoPesaje;
        datos.tipoPesaje = 'REGULAR';
    }
});
pesajeSchema.index({ organizacionId: 1, fincaId: 1, tipoPesaje: 1, fecha: -1 });
pesajeSchema.index({ organizacionId: 1, animal: 1, tipoPesaje: 1 }, {
    unique: true, partialFilterExpression: { tipoPesaje: { $in: ['DESTETE', 'NACIMIENTO'] } }
});
pesajeSchema.index({ animal: 1, fecha: -1 });
pesajeSchema.index({ organizacionId: 1, animal: 1, fecha: -1, createdAt: -1 });
pesajeSchema.index(
    { organizacionId: 1, fincaId: 1, claveImportacion: 1 },
    { unique: true, partialFilterExpression: { claveImportacion: { $type: 'string' } } }
);

module.exports = model('Pesaje', pesajeSchema);
