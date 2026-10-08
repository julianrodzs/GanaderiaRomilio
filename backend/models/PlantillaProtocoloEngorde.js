const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const ACCIONES_ENGORDE = ['RECEPCION', 'IDENTIFICACION', 'PESAJE', 'UBICACION', 'REVISION_SANITARIA', 'CAMBIO_RACION', 'SANIDAD', 'CONTROL', 'EVALUAR_VENTA', 'OTRA'];
const CRITERIOS_SALIDA = ['TIEMPO', 'PESO_PROMEDIO', 'GMD', 'EVENTO', 'MANUAL'];

const criterioSchema = new Schema({
    tipo: { type: String, enum: CRITERIOS_SALIDA, required: true },
    operador: { type: String, enum: ['>=', '<=', '=', 'REALIZADO'], default: '>=' },
    valor: { type: Number },
    evento: { type: String, trim: true }
}, { _id: true });

const pasoSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    tipoAccion: { type: String, enum: ACCIONES_ENGORDE, required: true },
    orden: { type: Number, required: true },
    referenciaTemporal: { type: String, enum: ['DESDE_INICIO', 'DESDE_PASO'], default: 'DESDE_INICIO' },
    pasoReferenciaId: Schema.Types.ObjectId,
    offsetHoras: { type: Number, default: 0 },
    ventanaInicioHoras: Number,
    ventanaFinHoras: Number,
    generaTarea: { type: Boolean, default: true },
    rolResponsable: { type: String, enum: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario'], default: 'Encargado' },
    instrucciones: { type: String, trim: true },
    obligatorio: { type: Boolean, default: true },
    configuracion: { type: Schema.Types.Mixed, default: {} }
}, { _id: true });

const etapaSchema = new Schema({
    codigo: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    orden: { type: Number, required: true },
    descripcion: { type: String, trim: true },
    diasObjetivo: { type: Number, min: 0 },
    pesoObjetivoKg: { type: Number, min: 0 },
    gmdObjetivoKgDia: { type: Number, min: 0 },
    criteriosSalida: { type: [criterioSchema], default: [] },
    pasos: { type: [pasoSchema], default: [] }
}, { _id: true });

const schema = new Schema({
    fincaId: { type: Schema.Types.ObjectId, ref: 'Finca' },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    especie: { type: String, enum: ['BOVINO'], default: 'BOVINO' },
    alcance: { type: String, enum: ['ORGANIZACION', 'FINCA'], default: 'FINCA' },
    activo: { type: Boolean, default: true },
    version: { type: Number, min: 1, default: 1 },
    etapas: { type: [etapaSchema], required: true, validate: [(items) => items.length > 0, 'El protocolo requiere etapas.'] },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

schema.plugin(aplicarAislamientoOrganizacion);
schema.index({ organizacionId: 1, fincaId: 1, nombre: 1, version: -1 });

module.exports = { ACCIONES_ENGORDE, CRITERIOS_SALIDA, PlantillaProtocoloEngorde: model('PlantillaProtocoloEngorde', schema) };
