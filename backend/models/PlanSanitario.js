const { Schema, model } = require('mongoose');

const FRECUENCIAS = ['dias', 'semanas', 'meses', 'años'];
const ESTADOS = ['Vigente', 'Próximo', 'Vencido', 'Aplicado'];

const sumarFrecuencia = (fecha, cantidad, unidad) => {
    const proximaFecha = new Date(fecha);

    if (!fecha || !cantidad || !unidad) {
        return undefined;
    }

    if (unidad === 'dias') {
        proximaFecha.setDate(proximaFecha.getDate() + cantidad);
    }

    if (unidad === 'semanas') {
        proximaFecha.setDate(proximaFecha.getDate() + cantidad * 7);
    }

    if (unidad === 'meses') {
        proximaFecha.setMonth(proximaFecha.getMonth() + cantidad);
    }

    if (unidad === 'años') {
        proximaFecha.setFullYear(proximaFecha.getFullYear() + cantidad);
    }

    return proximaFecha;
};

const calcularEstadoPlanSanitario = (proximaAplicacion) => {
    if (!proximaAplicacion) {
        return 'Vigente';
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const proxima = new Date(proximaAplicacion);
    proxima.setHours(0, 0, 0, 0);

    if (proxima < hoy) {
        return 'Vencido';
    }

    const sieteDias = new Date(hoy);
    sieteDias.setDate(sieteDias.getDate() + 7);

    if (proxima <= sieteDias) {
        return 'Próximo';
    }

    return 'Vigente';
};

const planSanitarioSchema = new Schema(
    {
        grupoGanado: { type: String, required: true, trim: true },
        animalDiio: { type: String, trim: true },
        actividad: { type: String, required: true, trim: true },
        producto: { type: String, required: true, trim: true },
        marca: { type: String, trim: true },
        dosis: { type: String, trim: true },
        criterioPeso: { type: String, trim: true },
        fechaAplicacion: { type: Date, required: true },
        frecuenciaCantidad: { type: Number, required: true, min: 1 },
        frecuenciaUnidad: { type: String, enum: FRECUENCIAS, required: true },
        proximaAplicacion: { type: Date },
        responsable: { type: String, trim: true },
        estado: { type: String, enum: ESTADOS, default: 'Vigente' },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

planSanitarioSchema.pre('save', function calcularProximaAplicacion(next) {
    this.proximaAplicacion = sumarFrecuencia(
        this.fechaAplicacion,
        this.frecuenciaCantidad,
        this.frecuenciaUnidad
    );

    if (this.estado !== 'Aplicado') {
        this.estado = calcularEstadoPlanSanitario(this.proximaAplicacion);
    }

    next();
});

planSanitarioSchema.pre('findOneAndUpdate', function calcularProximaEnUpdate(next) {
    const update = this.getUpdate();
    const datos = update.$set || update;

    if (datos.fechaAplicacion || datos.frecuenciaCantidad || datos.frecuenciaUnidad) {
        const fechaAplicacion = datos.fechaAplicacion;
        const frecuenciaCantidad = datos.frecuenciaCantidad;
        const frecuenciaUnidad = datos.frecuenciaUnidad;

        if (fechaAplicacion && frecuenciaCantidad && frecuenciaUnidad) {
            datos.proximaAplicacion = sumarFrecuencia(fechaAplicacion, frecuenciaCantidad, frecuenciaUnidad);

            if (datos.estado !== 'Aplicado') {
                datos.estado = calcularEstadoPlanSanitario(datos.proximaAplicacion);
            }
        }
    }

    if (update.$set) {
        update.$set = datos;
    }

    next();
});

planSanitarioSchema.index({ estado: 1, proximaAplicacion: 1 });
planSanitarioSchema.index({ grupoGanado: 1 });

const PlanSanitario = model('PlanSanitario', planSanitarioSchema);

module.exports = {
    PlanSanitario,
    calcularEstadoPlanSanitario,
    sumarFrecuencia
};
