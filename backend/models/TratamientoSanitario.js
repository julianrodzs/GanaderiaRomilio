const { Schema, model } = require('mongoose');

const ESTADOS_TRATAMIENTO = ['Activo', 'Completado', 'Cancelado'];

const tratamientoSanitarioSchema = new Schema(
    {
        animales: {
            type: [{ type: Schema.Types.ObjectId, ref: 'Animal' }],
            required: true,
            validate: {
                validator: (animales) => Array.isArray(animales) && animales.length > 0,
                message: 'Debe asociar al menos un animal'
            }
        },
        especie: { type: String, enum: ['Bovino', 'Porcino'], required: true, index: true },
        motivo: { type: String, required: true, trim: true },
        diagnostico: { type: String, trim: true },
        producto: { type: String, required: true, trim: true },
        dosis: { type: String, trim: true },
        viaAplicacion: { type: String, trim: true },
        fechaInicio: { type: Date, required: true },
        cantidadAplicaciones: { type: Number, default: 1, min: 1 },
        intervaloDias: { type: Number, min: 1 },
        aplicacionesRealizadas: { type: Number, default: 0, min: 0 },
        proximaAplicacion: { type: Date, default: null },
        fechaFin: { type: Date, default: null },
        responsable: { type: String, trim: true },
        veterinario: { type: String, trim: true },
        asignadoA: { type: Schema.Types.ObjectId, ref: 'Usuario' },
        observaciones: { type: String, trim: true },
        estado: { type: String, enum: ESTADOS_TRATAMIENTO, default: 'Activo' },
        registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
    },
    { timestamps: true }
);

tratamientoSanitarioSchema.pre('validate', function validarTratamiento(next) {
    this.animales = [...new Set((this.animales || []).map((id) => id.toString()))];

    if (this.cantidadAplicaciones > 1 && !this.intervaloDias) {
        this.invalidate('intervaloDias', 'El intervalo es requerido cuando hay varias aplicaciones');
    }

    if (this.aplicacionesRealizadas > this.cantidadAplicaciones) {
        this.invalidate('aplicacionesRealizadas', 'Las aplicaciones realizadas no pueden superar el total');
    }

    if (this.estado !== 'Activo') {
        this.proximaAplicacion = null;
    }

    next();
});

tratamientoSanitarioSchema.index({ especie: 1, estado: 1, proximaAplicacion: 1 });
tratamientoSanitarioSchema.index({ animales: 1, fechaInicio: -1 });
tratamientoSanitarioSchema.index({ producto: 1, fechaInicio: -1 });

const TratamientoSanitario = model('TratamientoSanitario', tratamientoSanitarioSchema);

module.exports = {
    ESTADOS_TRATAMIENTO,
    TratamientoSanitario
};
