const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const participanteSchema = new Schema({
    animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
    diio: String,
    nombre: String,
    numeroPartos: Number,
    fechaUltimoParto: Date,
    fechaUltimoDestete: Date,
    condicionCorporal: Number,
    loteOrigen: { type: Schema.Types.ObjectId, ref: 'Lote' },
    registroReproductivo: { type: Schema.Types.ObjectId, ref: 'RegistroReproductivo' },
    estadoParticipacion: { type: String, enum: ['ACTIVA', 'SERVIDA', 'PRENADA', 'PARIDA', 'DESTETADA', 'RETIRADA'], default: 'ACTIVA' },
    resultadoActual: { type: String, enum: ['SIN_DIAGNOSTICO', 'PRENADA', 'VACIA', 'DUDOSA'], default: 'SIN_DIAGNOSTICO' },
    fechasReales: { type: Schema.Types.Mixed, default: {} },
    observaciones: String
}, { _id: true });

const ejecucionSchema = new Schema({
    pasoId: { type: Schema.Types.ObjectId, required: true },
    nombre: String,
    tipoAccion: String,
    obligatorio: { type: Boolean, default: true },
    fechaProgramada: Date,
    ventanaInicio: Date,
    ventanaFin: Date,
    fechaReal: Date,
    estado: { type: String, enum: ['PENDIENTE', 'PARCIAL', 'REALIZADO', 'OMITIDO', 'CANCELADO'], default: 'PENDIENTE' },
    tarea: { type: Schema.Types.ObjectId, ref: 'Tarea' },
    participantes: [{ type: Schema.Types.ObjectId }],
    resultado: { type: Schema.Types.Mixed, default: {} },
    realizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { _id: true });

const schema = new Schema({
    nombre: { type: String, required: true, trim: true },
    protocolo: { type: Schema.Types.ObjectId, ref: 'PlantillaProtocoloReproductivoPorcino', required: true },
    protocoloVersion: { type: Number, required: true },
    protocoloSnapshot: { type: Schema.Types.Mixed, required: true },
    fechaInicio: { type: Date, required: true },
    fechaFin: Date,
    estado: { type: String, enum: ['PROGRAMADA', 'ACTIVA', 'FINALIZADA', 'CANCELADA'], default: 'ACTIVA' },
    participantes: { type: [participanteSchema], default: [] },
    ejecuciones: { type: [ejecucionSchema], default: [] },
    responsable: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    veterinario: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    motivoCierre: String
}, { timestamps: true, optimisticConcurrency: true });

schema.plugin(aplicarAislamientoOrganizacion, { finca: true });
schema.index({ organizacionId: 1, fincaId: 1, estado: 1, fechaInicio: -1 });
schema.index({ organizacionId: 1, fincaId: 1, 'participantes.animal': 1, estado: 1 });

module.exports = model('BandaReproductivaPorcina', schema);
