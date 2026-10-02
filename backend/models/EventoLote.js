const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const eventoLoteSchema = new Schema({
    lote: { type: Schema.Types.ObjectId, ref: 'Lote', required: true },
    tipo: { type: String, required: true, trim: true },
    fecha: { type: Date, required: true, default: Date.now },
    titulo: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    referenciaId: { type: Schema.Types.ObjectId },
    entidadTipo: { type: String, trim: true },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    metadata: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });

eventoLoteSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
eventoLoteSchema.index({ organizacionId: 1, fincaId: 1, lote: 1, fecha: -1 });

module.exports = model('EventoLote', eventoLoteSchema);
