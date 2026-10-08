const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const archivoMultimediaSchema = new Schema(
    {
        fincaId: { type: Schema.Types.ObjectId, ref: 'Finca', default: null, index: true },
        animalId: { type: Schema.Types.ObjectId, ref: 'Animal', default: null, index: true },
        uso: {
            type: String,
            enum: ['LOGO_ORGANIZACION', 'DASHBOARD_FINCA', 'POTREROS_FINCA', 'FOTO_ANIMAL'],
            required: true,
            index: true
        },
        proveedor: { type: String, enum: ['R2'], default: 'R2', required: true },
        clave: { type: String, required: true, trim: true, unique: true },
        url: { type: String, required: true, trim: true },
        nombreOriginal: { type: String, required: true, trim: true },
        mimeType: { type: String, required: true, trim: true },
        tamanoBytes: { type: Number, required: true, min: 1 },
        creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
        activo: { type: Boolean, default: true, index: true }
    },
    { timestamps: true }
);

archivoMultimediaSchema.plugin(aplicarAislamientoOrganizacion);
archivoMultimediaSchema.index({ organizacionId: 1, fincaId: 1, uso: 1, activo: 1 });

module.exports = model('ArchivoMultimedia', archivoMultimediaSchema);
