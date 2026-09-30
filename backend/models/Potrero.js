const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const potreroSchema = new Schema(
    {
        codigo: { type: String, required: true, trim: true },
        nombre: { type: String, required: true, trim: true },
        tipoArea: { type: String, enum: ['PASTOREO', 'BANCO_FORRAJERO'], default: 'PASTOREO', index: true },
        area: { type: Number, min: 0 },
        capacidadMaxima: { type: Number, min: 0 },
        ubicacion: { type: String, trim: true },
        ultimaAplicacionHerbicida: { type: Date },
        ultimaChapia: { type: Date },
        ultimaFertilizacion: { type: Date },
        estado: {
            type: String,
            enum: ['Disponible', 'Ocupado', 'Descanso', 'Mantenimiento'],
            default: 'Disponible'
        },
        observaciones: { type: String, trim: true },
        pastoPrincipal: { type: Schema.Types.ObjectId, ref: 'CatalogoPasto', default: null },
        pastosSecundarios: [{ type: Schema.Types.ObjectId, ref: 'CatalogoPasto' }],
        leguminosasAsociadas: [{ type: Schema.Types.ObjectId, ref: 'CatalogoPasto' }],
        porcentajesCobertura: [{
            catalogoPasto: { type: Schema.Types.ObjectId, ref: 'CatalogoPasto', required: true },
            porcentajeEstimado: { type: Number, min: 0, max: 100 }
        }],
        fechaEstablecimientoPasto: { type: Date },
        diasDescansoObjetivo: { type: Number, min: 0 },
        intervaloCorteObjetivoDias: { type: Number, min: 1 },
        responsableCorte: { type: Schema.Types.ObjectId, ref: 'Usuario' },
        observacionCobertura: { type: String, trim: true },
        descripcionCobertura: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

potreroSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
potreroSchema.index({ organizacionId: 1, fincaId: 1, codigo: 1 }, { unique: true });
potreroSchema.index({ estado: 1 });
potreroSchema.index({ organizacionId: 1, fincaId: 1, tipoArea: 1, estado: 1 });

module.exports = model('Potrero', potreroSchema);
