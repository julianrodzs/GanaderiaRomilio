const { Schema, model } = require('mongoose');
const reproduccionPorcinaConfig = require('../config/reproduccionPorcinaConfig');

const ESTADOS_REPRODUCTIVOS = [
    'Vacía',
    'Gestante',
    'Próxima a parto',
    'Parida',
    'Próximo celo estimado',
    'Destete próximo'
];

const ESTADOS_CICLO = [
    'Activo',
    'Cerrado',
    'Cancelado',
    'No preñada'
];

const sumarDias = (fecha, dias) => {
    if (!fecha) return undefined;
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setUTCDate(nuevaFecha.getUTCDate() + dias);
    return nuevaFecha;
};

const restarDias = (fecha, dias) => sumarDias(fecha, -dias);

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

const calcularProximoCeloPorcino = (fechaDestete, diasCeloPostDestete = 5) => {
    const destete = normalizarDiaUtc(fechaDestete);
    if (!destete) return undefined;
    return sumarDias(destete, Number(diasCeloPostDestete) || 5);
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
        especie: { type: String, enum: ['Bovino', 'Porcino'], default: 'Bovino' },
        diasDestetePorcino: { type: Number, min: 1, default: 28 },
        diasCeloPostDestetePorcino: { type: Number, min: 1, default: 5 },
        tipoRegistro: { type: String, enum: ['Inseminación/Monta', 'Monta', 'Inseminación'], default: 'Inseminación/Monta' },
        destinoCrias: { type: String, enum: ['Se quedan', 'Se venden', 'Engorde', 'No definido'], default: 'No definido' },
        cantidadCriasEstimada: { type: Number, min: 0 },
        cantidadCrias: { type: Number, min: 0 },
        fechaInseminacion: { type: Date },
        fechaRevisionCelo: { type: Date },
        fechaInicioVentanaParto: { type: Date },
        fechaFinVentanaParto: { type: Date },
        fechaDesparasitacionAntesParto: { type: Date },
        fechaAlimentoLactancia: { type: Date },
        fechaNuevaInseminacion: { type: Date },
        fechaRevisionCeloPosterior: { type: Date },
        fechaMonta: { type: Date },
        fechaPartoEstimada: { type: Date },
        fechaPartoReal: { type: Date },
        fechaProximoCelo: { type: Date },
        // Campo legado: se mantiene para leer registros viejos, pero la UI usa fechaProximoCelo.
        fechaListaMonta: { type: Date },
        fechaDestete: { type: Date },
        estadoCiclo: {
            type: String,
            enum: ESTADOS_CICLO,
            default: 'Activo'
        },
        fechaCierre: { type: Date },
        motivoCierre: { type: String, trim: true },
        activoParaAlertas: { type: Boolean, default: true },
        tareasGeneradas: [
            {
                tarea: { type: Schema.Types.ObjectId, ref: 'Tarea' },
                tipoTarea: { type: String, trim: true }
            }
        ],
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
    const especie = datos.especie || 'Bovino';

    if (datos.estadoCiclo && datos.estadoCiclo !== 'Activo') {
        datos.activoParaAlertas = false;
    } else {
        datos.estadoCiclo = datos.estadoCiclo || 'Activo';
        datos.activoParaAlertas = true;
    }

    if (especie === 'Porcino') {
        datos.fechaInseminacion = datos.fechaInseminacion || datos.fechaMonta;
        datos.fechaMonta = datos.fechaMonta || datos.fechaInseminacion;

        if (datos.fechaInseminacion) {
            datos.fechaRevisionCelo = sumarDias(datos.fechaInseminacion, reproduccionPorcinaConfig.diasRevisionCeloPostInseminacion);
            datos.fechaPartoEstimada = sumarDias(datos.fechaInseminacion, reproduccionPorcinaConfig.diasGestacion);
        }

        if (datos.fechaPartoEstimada) {
            datos.fechaInicioVentanaParto = restarDias(datos.fechaPartoEstimada, reproduccionPorcinaConfig.margenPartoDias);
            datos.fechaFinVentanaParto = sumarDias(datos.fechaPartoEstimada, reproduccionPorcinaConfig.margenPartoDias);
            datos.fechaDesparasitacionAntesParto = restarDias(datos.fechaPartoEstimada, reproduccionPorcinaConfig.diasDesparasitacionAntesParto);
            datos.fechaAlimentoLactancia = restarDias(datos.fechaPartoEstimada, reproduccionPorcinaConfig.diasAlimentoLactanciaAntesParto);
            datos.fechaDestete = sumarDias(datos.fechaPartoEstimada, reproduccionPorcinaConfig.diasDestetePostParto);
            datos.fechaNuevaInseminacion = sumarDias(datos.fechaDestete, reproduccionPorcinaConfig.diasNuevaMontaPostDestete);
            datos.fechaRevisionCeloPosterior = sumarDias(datos.fechaNuevaInseminacion, reproduccionPorcinaConfig.diasRevisionCeloPostNuevaMonta);
            datos.fechaProximoCelo = datos.fechaNuevaInseminacion;
        }

        datos.estado = calcularEstadoReproductivo(datos);
        return;
    }

    if (datos.fechaMonta && !datos.fechaPartoEstimada) {
        datos.fechaPartoEstimada = sumarDias(datos.fechaMonta, especie === 'Porcino' ? 114 : 283);
    }

    if (datos.fechaPartoReal) {
        if (especie === 'Porcino') {
            if (opciones.recalcularDesdePartoReal || !datos.fechaDestete) {
                datos.fechaDestete = sumarDias(datos.fechaPartoReal, Number(datos.diasDestetePorcino) || 28);
            }
            datos.fechaProximoCelo = calcularProximoCeloPorcino(datos.fechaDestete, datos.diasCeloPostDestetePorcino);
        } else {
            datos.fechaProximoCelo = calcularProximoCelo(datos.fechaPartoReal);
        }
    } else if (!datos.fechaProximoCelo && datos.fechaListaMonta) {
        datos.fechaProximoCelo = datos.fechaListaMonta;
    }

    if (especie !== 'Porcino' && datos.fechaPartoReal && (opciones.recalcularDesdePartoReal || !datos.fechaDestete)) {
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

    [
        'fechaInseminacion',
        'fechaMonta',
        'fechaRevisionCelo',
        'fechaPartoEstimada',
        'fechaInicioVentanaParto',
        'fechaFinVentanaParto',
        'fechaDesparasitacionAntesParto',
        'fechaAlimentoLactancia',
        'fechaDestete',
        'fechaNuevaInseminacion',
        'fechaRevisionCeloPosterior',
        'fechaProximoCelo',
        'estadoCiclo',
        'activoParaAlertas',
        'fechaCierre',
        'motivoCierre',
        'estado'
    ].forEach((campo) => {
        datosUpdate[campo] = datos[campo];
    });

    if (update.$set) {
        update.$set = datosUpdate;
    }

    next();
});

registroReproductivoSchema.index({ animal: 1, fechaMonta: -1 });
registroReproductivoSchema.index({ especie: 1, estado: 1 });
registroReproductivoSchema.index({ estado: 1 });
registroReproductivoSchema.index({ fechaProximoCelo: 1 });
registroReproductivoSchema.index({ fechaPartoEstimada: 1 });
registroReproductivoSchema.index({ fechaPartoReal: 1 });
registroReproductivoSchema.index({ especie: 1, fechaInseminacion: 1 });
registroReproductivoSchema.index({ animal: 1, estadoCiclo: 1, activoParaAlertas: 1 });

module.exports = {
    RegistroReproductivo: model('RegistroReproductivo', registroReproductivoSchema),
    calcularEstadoReproductivo,
    calcularProximoCelo,
    completarFechasYEstado
};
