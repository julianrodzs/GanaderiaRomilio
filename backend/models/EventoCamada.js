const { Schema, model } = require('mongoose');

const TIPOS_EVENTO_CAMADA = [
    'Camada registrada',
    'Nacimiento',
    'Sanidad',
    'Tratamiento',
    'Destete',
    'Monta',
    'Venta',
    'Sacrificio',
    'Mortalidad',
    'Cambio de destino',
    'Cierre',
    'Cancelacion',
    'Observacion'
];

const MODULOS_ORIGEN = [
    'Reproduccion',
    'Camadas',
    'Tareas',
    'Ventas',
    'Inventario',
    'Manual'
];

const eventoCamadaSchema = new Schema(
    {
        camada: { type: Schema.Types.ObjectId, ref: 'Camada', required: true },
        tipoEvento: { type: String, enum: TIPOS_EVENTO_CAMADA, required: true },
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

eventoCamadaSchema.index({ camada: 1, fecha: -1 });
eventoCamadaSchema.index({ camada: 1, moduloOrigen: 1, referenciaId: 1, tipoEvento: 1 });

module.exports = model('EventoCamada', eventoCamadaSchema);
