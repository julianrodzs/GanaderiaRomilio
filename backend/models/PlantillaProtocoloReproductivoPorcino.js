const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const ACCIONES_PROTOCOLO_PORCINO = [
    'DESTETE', 'OBSERVAR_CELO', 'SERVICIO', 'INSEMINACION', 'TRATAMIENTO_REPRODUCTIVO',
    'DIAGNOSTICO_GESTACION', 'CONTROL_REPETICION', 'PREPARTO', 'TRASLADO_MATERNIDAD',
    'PARTO', 'DESTETE_CAMADA', 'CONTROL', 'OTRA'
];

const pasoSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    tipoAccion: { type: String, enum: ACCIONES_PROTOCOLO_PORCINO, required: true },
    orden: { type: Number, required: true },
    referenciaTemporal: { type: String, enum: ['DESDE_INICIO', 'DESDE_PASO', 'DESDE_EVENTO_REAL'], default: 'DESDE_INICIO' },
    pasoReferenciaId: Schema.Types.ObjectId,
    eventoReferencia: { type: String, enum: ['DESTETE', 'SERVICIO', 'IA', 'PARTO_ESTIMADO', 'PARTO_REAL', 'DESTETE_REAL', 'OTRO_PASO'] },
    offsetHoras: { type: Number, default: 0 },
    ventanaInicioHoras: Number,
    ventanaFinHoras: Number,
    generaTarea: { type: Boolean, default: true },
    tareaGrupal: { type: Boolean, default: true },
    rolResponsable: { type: String, enum: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario'], default: 'Encargado' },
    instrucciones: { type: String, trim: true },
    obligatorio: { type: Boolean, default: true },
    configuracion: { type: Schema.Types.Mixed, default: {} }
}, { _id: true });

const schema = new Schema({
    fincaId: { type: Schema.Types.ObjectId, ref: 'Finca' },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    especie: { type: String, enum: ['PORCINO'], default: 'PORCINO' },
    alcance: { type: String, enum: ['ORGANIZACION', 'FINCA'], default: 'FINCA' },
    activo: { type: Boolean, default: true },
    version: { type: Number, min: 1, default: 1 },
    pasos: { type: [pasoSchema], required: true, validate: [(items) => items.length > 0, 'El protocolo requiere pasos.'] },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

schema.plugin(aplicarAislamientoOrganizacion);
schema.index({ organizacionId: 1, fincaId: 1, nombre: 1, version: -1 });

module.exports = { ACCIONES_PROTOCOLO_PORCINO, PlantillaProtocoloReproductivoPorcino: model('PlantillaProtocoloReproductivoPorcino', schema) };
