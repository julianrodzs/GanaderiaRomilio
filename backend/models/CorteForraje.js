const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const corteForrajeSchema = new Schema({
    potrero: { type: Schema.Types.ObjectId, ref: 'Potrero', required: true, index: true },
    fechaCorte: { type: Date, required: true, index: true },
    forraje: { type: Schema.Types.ObjectId, ref: 'CatalogoPasto', required: true, index: true },
    forrajeNombre: { type: String, required: true, trim: true },
    especieBase: { type: String, trim: true },
    cultivar: { type: String, trim: true },
    areaCortadaHa: { type: Number, min: 0 },
    cantidadForrajeVerdeKg: { type: Number, required: true, min: 0 },
    porcentajeMateriaSeca: { type: Number, min: 0, max: 100 },
    cantidadMateriaSecaKg: { type: Number, min: 0 },
    destino: {
        tipo: {
            type: String,
            enum: ['FINCA_GENERAL', 'BOVINOS', 'PORCINOS', 'ENGORDE_BOVINO', 'ENGORDE_PORCINO', 'LOTE', 'ANIMAL', 'OTRO'],
            default: 'FINCA_GENERAL'
        },
        referenciaId: { type: Schema.Types.ObjectId },
        descripcion: { type: String, trim: true }
    },
    responsable: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    observaciones: { type: String, trim: true },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true }
}, { timestamps: true });

corteForrajeSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
corteForrajeSchema.index({ organizacionId: 1, fincaId: 1, potrero: 1, fechaCorte: -1 });
corteForrajeSchema.index({ organizacionId: 1, fincaId: 1, forraje: 1, fechaCorte: -1 });

module.exports = model('CorteForraje', corteForrajeSchema);
