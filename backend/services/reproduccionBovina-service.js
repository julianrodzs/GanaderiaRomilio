const { Tarea } = require('../models/Tarea');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const Animal = require('../models/Animal');
const reproduccionBovinaConfig = require('../config/reproduccionBovinaConfig');
const { ejecutarNotificacionSegura, notificarTareaAsignada } = require('./tarea-notificacion-service');

const formatearFecha = (fecha) => {
    if (!fecha) return '--';
    return new Date(fecha).toLocaleDateString('es-CR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'UTC'
    });
};

const obtenerCodigoAnimal = (animal) => {
    if (!animal) return 'vaca';
    return animal.diio || animal.identificadorFinca || animal.nombre || 'vaca';
};

const crearTareaBase = ({ registro, animal, usuarioId, asignadoA, config, fechaProgramada, descripcion }) => ({
    titulo: `${config.titulo} - ${obtenerCodigoAnimal(animal)}`,
    descripcion,
    tipo: config.tipo,
    estado: 'Pendiente',
    prioridad: config.prioridad,
    fechaProgramada,
    fechaLimite: fechaProgramada,
    asignadoA,
    creadoPor: usuarioId,
    animal: animal._id || animal,
    moduloOrigen: 'Reproduccion',
    referenciaId: registro._id,
    creadoAutomaticamente: true,
    especie: 'Bovino',
    categoriaAutomatica: config.categoriaAutomatica,
    claveAutomatica: config.clave,
    generaBitacora: true,
    tipoEventoBitacora: config.tipoEventoBitacora || 'Observacion'
});

const esSeguimientoBovinoVigente = (registro = {}) => {
    const estadoCiclo = registro.estadoCiclo || 'Activo';
    if (estadoCiclo === 'Activo') return registro.activoParaAlertas !== false;
    return estadoCiclo === 'Cerrado' && Boolean(registro.fechaPartoReal);
};

const rangoDiaUtc = (fecha) => {
    const inicio = new Date(fecha);
    if (Number.isNaN(inicio.getTime())) return null;
    inicio.setUTCHours(0, 0, 0, 0);
    const fin = new Date(inicio);
    fin.setUTCDate(fin.getUTCDate() + 1);
    return { inicio, fin };
};

const encontrarTerneroDelCiclo = async (registro, madre) => {
    if (!registro?.fechaPartoReal || !madre?._id) return null;
    const rango = rangoDiaUtc(registro.fechaPartoReal);
    if (!rango) return null;

    return Animal.findOne({
        madre: madre._id,
        especie: 'Bovino',
        fechaNacimiento: { $gte: rango.inicio, $lt: rango.fin }
    }).sort({ createdAt: 1 });
};

const sincronizarFechaDesteteTernero = async ({ registro, madre, ternero }) => {
    const cria = ternero || await encontrarTerneroDelCiclo(registro, madre);
    if (!cria || !registro.fechaDestete || cria.fechaDesteteEstimada) return cria;
    cria.fechaDesteteEstimada = registro.fechaDestete;
    await cria.save();
    return cria;
};

const crearDefinicionesTareasBovinas = ({ registro, animal, ternero, usuarioId }) => {
    const config = reproduccionBovinaConfig.tareasAutomaticas;
    const tareas = [];
    const asignadoA = registro.asignadoA?._id || registro.asignadoA;

    if (registro.fechaPartoEstimada && !registro.fechaPartoReal) {
        tareas.push(crearTareaBase({
            registro,
            animal,
            usuarioId,
            asignadoA,
            config: config.partoEstimado,
            fechaProgramada: registro.fechaPartoEstimada,
            descripcion: `Parto estimado para ${formatearFecha(registro.fechaPartoEstimada)}. Revisar condición de la madre y preparar seguimiento.`
        }));
    }

    if (registro.fechaProximoCelo) {
        tareas.push(crearTareaBase({
            registro,
            animal,
            usuarioId,
            asignadoA,
            config: config.proximoCelo,
            fechaProgramada: registro.fechaProximoCelo,
            descripcion: `Próximo celo estimado para ${formatearFecha(registro.fechaProximoCelo)}. Revisar si aplica monta o inseminación.`
        }));
    }

    if (registro.fechaDestete) {
        const animalDestete = ternero || animal;
        tareas.push(crearTareaBase({
            registro,
            animal: animalDestete,
            usuarioId,
            asignadoA,
            config: config.destete,
            fechaProgramada: registro.fechaDestete,
            descripcion: `Destete estimado para ${formatearFecha(registro.fechaDestete)}. Confirmar el destete de ${ternero ? obtenerCodigoAnimal(ternero) : 'la cría'} y la condición de la madre.`
        }));
    }

    return tareas;
};

