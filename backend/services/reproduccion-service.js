const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { Tarea } = require('../models/Tarea');
const { upsertEventoAnimal } = require('./eventoAnimal-service');

const ESTADOS_CIERRE = ['Cerrado', 'Cancelado', 'No preñada'];

const obtenerCicloActivoPorAnimal = (animalId, excluirId = null) => {
    const filtro = {
        animal: animalId,
        $and: [
            { $or: [{ estadoCiclo: 'Activo' }, { estadoCiclo: { $exists: false } }] },
            { $or: [{ activoParaAlertas: true }, { activoParaAlertas: { $exists: false } }] }
        ]
    };

    if (excluirId) {
        filtro._id = { $ne: excluirId };
    }

    return RegistroReproductivo.findOne(filtro).populate('animal');
};

const cancelarTareasAutomaticasDelCiclo = async (cicloId, motivo = 'Cancelada por cierre de ciclo reproductivo') => {
    const resultado = await Tarea.updateMany(
        {
            moduloOrigen: 'Reproduccion',
            referenciaId: cicloId,
            creadoAutomaticamente: true,
            estado: { $in: ['Pendiente', 'En proceso'] }
        },
        {
            $set: {
                estado: 'Cancelada',
                observaciones: motivo
            }
        }
    );

    return resultado.modifiedCount || 0;
};

const eliminarTareasAutomaticasPendientesDelCiclo = async (cicloId) => {
    const resultado = await Tarea.deleteMany({
        moduloOrigen: 'Reproduccion',
        referenciaId: cicloId,
        creadoAutomaticamente: true,
        estado: 'Pendiente'
    });

    return resultado.deletedCount || 0;
};

const registrarEventoCierre = async ({ ciclo, estadoCiclo, motivo, usuarioId }) => {
    if (!ciclo?.animal) return;

    const animalId = typeof ciclo.animal === 'object' ? ciclo.animal._id : ciclo.animal;
    const tituloPorEstado = {
        Cerrado: 'Ciclo reproductivo cerrado',
        Cancelado: 'Ciclo reproductivo cancelado',
        'No preñada': 'Ciclo reproductivo marcado como no preñada'
    };
    const descripcionPorEstado = {
        Cerrado: motivo || 'Ciclo reproductivo finalizado.',
        Cancelado: motivo || 'Ciclo reproductivo cancelado.',
        'No preñada': motivo || 'El ciclo reproductivo fue cerrado porque el animal no quedó preñado.'
    };

    await upsertEventoAnimal({
        animal: animalId,
        tipoEvento: estadoCiclo === 'No preñada' ? 'Diagnostico de gestacion' : 'Observacion',
        fecha: new Date(),
        titulo: tituloPorEstado[estadoCiclo],
        descripcion: descripcionPorEstado[estadoCiclo],
        moduloOrigen: 'Reproduccion',
        referenciaId: ciclo._id,
        creadoPor: usuarioId,
        metadata: {
            estadoCiclo,
            motivoCierre: motivo,
            fechaCierre: new Date()
        }
    });
};

const cambiarEstadoCiclo = async ({ cicloId, estadoCiclo, motivo, usuarioId }) => {
    if (!ESTADOS_CIERRE.includes(estadoCiclo)) {
        throw new Error('Estado de ciclo no válido');
    }

    const ciclo = await RegistroReproductivo.findById(cicloId);

    if (!ciclo) {
        const error = new Error('Registro reproductivo no encontrado');
        error.status = 404;
        throw error;
    }

    ciclo.estadoCiclo = estadoCiclo;
    ciclo.activoParaAlertas = false;
    ciclo.fechaCierre = new Date();
    ciclo.motivoCierre = motivo || (
        estadoCiclo === 'Cerrado'
            ? 'Ciclo reproductivo finalizado'
            : `Ciclo reproductivo marcado como ${estadoCiclo}`
    );

    const cicloGuardado = await ciclo.save();
    await cancelarTareasAutomaticasDelCiclo(cicloGuardado._id, cicloGuardado.motivoCierre);
    await registrarEventoCierre({ ciclo: cicloGuardado, estadoCiclo, motivo: cicloGuardado.motivoCierre, usuarioId });

    return cicloGuardado;
};

const cerrarCicloReproductivo = (cicloId, motivo, usuarioId) => cambiarEstadoCiclo({
    cicloId,
    estadoCiclo: 'Cerrado',
    motivo: motivo || 'Ciclo reproductivo finalizado',
    usuarioId
});

const cancelarCicloReproductivo = (cicloId, motivo, usuarioId) => cambiarEstadoCiclo({
    cicloId,
    estadoCiclo: 'Cancelado',
    motivo: motivo || 'Ciclo reproductivo cancelado',
    usuarioId
});

const marcarCicloNoPrenada = (cicloId, motivo, usuarioId) => cambiarEstadoCiclo({
    cicloId,
    estadoCiclo: 'No preñada',
    motivo: motivo || 'El ciclo reproductivo fue cerrado porque el animal no quedó preñado.',
    usuarioId
});

const crearNuevoCicloReproductivo = async ({ data, animal, usuarioId, cerrarCicloAnterior = false }) => {
    const cicloActivo = await obtenerCicloActivoPorAnimal(animal._id);

    if (cicloActivo && !cerrarCicloAnterior) {
        const error = new Error('El animal ya tiene un ciclo reproductivo activo');
        error.status = 409;
        error.cicloActivo = cicloActivo;
        throw error;
    }

    if (cicloActivo && cerrarCicloAnterior) {
        await cambiarEstadoCiclo({
            cicloId: cicloActivo._id,
            estadoCiclo: 'Cerrado',
            motivo: 'Cerrado automáticamente por creación de nuevo ciclo reproductivo',
            usuarioId
        });
    }

    return new RegistroReproductivo({
        ...data,
        animal: animal._id,
        especie: animal.especie || data.especie || 'Bovino',
        estadoCiclo: 'Activo',
        activoParaAlertas: true
    }).save();
};

module.exports = {
    obtenerCicloActivoPorAnimal,
    cerrarCicloReproductivo,
    cancelarCicloReproductivo,
    marcarCicloNoPrenada,
    cancelarTareasAutomaticasDelCiclo,
    eliminarTareasAutomaticasPendientesDelCiclo,
    crearNuevoCicloReproductivo
};
