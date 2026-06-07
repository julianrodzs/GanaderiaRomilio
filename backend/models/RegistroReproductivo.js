const { Schema, model } = require('mongoose');

const ESTADOS_REPRODUCTIVOS = [
    'Vacía',
    'Gestante',
    'Próxima a parto',
    'Parida',
    'Próximo celo estimado',
    'Destete próximo'
];

const sumarDias = (fecha, dias) => {
    if (!fecha) return undefined;
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setUTCDate(nuevaFecha.getUTCDate() + dias);
    return nuevaFecha;
};

const sumarMeses = (fecha, meses) => {
    if (!fecha) return undefined;
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setUTCMonth(nuevaFecha.getUTCMonth() + meses);
    return nuevaFecha;
};

const diasHasta = (fecha) => {
    if (!fecha) return undefined;

    const hoy = new Date();
    const objetivo = new Date(fecha);
    const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const objetivoUtc = Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth(), objetivo.getUTCDate());

    return Math.ceil((objetivoUtc - hoyUtc) / (1000 * 60 * 60 * 24));
};

const esFechaValida = (fecha) => {
    if (!fecha) return false;
    return !Number.isNaN(new Date(fecha).getTime());
};

const normalizarDiaUtc = (fecha) => {
    if (!fecha) return null;
    const fechaObj = new Date(fecha);
    if (Number.isNaN(fechaObj.getTime())) return null;
    return new Date(Date.UTC(fechaObj.getUTCFullYear(), fechaObj.getUTCMonth(), fechaObj.getUTCDate()));
};

const esHoyOAnterior = (fecha) => {
    const dias = diasHasta(fecha);
    return dias !== undefined && dias <= 0;
};

const fechasMismoDia = (fechaA, fechaB) => {
    if (!fechaA && !fechaB) return true;
    if (!fechaA || !fechaB) return false;

    const a = new Date(fechaA);
    const b = new Date(fechaB);

    return a.getUTCFullYear() === b.getUTCFullYear()
        && a.getUTCMonth() === b.getUTCMonth()
        && a.getUTCDate() === b.getUTCDate();
};

const calcularProximoCelo = (fechaPartoReal) => {
    const parto = normalizarDiaUtc(fechaPartoReal);
    if (!parto) return undefined;

    const hoy = normalizarDiaUtc(new Date());
    const proximoCelo = sumarDias(parto, 60);

    while (proximoCelo < hoy) {
        proximoCelo.setUTCDate(proximoCelo.getUTCDate() + 21);
    }

    return proximoCelo;
};

const calcularEstadoReproductivo = ({
    fechaMonta,
    fechaPartoEstimada,
    fechaPartoReal,
    fechaProximoCelo,
    fechaDestete
}) => {
    const diasParaParto = diasHasta(fechaPartoEstimada);
    const diasParaDestete = diasHasta(fechaDestete);

    if (fechaPartoReal && esHoyOAnterior(fechaPartoReal)) {
        if (fechaDestete && diasParaDestete <= 15) {
            return 'Destete próximo';
        }

        if (fechaProximoCelo) {
            return 'Próximo celo estimado';
        }

        return 'Parida';
    }

    if (fechaPartoEstimada && diasParaParto <= 15) {
        return 'Próxima a parto';
    }

    if (fechaMonta || fechaPartoEstimada) {
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
        fechaProximoCelo: { type: Date },
        // Campo legado: se mantiene para leer registros viejos, pero la UI usa fechaProximoCelo.
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

const completarFechasYEstado = (datos, opciones = {}) => {
    if (datos.fechaMonta && !datos.fechaPartoEstimada) {
        datos.fechaPartoEstimada = sumarDias(datos.fechaMonta, 283);
    }

    if (datos.fechaPartoReal) {
        datos.fechaProximoCelo = calcularProximoCelo(datos.fechaPartoReal);
    } else if (!datos.fechaProximoCelo && datos.fechaListaMonta) {
        datos.fechaProximoCelo = datos.fechaListaMonta;
    }

    if (datos.fechaPartoReal && (opciones.recalcularDesdePartoReal || !datos.fechaDestete)) {
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
    const fechaPartoRealCambio = datosUpdate.fechaPartoReal !== undefined
        && !fechasMismoDia(actual?.fechaPartoReal, datos.fechaPartoReal);

    completarFechasYEstado(datos, {
        recalcularDesdePartoReal: fechaPartoRealCambio && esFechaValida(datos.fechaPartoReal)
    });

    datosUpdate.fechaPartoEstimada = datos.fechaPartoEstimada;
    datosUpdate.fechaProximoCelo = datos.fechaProximoCelo;
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
    calcularProximoCelo,
    completarFechasYEstado
};
