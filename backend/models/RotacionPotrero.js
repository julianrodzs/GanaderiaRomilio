const { Schema, model } = require('mongoose');
const { aplicarAislamientoOrganizacion } = require('./plugins/organizacion-plugin');

const rotacionPotreroSchema = new Schema(
    {
        potrero: { type: Schema.Types.ObjectId, ref: 'Potrero', required: true },
        lote: { type: String, trim: true },
        loteRef: { type: Schema.Types.ObjectId, ref: 'Lote', default: null },
        fechaEntrada: { type: Date, required: true },
        fechaSalida: { type: Date },
        numeroAnimales: {
            type: Number,
            required: true,
            min: 1,
            validate: {
                validator: Number.isInteger,
                message: 'El numero de animales debe ser un entero mayor o igual a uno.'
            }
        },
        diasOcupado: { type: Number, min: 0 },
        diasDescansoPrevio: { type: Number, min: 0 },
        estado: {
            type: String,
            enum: ['Activa', 'Finalizada', 'Planificada'],
            default: 'Activa'
        },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

rotacionPotreroSchema.plugin(aplicarAislamientoOrganizacion, { finca: true });
rotacionPotreroSchema.index({ loteRef: 1, fechaEntrada: -1 });
rotacionPotreroSchema.index(
    { organizacionId: 1, fincaId: 1, loteRef: 1 },
    { unique: true, partialFilterExpression: { loteRef: { $type: 'objectId' }, estado: 'Activa' } }
);
rotacionPotreroSchema.index(
    { organizacionId: 1, fincaId: 1, potrero: 1, estado: 1 },
    { unique: true, partialFilterExpression: { estado: 'Activa' }, name: 'una_rotacion_activa_por_potrero' }
);

rotacionPotreroSchema.pre('validate', function validarCronologia(next) {
    if (this.fechaEntrada && this.fechaSalida && this.fechaSalida < this.fechaEntrada) {
        this.invalidate('fechaSalida', 'La fecha de salida no puede ser anterior a la fecha de entrada.');
    }
    next();
});

module.exports = model('RotacionPotrero', rotacionPotreroSchema);
