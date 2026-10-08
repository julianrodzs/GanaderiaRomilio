const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const ejecucionSchema = new Schema({
    etapaId: { type: Schema.Types.ObjectId, required: true },
    pasoId: { type: Schema.Types.ObjectId, required: true },
    nombre: { type: String, required: true },
    tipoAccion: { type: String, required: true },
    obligatorio: { type: Boolean, default: true },
    fechaProgramada: { type: Date, required: true },
    ventanaInicio: Date,
    ventanaFin: Date,
    fechaReal: Date,
    estado: { type: String, enum: ['PENDIENTE', 'PARCIAL', 'REALIZADO', 'OMITIDO', 'CANCELADO'], default: 'PENDIENTE' },
    tarea: { type: Schema.Types.ObjectId, ref: 'Tarea' },
    animales: [{ type: Schema.Types.ObjectId, ref: 'Animal' }],
    resultado: { type: Schema.Types.Mixed, default: {} },
    realizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { _id: true });

const schema = new Schema({
    lote: { type: Schema.Types.ObjectId, ref: 'Lote', required: true },
    protocolo: { type: Schema.Types.ObjectId, ref: 'PlantillaProtocoloEngorde', required: true },
    protocoloVersion: { type: Number, required: true },
    protocoloSnapshot: { type: Schema.Types.Mixed, required: true },
    fechaInicio: { type: Date, required: true },
    fechaFin: Date,
    estado: { type: String, enum: ['PROGRAMADO', 'ACTIVO', 'FINALIZADO', 'CANCELADO'], default: 'ACTIVO' },
    etapaActualId: Schema.Types.ObjectId,
    participantesSnapshot: [{ animal: { type: Schema.Types.ObjectId, ref: 'Animal' }, diio: String, nombre: String, pesoInicialKg: Number }],
    ejecuciones: { type: [ejecucionSchema], default: [] },
    historialEtapas: [{ etapaId: Schema.Types.ObjectId, codigo: String, fechaInicio: Date, fechaFin: Date, avanzadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' } }],
    responsable: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    motivoCierre: { type: String, trim: true }
}, { timestamps: true, optimisticConcurrency: true });

schema.plugin(aplicarAislamientoOrganizacion, { finca: true });
schema.index({ organizacionId: 1, fincaId: 1, estado: 1, fechaInicio: -1 });
schema.index({ organizacionId: 1, fincaId: 1, lote: 1 }, { unique: true, partialFilterExpression: { estado: 'ACTIVO' } });

module.exports = model('CicloEngorde', schema);
