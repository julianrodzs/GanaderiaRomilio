const { Schema, model } = require('mongoose');

const animalSchema = new Schema(
    {
        identificadorFinca: { type: String, required: true, unique: true, trim: true },
        diio: { type: String, unique: true, sparse: true, trim: true },
        nombre: { type: String, trim: true },
        sexo: { type: String, enum: ['Macho', 'Hembra'], required: true },
        raza: { type: String, trim: true },
        madreDiio: { type: String, trim: true },
        padreDiio: { type: String, trim: true },
        padre: { type: Schema.Types.ObjectId, ref: 'Animal' },
        madre: { type: Schema.Types.ObjectId, ref: 'Animal' },
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
        fechaDestete: { type: Date },
        pesoNacimiento: { type: Number, min: 0 },
        pesoDestete: { type: Number, min: 0 },
        pesoActual: { type: Number, min: 0 },
        pesoCompra: { type: Number, min: 0 },
        pesoVenta: { type: Number, min: 0 },
        precioCompraPorKg: { type: Number, min: 0 },
        precioVentaPorKg: { type: Number, min: 0 },
        montoCompra: { type: Number, min: 0 },
        montoVenta: { type: Number, min: 0 },
        proveedorCompra: { type: String, trim: true },
        compraId: { type: Schema.Types.ObjectId, ref: 'CompraAnimal' },
        comprador: { type: String, trim: true },
        ventaId: { type: Schema.Types.ObjectId, ref: 'VentaAnimal' },
        fechaCompra: { type: Date },
        fechaVenta: { type: Date },
        fechaMuerte: { type: Date },
        estado: {
            type: String,
            enum: ['Activo', 'Vendido', 'Muerto', 'En tratamiento'],
            default: 'Activo'
        },
        potreroActual: { type: Schema.Types.ObjectId, ref: 'Potrero' },
        fotoUrl: { type: String, trim: true },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

animalSchema.index({ estado: 1 });
animalSchema.index({ sexo: 1 });
animalSchema.index({ potreroActual: 1 });
animalSchema.index({ estado: 1, potreroActual: 1 });

module.exports = model('Animal', animalSchema);
