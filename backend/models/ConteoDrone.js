const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const deteccionSchema = new Schema(
    {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        confianza: { type: Number, required: true }
    },
    {
        _id: false
    }
);

const conteoDroneSchema = new Schema(
    {
        potrero: { type: Schema.Types.ObjectId, ref: 'Potrero', required: true },
        fechaVuelo: { type: Date, default: Date.now },
        imagenOriginalUrl: { type: String, required: true, trim: true },
        imagenProcesadaUrl: { type: String, trim: true },
        cantidadDetectada: { type: Number, required: true, min: 0 },
        cantidadEsperada: { type: Number, min: 0 },
        diferencia: { type: Number },
        confianzaPromedio: { type: Number, min: 0, max: 1 },
        detecciones: [deteccionSchema],
        estado: {
            type: String,
            enum: ['Correcto', 'Revisar', 'Pendiente'],
            default: 'Pendiente'
        },
        claveOperacion: { type: String, trim: true },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

conteoDroneSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
conteoDroneSchema.index({ potrero: 1, fechaVuelo: -1 });
conteoDroneSchema.index(
    { organizacionId: 1, claveOperacion: 1 },
    { unique: true, partialFilterExpression: { claveOperacion: { $type: 'string' } } }
);

module.exports = model('ConteoDrone', conteoDroneSchema);
