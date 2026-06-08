const { Schema, model } = require('mongoose');

const TIPOS_EVENTO = [
    'Nacimiento',
    'Compra',
    'Venta',
    'Muerte',
    'Cambio de potrero',
    'Pesaje',
    'Sanidad',
    'Tratamiento',
    'Parto',
    'Destete',
    'Monta',
    'Diagnostico de gestacion',
    'Observacion'
];

const MODULOS_ORIGEN = [
    'Inventario',
    'Potreros',
    'Pesajes',
    'Sanidad',
    'Reproduccion',
    'Finanzas',
    'Manual'
];

const eventoAnimalSchema = new Schema(
    {
        animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
        tipoEvento: { type: String, enum: TIPOS_EVENTO, required: true },
        fecha: { type: Date, required: true },
        titulo: { type: String, required: true, trim: true },
        descripcion: { type: String, trim: true },
        moduloOrigen: { type: String, enum: MODULOS_ORIGEN, default: 'Manual' },
        referenciaId: { type: Schema.Types.ObjectId },
        creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
        metadata: { type: Schema.Types.Mixed }
    },
    {
        timestamps: true
    }
);

eventoAnimalSchema.index({ animal: 1, fecha: -1 });
eventoAnimalSchema.index({ animal: 1, moduloOrigen: 1, referenciaId: 1, tipoEvento: 1 });

module.exports = model('EventoAnimal', eventoAnimalSchema);
