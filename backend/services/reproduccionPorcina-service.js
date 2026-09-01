const { Tarea } = require('../models/Tarea');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const reproduccionPorcinaConfig = require('../config/reproduccionPorcinaConfig');

const sumarDias = (fecha, dias) => {
    if (!fecha) return null;
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setUTCDate(nuevaFecha.getUTCDate() + dias);
    return nuevaFecha;
};

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
    if (!animal) return 'chancha';
    return animal.diio || animal.identificadorFinca || animal.nombre || 'chancha';
};

const crearTareaBase = ({ registro, animal, usuarioId, clave, titulo, descripcion, tipo, fechaProgramada, prioridad = 'Media', categoriaAutomatica, generaBitacora = false, tipoEventoBitacora }) => ({
    titulo,
    descripcion,
    tipo,
    estado: 'Pendiente',
    prioridad,
    fechaProgramada,
    asignadoA: usuarioId,
    creadoPor: usuarioId,
    animal: animal._id || animal,
    moduloOrigen: 'Reproduccion',
    referenciaId: registro._id,
    creadoAutomaticamente: true,
    especie: 'Porcino',
    categoriaAutomatica,
    claveAutomatica: clave,
    generaBitacora,
    tipoEventoBitacora
});

const crearDefinicionesTareasPorcinas = ({ registro, animal, usuarioId }) => {
    const codigo = obtenerCodigoAnimal(animal);
    const ventana = `${formatearFecha(registro.fechaInicioVentanaParto)} a ${formatearFecha(registro.fechaFinVentanaParto)}`;
    const tareasChancha = [
        ['revisar-celo', 'Revisar celo', 'Reproducción', registro.fechaRevisionCelo, 'Reproducción porcina', 'Revisión de celo programada 21 días después de la inseminación/monta.', true, 'Monta'],
        ['desparasitar-antes-parto', 'Desparasitar antes del parto', 'Sanidad', registro.fechaDesparasitacionAntesParto, 'Sanidad porcina', 'Desparasitación programada 30 días antes del parto estimado.', true, 'Sanidad'],
        ['alimento-lactancia', 'Dar alimento de lactancia', 'Alimentación', registro.fechaAlimentoLactancia, 'Alimentación porcina', 'Alimento de lactancia programado 15 días antes del parto estimado.', false, null],
        ['revisar-parto', 'Revisar parto', 'Reproducción', registro.fechaPartoEstimada, 'Reproducción porcina', `Parto estimado. Ventana probable: ${ventana}.`, true, 'Parto']
    ].filter(([, , , fecha]) => Boolean(fecha)).map(([clave, titulo, tipo, fechaProgramada, categoriaAutomatica, descripcion, generaBitacora, tipoEventoBitacora]) => crearTareaBase({
        registro,
        animal,
        usuarioId,
        clave,
        titulo: `${titulo} - ${codigo}`,
        descripcion,
        tipo,
        fechaProgramada,
        categoriaAutomatica,
        generaBitacora,
        tipoEventoBitacora
    }));

    return tareasChancha;
};

const sincronizarTareasPorcinas = async ({ registro, animal, usuarioId }) => {
    const especie = registro.especie || animal?.especie;
    const fechaBase = registro.fechaInseminacion || registro.fechaMonta;

    if (especie !== 'Porcino' || !fechaBase || !usuarioId) {
        return { creadas: 0, actualizadas: 0, canceladas: 0 };
    }

    const definiciones = crearDefinicionesTareasPorcinas({ registro, animal, usuarioId });
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
        { $set: { estado: 'Cancelada' } }
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

const cancelarTareasPorcinas = async (registroId) => {
    const resultado = await Tarea.updateMany(
        {
            moduloOrigen: 'Reproduccion',
            referenciaId: registroId,
            creadoAutomaticamente: true,
            estado: { $in: ['Pendiente', 'En proceso'] }
        },
        { $set: { estado: 'Cancelada' } }
    );

    return resultado.modifiedCount || 0;
};

module.exports = {
    crearDefinicionesTareasPorcinas,
    sincronizarTareasPorcinas,
    cancelarTareasPorcinas
};
