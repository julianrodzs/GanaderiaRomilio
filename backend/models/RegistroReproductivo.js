const { Schema, model } = require('mongoose');

const ESTADOS_REPRODUCTIVOS = [
    'Vacía',
    'Gestante',
    'Próxima a parto',
    'Parida',
    'Lista para monta',
    'Destete próximo'
];

const sumarDias = (fecha, dias) => {
    if (!fecha) return undefined;
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setDate(nuevaFecha.getDate() + dias);
    return nuevaFecha;
};

const sumarMeses = (fecha, meses) => {
    if (!fecha) return undefined;
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setMonth(nuevaFecha.getMonth() + meses);
    return nuevaFecha;
};

const diasHasta = (fecha) => {
    if (!fecha) return undefined;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const objetivo = new Date(fecha);
    objetivo.setHours(0, 0, 0, 0);

    return Math.ceil((objetivo.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
};

const calcularEstadoReproductivo = ({
    fechaMonta,
    fechaPartoEstimada,
    fechaPartoReal,
    fechaListaMonta,
    fechaDestete
}) => {
    const diasParaParto = diasHasta(fechaPartoEstimada);
    const diasParaListaMonta = diasHasta(fechaListaMonta);
    const diasParaDestete = diasHasta(fechaDestete);

    if (fechaListaMonta && diasParaListaMonta <= 0) {
        return 'Lista para monta';
    }

    if (fechaDestete && diasParaDestete <= 15) {
        return 'Destete próximo';
    }

    if (fechaPartoReal) {
        return 'Parida';
    }

    if (fechaPartoEstimada && diasParaParto <= 15) {
        return 'Próxima a parto';
    }

    if (fechaMonta) {
        return 'Gestante';
    }

    return 'Vacía';
};

const registroReproductivoSchema = new Schema(
    {
        animal: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
        fechaMonta: { type: Date },
        fechaPartoEstimada: { type: Date },
        fechaPartoReal: { type: Date },
        fechaListaMonta: { type: Date },
        fechaDestete: { type: Date },
        estado: {
            type: String,
            enum: ESTADOS_REPRODUCTIVOS,
            default: 'Vacía'
        },
        observaciones: { type: String, trim: true }
    },
    {
        timestamps: true
    }
);

const completarFechasYEstado = (datos) => {
    if (datos.fechaMonta && !datos.fechaPartoEstimada) {
        datos.fechaPartoEstimada = sumarDias(datos.fechaMonta, 283);
    }

    if (datos.fechaPartoReal && !datos.fechaListaMonta) {
        datos.fechaListaMonta = sumarDias(datos.fechaPartoReal, 60);
    }

    if (datos.fechaPartoReal && !datos.fechaDestete) {
        datos.fechaDestete = sumarMeses(datos.fechaPartoReal, 7);
    }

    datos.estado = calcularEstadoReproductivo(datos);
};

registroReproductivoSchema.pre('save', function calcularAntesDeGuardar(next) {
    completarFechasYEstado(this);
    next();
});

registroReproductivoSchema.pre('findOneAndUpdate', async function calcularAntesDeActualizar(next) {
    const update = this.getUpdate();
    const datosUpdate = update.$set || update;
    const actual = await this.model.findOne(this.getQuery()).lean();
    const datos = {
        ...(actual || {}),
        ...datosUpdate
    };

    completarFechasYEstado(datos);

    datosUpdate.fechaPartoEstimada = datos.fechaPartoEstimada;
    datosUpdate.fechaListaMonta = datos.fechaListaMonta;
    datosUpdate.fechaDestete = datos.fechaDestete;
    datosUpdate.estado = datos.estado;

    if (update.$set) {
        update.$set = datosUpdate;
    }

    next();
});

module.exports = {
    RegistroReproductivo: model('RegistroReproductivo', registroReproductivoSchema),
    calcularEstadoReproductivo,
    completarFechasYEstado
};