const sincronizarTareasBovinas = async ({ registro, animal, usuarioId }) => {
    const especie = registro.especie || animal?.especie || 'Bovino';
    const seguimientoVigente = esSeguimientoBovinoVigente(registro);

    if (especie !== 'Bovino' || !usuarioId || !registro.asignadoA || !seguimientoVigente) {
        return { creadas: 0, actualizadas: 0, canceladas: 0 };
    }

    const ternero = await sincronizarFechaDesteteTernero({ registro, madre: animal });
    const definiciones = crearDefinicionesTareasBovinas({ registro, animal, ternero, usuarioId });
    const clavesVigentes = definiciones.map((tarea) => tarea.claveAutomatica);
    const existentes = await Tarea.find({
        moduloOrigen: 'Reproduccion',
        referenciaId: registro._id,
        creadoAutomaticamente: true
    });
    const existentesPorClave = new Map(existentes.map((tarea) => [tarea.claveAutomatica, tarea]));
    let creadas = 0;
    let actualizadas = 0;

    for (const definicion of definiciones) {
        const existente = existentesPorClave.get(definicion.claveAutomatica);

        if (!existente) {
            const tarea = await Tarea.create(definicion);
            await ejecutarNotificacionSegura(() => notificarTareaAsignada(tarea, usuarioId));
            creadas += 1;
            continue;
        }

        if (existente.estado === 'Pendiente') {
            const responsableActual = existente.asignadoA;
            Object.assign(existente, definicion);
            if (existente.asignacionModificadaManualmente) existente.asignadoA = responsableActual;
            await existente.save();
            actualizadas += 1;
            continue;
        }

        const observacionCancelacion = existente.observaciones || '';
        const canceladaPorAutomatizacion = existente.estado === 'Cancelada'
            && (
                /ciclo reproductivo|cambio del ciclo/i.test(observacionCancelacion)
                || Boolean(registro.motivoCierre && observacionCancelacion === registro.motivoCierre)
            );
        if (canceladaPorAutomatizacion && registro.fechaPartoReal) {
            Object.assign(existente, definicion, { estado: 'Pendiente', observaciones: undefined });
            await existente.save();
            actualizadas += 1;
        }
    }

    const resultadoCancelacion = await Tarea.updateMany(
        {
            moduloOrigen: 'Reproduccion',
            referenciaId: registro._id,
            creadoAutomaticamente: true,
            claveAutomatica: { $nin: clavesVigentes },
            estado: { $in: ['Pendiente', 'En proceso'] }
        },
        { $set: { estado: 'Cancelada', observaciones: 'Cancelada por cambio del ciclo reproductivo bovino' } }
    );
    const tareasGeneradas = await Tarea.find({
        moduloOrigen: 'Reproduccion',
        referenciaId: registro._id,
        creadoAutomaticamente: true
    }).select('_id claveAutomatica');

    await RegistroReproductivo.updateOne(
        { _id: registro._id },
        {
            $set: {
                tareasGeneradas: tareasGeneradas.map((tarea) => ({
                    tarea: tarea._id,
                    tipoTarea: tarea.claveAutomatica
                }))
            }
        }
    );

    return {
        creadas,
        actualizadas,
        canceladas: resultadoCancelacion.modifiedCount || 0
    };
};

module.exports = {
    crearDefinicionesTareasBovinas,
    encontrarTerneroDelCiclo,
    esSeguimientoBovinoVigente,
    sincronizarFechaDesteteTernero,
    sincronizarTareasBovinas
};
