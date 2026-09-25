const { Schema, model } = require('mongoose');

const NATURALEZAS_APLICACION = ['Plan sanitario', 'Tratamiento', 'Aplicacion unica'];

const aplicacionSanitariaSchema = new Schema(
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
        fechaAplicacion: { type: Date, required: true },
        producto: { type: String, required: true, trim: true },
        tipo: { type: String, trim: true },
        dosis: { type: String, trim: true },
        viaAplicacion: { type: String, trim: true },
        responsable: { type: String, trim: true },
        motivo: { type: String, trim: true },
        observaciones: { type: String, trim: true },
        naturaleza: { type: String, enum: NATURALEZAS_APLICACION, required: true },
        planSanitario: { type: Schema.Types.ObjectId, ref: 'PlanSanitario', default: null },
        tratamiento: { type: Schema.Types.ObjectId, ref: 'TratamientoSanitario', default: null },
        numeroAplicacion: { type: Number, min: 1 },
        totalAplicaciones: { type: Number, min: 1 },
        registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' }
    },
    { timestamps: true }
);

aplicacionSanitariaSchema.pre('validate', function validarOrigen(next) {
    this.animales = [...new Set((this.animales || []).map((id) => id.toString()))];

    if (this.naturaleza === 'Plan sanitario') {
        this.tratamiento = null;
    }

    if (this.naturaleza === 'Tratamiento') {
        this.planSanitario = null;
        if (!this.tratamiento) {
            this.invalidate('tratamiento', 'Una aplicación de tratamiento debe estar asociada a un tratamiento');
        }
    }

    if (this.naturaleza === 'Aplicacion unica') {
        this.planSanitario = null;
        this.tratamiento = null;
        this.numeroAplicacion = undefined;
        this.totalAplicaciones = undefined;
    }

    next();
});

aplicacionSanitariaSchema.index({ fechaAplicacion: -1 });
aplicacionSanitariaSchema.index({ animales: 1, fechaAplicacion: -1 });
aplicacionSanitariaSchema.index({ naturaleza: 1, fechaAplicacion: -1 });
aplicacionSanitariaSchema.index({ tratamiento: 1, numeroAplicacion: 1 }, {
    unique: true,
    partialFilterExpression: { tratamiento: { $type: 'objectId' }, numeroAplicacion: { $type: 'number' } }
});
aplicacionSanitariaSchema.index({ planSanitario: 1, fechaAplicacion: -1 });

const AplicacionSanitaria = model('AplicacionSanitaria', aplicacionSanitariaSchema);

module.exports = {
    AplicacionSanitaria,
    NATURALEZAS_APLICACION
};
