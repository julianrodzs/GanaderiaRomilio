const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const TIPOS_ACCION_IATF = [
    'INSERTAR_DISPOSITIVO', 'RETIRAR_DISPOSITIVO', 'APLICAR_PRODUCTO', 'IATF',
    'OBSERVAR_CELO', 'DIAGNOSTICO_GESTACION', 'RESINCRONIZACION',
    'MONTA_REPASO', 'CONTROL', 'OTRA'
];

const productoPasoSchema = new Schema({
    producto: { type: Schema.Types.ObjectId, ref: 'InsumoReproductivo' },
    nombreReferencia: { type: String, trim: true },
    dosis: { type: String, trim: true },
    unidad: { type: String, trim: true },
    viaAdministracion: { type: String, trim: true },
    cantidadPorAnimal: { type: Number, min: 0 },
    observaciones: { type: String, trim: true }
}, { _id: true });

const pasoSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    tipoAccion: { type: String, enum: TIPOS_ACCION_IATF, required: true },
    referenciaTemporal: { type: String, enum: ['DESDE_INICIO', 'DESDE_PASO'], default: 'DESDE_INICIO' },
    pasoReferenciaId: { type: Schema.Types.ObjectId },
    offsetHoras: { type: Number, required: true, default: 0 },
    ventanaInicioHoras: { type: Number },
    ventanaFinHoras: { type: Number },
    productos: { type: [productoPasoSchema], default: [] },
    generaTarea: { type: Boolean, default: true },
    rolResponsable: { type: String, enum: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario'], default: 'Veterinario' },
    instrucciones: { type: String, trim: true },
    obligatorio: { type: Boolean, default: true }
}, { _id: true });

const plantillaProtocoloIATFSchema = new Schema({
    fincaId: { type: Schema.Types.ObjectId, ref: 'Finca' },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    especie: { type: String, enum: ['BOVINO'], default: 'BOVINO' },
    alcance: { type: String, enum: ['SISTEMA', 'ORGANIZACION', 'FINCA'], default: 'FINCA' },
    activo: { type: Boolean, default: true },
    diasPostpartoMinimosRecomendados: { type: Number, min: 0 },
    escalaCondicionCorporal: { type: String, enum: ['1-5', '1-9'], default: '1-5' },
    condicionCorporalMinima: { type: Number, min: 0 },
    version: { type: Number, min: 1, default: 1 },
    pasos: { type: [pasoSchema], required: true, validate: [(pasos) => pasos.length > 0, 'El protocolo requiere al menos un paso.'] },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

plantillaProtocoloIATFSchema.plugin(aplicarAislamientoOrganizacion);
plantillaProtocoloIATFSchema.index({ organizacionId: 1, fincaId: 1, activo: 1, nombre: 1 });

module.exports = {
    TIPOS_ACCION_IATF,
    PlantillaProtocoloIATF: model('PlantillaProtocoloIATF', plantillaProtocoloIATFSchema)
};
