const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const condicionCorporalSchema = new Schema({
    valor: { type: Number, min: 0 },
    escala: { type: String, enum: ['1-5', '1-9'] }
}, { _id: false });

const participanteSchema = new Schema({
    animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
    loteOrigen: { type: Schema.Types.ObjectId, ref: 'Lote' },
    diasPostparto: { type: Number },
    condicionCorporal: condicionCorporalSchema,
    estadoReproductivo: { type: String, trim: true },
    categoria: { type: String, trim: true },
    estadoParticipacion: {
        type: String,
        enum: ['INSCRITA', 'EN_PROTOCOLO', 'PROTOCOLO_COMPLETADO', 'INSEMINADA', 'RETIRADA', 'CANCELADA'],
        default: 'INSCRITA'
    },
    fechaInseminacion: { type: Date },
    semenUtilizado: { type: Schema.Types.ObjectId, ref: 'InsumoReproductivo' },
    semenSnapshot: { type: Schema.Types.Mixed },
    tecnicoInseminador: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    registroReproductivo: { type: Schema.Types.ObjectId, ref: 'RegistroReproductivo' },
    resultadoActual: { type: String, enum: ['SIN_DIAGNOSTICO', 'PREÑADA', 'VACIA', 'DUDOSA', 'REQUIERE_RECONFIRMACION'], default: 'SIN_DIAGNOSTICO' },
    retornoCeloObservado: { type: Boolean, default: false },
    advertencias: { type: [String], default: [] },
    observaciones: { type: String, trim: true }
}, { _id: true });

const campanaIATFSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    protocolo: { type: Schema.Types.ObjectId, ref: 'PlantillaProtocoloIATF', required: true },
    protocoloVersion: { type: Number, required: true },
    protocoloSnapshot: { type: Schema.Types.Mixed, required: true },
    fechaHoraInicio: { type: Date, required: true },
    responsable: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    responsablesPorRol: { type: Schema.Types.Mixed, default: {} },
    veterinario: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    loteOrigen: { type: Schema.Types.ObjectId, ref: 'Lote' },
    participantes: { type: [participanteSchema], default: [] },
    estado: { type: String, enum: ['PROGRAMADA', 'EN_CURSO', 'DIAGNOSTICO', 'FINALIZADA', 'CANCELADA'], default: 'PROGRAMADA' },
    campanaAnterior: { type: Schema.Types.ObjectId, ref: 'CampanaIATF' },
    costosAdicionales: {
        veterinario: { type: Number, min: 0, default: 0 },
        tecnico: { type: Number, min: 0, default: 0 },
        otros: { type: Number, min: 0, default: 0 },
        moneda: { type: String, enum: ['CRC', 'USD'], default: 'CRC' }
    },
    observaciones: { type: String, trim: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    fechaFinalizacion: { type: Date },
    fechaCancelacion: { type: Date },
    motivoCancelacion: { type: String, trim: true }
}, { timestamps: true, optimisticConcurrency: true });

campanaIATFSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
campanaIATFSchema.index({ organizacionId: 1, fincaId: 1, estado: 1, fechaHoraInicio: -1 });
campanaIATFSchema.index({ 'participantes.animal': 1, estado: 1 });

module.exports = model('CampanaIATF', campanaIATFSchema);
