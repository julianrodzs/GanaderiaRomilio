const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');
const { OBJETIVOS_PRODUCTIVOS, normalizarObjetivoProductivo } = require('../config/objetivosProductivos');

const snapshotHitoSchema = new Schema({ peso: Number, fecha: Date, edadDias: Number }, { _id: false });
const origenHitoSchema = new Schema({ pesaje: { type: Schema.Types.ObjectId, ref: 'Pesaje' }, anterior: snapshotHitoSchema, sincronizado: snapshotHitoSchema }, { _id: false });

const animalSchema = new Schema(
    {
        identificadorFinca: { type: String, required: true, trim: true },
        diio: { type: String, trim: true },
        especie: { type: String, enum: ['Bovino', 'Porcino'], default: 'Bovino', index: true },
        categoria: {
            type: String,
            enum: [
                'Ternero',
                'Ternera',
                'Novillo',
                'Novilla',
                'Toro',
                'Vaca',
                'Chancha',
                'Lechón',
                'Lechona',
                'Cerdo joven',
                'Cerda joven',
                'Cerdo adulto',
                'Otro'
            ],
            trim: true
        },
        objetivoProductivo: {
            type: String,
            enum: OBJETIVOS_PRODUCTIVOS,
            default: 'SIN_DEFINIR',
            set: (valor) => normalizarObjetivoProductivo(valor) || valor,
            trim: true
        },
        etapaProductiva: {
            type: String,
            enum: ['Fase 1', 'Fase 2', 'Fase 3', 'Desarrollo', 'Engorde'],
            trim: true
        },
        nombre: { type: String, trim: true },
        sexo: { type: String, enum: ['Macho', 'Hembra'], required: true },
        raza: { type: String, trim: true },
        razaPrincipal: { type: String, trim: true },
        razaSecundaria: { type: String, trim: true },
        grupoRacial: { type: String, trim: true },
        gradoRacial: { type: String, trim: true },
        variedadRacial: { type: String, trim: true },
        descripcionRacial: { type: String, trim: true },
        composicionRacial: { type: String, trim: true },
        fraccionRazaPrincipal: { type: String, trim: true },
        fraccionRazaSecundaria: { type: String, trim: true },
        madreDiio: { type: String, trim: true },
        padreDiio: { type: String, trim: true },
        padre: { type: Schema.Types.ObjectId, ref: 'Animal' },
        madre: { type: Schema.Types.ObjectId, ref: 'Animal' },
        madreGeneticaId: { type: Schema.Types.ObjectId, ref: 'Animal' },
        madreGestanteId: { type: Schema.Types.ObjectId, ref: 'Animal' },
        madreGeneticaExterna: { nombre: String, diio: String, registro: String, raza: String },
        revisionReproductiva: { type: Number, default: 0 },
        origenGenealogico: {
            type: String,
            enum: ['Interno', 'Externo', 'Desconocido'],
            default: 'Desconocido'
        },
        padreExternoNombre: { type: String, trim: true },
        madreExternaNombre: { type: String, trim: true },
        registroGenealogico: { type: String, trim: true },
        observacionesGenealogicas: { type: String, trim: true },
        fechaNacimiento: { type: Date },
        fechaProximoCambioCategoria: { type: Date },
        fechaDesteteEstimada: { type: Date },
        fechaDestete: { type: Date },
        edadDesteteDias: { type: Number, min: 0, default: null },
        hitosPesaje: { type: new Schema({ nacimiento: origenHitoSchema, destete: origenHitoSchema }, { _id: false }), select: false },
        pesoNacimiento: { type: Number, min: 0 },
        pesoDestete: { type: Number, min: 0 },
        pesoActual: { type: Number, min: 0 },
        fechaUltimoPesaje: { type: Date },
        pesoCompra: { type: Number, min: 0 },
        pesoVenta: { type: Number, min: 0 },
        precioCompraPorKg: { type: Number, min: 0 },
        precioVentaPorKg: { type: Number, min: 0 },
        montoCompra: { type: Number, min: 0 },
        montoVenta: { type: Number, min: 0 },
        proveedorCompra: { type: String, trim: true },
        compraId: { type: Schema.Types.ObjectId, ref: 'CompraAnimal' },
        camadaOrigen: { type: Schema.Types.ObjectId, ref: 'Camada' },
        comprador: { type: String, trim: true },
        ventaId: { type: Schema.Types.ObjectId, ref: 'VentaAnimal' },
        fechaCompra: { type: Date },
        fechaVenta: { type: Date },
        fechaMuerte: { type: Date },
        estado: {
            type: String,
            enum: ['Activo', 'Vendido', 'Muerto'],
            default: 'Activo'
        },
        estadoSanitario: {
            type: String,
            enum: ['Sano', 'En observación', 'Enfermo', 'Recuperación'],
            default: 'Sano'
        },
        fechaFinRetiroCarne: { type: Date, default: null },
        medicamentoEnRetiro: { type: String, trim: true, default: '' },
        potreroActual: { type: Schema.Types.ObjectId, ref: 'Potrero' },
        loteActual: { type: Schema.Types.ObjectId, ref: 'Lote' },
        fotoPrincipal: { type: Schema.Types.ObjectId, ref: 'ArchivoMultimedia', default: null },
        claveImportacion: { type: String, trim: true },
        importacionOrigen: { type: Schema.Types.ObjectId, ref: 'ImportacionExcel' },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

animalSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
animalSchema.plugin(require('./plugins/categoria-plugin'));
animalSchema.pre('validate', function () {
    if (this.isNew && this.madre && !this.madreGeneticaId && !this.madreGeneticaExterna?.nombre) this.madreGeneticaId = this.madre;
    if (this.isNew && this.madre && !this.madreGestanteId) this.madreGestanteId = this.madre;
});
animalSchema.index({ organizacionId: 1, fincaId: 1, madreGeneticaId: 1 });
animalSchema.index({ organizacionId: 1, fincaId: 1, madreGestanteId: 1 });
animalSchema.index({ organizacionId: 1, fincaId: 1, identificadorFinca: 1 }, { unique: true });
animalSchema.index(
    { organizacionId: 1, diio: 1 },
    { unique: true, partialFilterExpression: { diio: { $type: 'string' } } }
);
animalSchema.index({ estado: 1 });
animalSchema.index({ organizacionId: 1, fincaId: 1, fechaProximoCambioCategoria: 1 }, {
    name: 'agenda_categoria_activa', partialFilterExpression: { estado: 'Activo' }
});
animalSchema.index({ estadoSanitario: 1 });
animalSchema.index({ fechaFinRetiroCarne: 1 });
animalSchema.index({ sexo: 1 });
animalSchema.index({ potreroActual: 1 });
animalSchema.index({ especie: 1, estado: 1 });
animalSchema.index({ especie: 1, categoria: 1 });
animalSchema.index({ especie: 1, objetivoProductivo: 1, estado: 1 });
animalSchema.index({ camadaOrigen: 1, categoria: 1 });
animalSchema.index({ estado: 1, potreroActual: 1 });
animalSchema.index({ loteActual: 1, estado: 1 });
animalSchema.index({ organizacionId: 1, fincaId: 1, madre: 1, fechaNacimiento: -1 });
animalSchema.index({ organizacionId: 1, fincaId: 1, padre: 1, fechaNacimiento: -1 });
animalSchema.index({ organizacionId: 1, fincaId: 1, madreDiio: 1, fechaNacimiento: -1 });
animalSchema.index({ organizacionId: 1, fincaId: 1, padreDiio: 1, fechaNacimiento: -1 });
animalSchema.index({ organizacionId: 1, fincaId: 1, especie: 1, grupoRacial: 1 });
animalSchema.index(
    { organizacionId: 1, fincaId: 1, claveImportacion: 1 },
    { unique: true, partialFilterExpression: { claveImportacion: { $type: 'string' } } }
);

module.exports = model('Animal', animalSchema);
