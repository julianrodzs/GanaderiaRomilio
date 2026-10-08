const { Schema, model } = require('mongoose');
const { ESPECIES_PRODUCTIVAS, OBJETIVOS_PRODUCTIVOS } = require('../config/lineasProductivas');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const lineaProductivaSchema = new Schema({
    especie: { type: String, enum: ESPECIES_PRODUCTIVAS, required: true },
    objetivos: [{ type: String, enum: OBJETIVOS_PRODUCTIVOS }],
    activa: { type: Boolean, default: true }
}, { _id: false });

const fincaSchema = new Schema(
    {
        nombre: { type: String, required: true, trim: true },
        codigo: { type: String, required: true, trim: true, uppercase: true },
        descripcion: { type: String, trim: true },
        ubicacion: { type: String, trim: true },
        lineasProductivas: { type: [lineaProductivaSchema], default: [] },
        configuracionReproductiva: {
            diasGestacionBovinaGeneral: { type: Number, min: 1, default: 283 }
        },
        imagenes: {
            dashboard: { type: Schema.Types.ObjectId, ref: 'ArchivoMultimedia', default: null },
            potreros: { type: Schema.Types.ObjectId, ref: 'ArchivoMultimedia', default: null }
        },
        estado: {
            type: String,
            enum: ['Activa', 'Inactiva'],
            default: 'Activa'
        }
    },
    { timestamps: true }
);

fincaSchema.path('lineasProductivas').validate((lineas) => {
    const especies = (lineas || []).map((linea) => linea.especie);
    return especies.length === new Set(especies).size;
}, 'No se puede repetir una especie en las líneas productivas de la finca.');

fincaSchema.plugin(aplicarAislamientoOrganizacion);
fincaSchema.index({ organizacionId: 1, codigo: 1 }, { unique: true });
fincaSchema.index({ organizacionId: 1, estado: 1, nombre: 1 });

module.exports = model('Finca', fincaSchema);
