const { Tarea } = require('../models/Tarea');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const reproduccionBovinaConfig = require('../config/reproduccionBovinaConfig');

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

const crearTareaBase = ({ registro, animal, usuarioId, config, fechaProgramada, descripcion }) => ({
    titulo: `${config.titulo} - ${obtenerCodigoAnimal(animal)}`,
    descripcion,
    tipo: config.tipo,
    estado: 'Pendiente',
    prioridad: config.prioridad,
    fechaProgramada,
    fechaLimite: fechaProgramada,
    asignadoA: usuarioId,
    creadoPor: usuarioId,
    animal: animal._id || animal,
    moduloOrigen: 'Reproduccion',
    referenciaId: registro._id,
    creadoAutomaticamente: true,
    especie: 'Bovino',
    categoriaAutomatica: config.categoriaAutomatica,
    claveAutomatica: config.clave
});

const crearDefinicionesTareasBovinas = ({ registro, animal, usuarioId }) => {
    const config = reproduccionBovinaConfig.tareasAutomaticas;
    const tareas = [];

    if (registro.fechaPartoEstimada && !registro.fechaPartoReal) {
        tareas.push(crearTareaBase({
            registro,
            animal,
            usuarioId,
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
            config: config.proximoCelo,
            fechaProgramada: registro.fechaProximoCelo,
            descripcion: `Próximo celo estimado para ${formatearFecha(registro.fechaProximoCelo)}. Revisar si aplica monta o inseminación.`
        }));
    }

    if (registro.fechaDestete) {
        tareas.push(crearTareaBase({
            registro,
            animal,
            usuarioId,
            config: config.destete,
            fechaProgramada: registro.fechaDestete,
            descripcion: `Destete estimado para ${formatearFecha(registro.fechaDestete)}. Confirmar condición de la cría y de la madre.`
        }));
    }

    return tareas;
};

const sincronizarTareasBovinas = async ({ registro, animal, usuarioId }) => {
    const especie = registro.especie || animal?.especie || 'Bovino';
    const cicloActivo = (registro.estadoCiclo || 'Activo') === 'Activo' && registro.activoParaAlertas !== false;

    if (especie !== 'Bovino' || !usuarioId || !cicloActivo) {
        return { creadas: 0, actualizadas: 0, canceladas: 0 };
    }

    const definiciones = crearDefinicionesTareasBovinas({ registro, animal, usuarioId });
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
            await Tarea.create(definicion);
            creadas += 1;
            continue;
        }

        if (existente.estado === 'Pendiente') {
            Object.assign(existente, definicion);
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
    sincronizarTareasBovinas
};
