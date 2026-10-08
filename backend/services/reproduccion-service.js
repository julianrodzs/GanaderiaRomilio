const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { Tarea } = require('../models/Tarea');
const EventoAnimal = require('../models/EventoAnimal');
const { sincronizarTareasBovinas } = require('./reproduccionBovina-service');
const { sincronizarTareasPorcinas } = require('./reproduccionPorcina-service');

const ESTADOS_CIERRE = ['Cerrado', 'Cancelado', 'No preñada'];
const CANCELACION_POR_CIERRE = 'CIERRE_CICLO_REPRODUCTIVO';

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

const cancelarTareasAutomaticasDelCiclo = async (cicloId, motivo = 'Cancelada por cierre de ciclo reproductivo', origen = 'SINCRONIZACION_REPRODUCTIVA') => {
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
                observaciones: motivo,
                cancelacionAutomaticaOrigen: origen,
                canceladaAutomaticamenteEn: new Date()
            }
        }
    );

    return resultado.modifiedCount || 0;
};

const reactivarTareasCerradasDelCiclo = async (ciclo) => {
    const resultado = await Tarea.updateMany(
        {
            moduloOrigen: 'Reproduccion',
            referenciaId: ciclo._id,
            creadoAutomaticamente: true,
            estado: 'Cancelada',
            $or: [
                { cancelacionAutomaticaOrigen: CANCELACION_POR_CIERRE },
                {
                    cancelacionAutomaticaOrigen: { $exists: false },
                    observaciones: ciclo.motivoCierre
                }
            ]
        },
        {
            $set: { estado: 'Pendiente' },
            $unset: {
                fechaCompletada: '',
                observaciones: '',
                cancelacionAutomaticaOrigen: '',
                canceladaAutomaticamenteEn: ''
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

    await EventoAnimal.create({
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

    const ciclo = await RegistroReproductivo.findById(cicloId).populate('animal');

    if (!ciclo) {
        const error = new Error('Registro reproductivo no encontrado');
        error.status = 404;
        throw error;
    }

    if (ciclo.estadoCiclo === estadoCiclo && ciclo.activoParaAlertas === false) return ciclo;

    ciclo.estadoCiclo = estadoCiclo;
    ciclo.activoParaAlertas = false;
    ciclo.fechaCierre = new Date();
    ciclo.motivoCierre = motivo || (
        estadoCiclo === 'Cerrado'
            ? 'Ciclo reproductivo finalizado'
            : `Ciclo reproductivo marcado como ${estadoCiclo}`
    );

    const cicloGuardado = await ciclo.save();
    const cierreBovinoConParto = estadoCiclo === 'Cerrado'
        && (cicloGuardado.especie || cicloGuardado.animal?.especie || 'Bovino') === 'Bovino'
        && Boolean(cicloGuardado.fechaPartoReal);

    if (cierreBovinoConParto) {
        await sincronizarTareasBovinas({
            registro: cicloGuardado,
            animal: cicloGuardado.animal,
            usuarioId
        });
    } else {
        await cancelarTareasAutomaticasDelCiclo(
            cicloGuardado._id,
            cicloGuardado.motivoCierre,
            estadoCiclo === 'Cerrado' ? CANCELACION_POR_CIERRE : `CIERRE_CICLO_${estadoCiclo.toUpperCase().replaceAll(' ', '_')}`
        );
    }
    await registrarEventoCierre({ ciclo: cicloGuardado, estadoCiclo, motivo: cicloGuardado.motivoCierre, usuarioId });

    return cicloGuardado;
};

const reabrirCicloReproductivo = async ({ cicloId, motivo, usuarioId }) => {
    const ciclo = await RegistroReproductivo.findById(cicloId).populate('animal');
    if (!ciclo) {
        const error = new Error('Registro reproductivo no encontrado');
        error.status = 404;
        throw error;
    }
    if ((ciclo.estadoCiclo || 'Activo') === 'Activo' && ciclo.activoParaAlertas !== false) return ciclo;
    if (ciclo.estadoCiclo !== 'Cerrado') {
        const error = new Error('Solo se puede reabrir un ciclo que fue cerrado. Los ciclos cancelados o no preñados conservan su cierre clínico.');
        error.status = 409;
        throw error;
    }

    const otroActivo = await obtenerCicloActivoPorAnimal(ciclo.animal._id, ciclo._id);
    if (otroActivo) {
        const error = new Error('No se puede reabrir porque el animal ya tiene otro ciclo reproductivo activo.');
        error.status = 409;
        throw error;
    }

    const motivoCierreAnterior = ciclo.motivoCierre;
    const tareasReactivadas = await reactivarTareasCerradasDelCiclo(ciclo);
    ciclo.estadoCiclo = 'Activo';
    ciclo.activoParaAlertas = true;
    ciclo.fechaCierre = undefined;
    ciclo.motivoCierre = undefined;
    const cicloGuardado = await ciclo.save();
    const especie = cicloGuardado.especie || cicloGuardado.animal?.especie || 'Bovino';

    if (especie === 'Porcino') {
        await sincronizarTareasPorcinas({ registro: cicloGuardado, animal: cicloGuardado.animal, usuarioId });
    } else {
        await sincronizarTareasBovinas({ registro: cicloGuardado, animal: cicloGuardado.animal, usuarioId });
    }

    await EventoAnimal.create({
        animal: cicloGuardado.animal._id,
        tipoEvento: 'Observacion',
        fecha: new Date(),
        titulo: 'Ciclo reproductivo reabierto',
        descripcion: motivo || 'Se reabrió el ciclo reproductivo y se recalcularon sus tareas pendientes.',
        moduloOrigen: 'Reproduccion',
        referenciaId: cicloGuardado._id,
        creadoPor: usuarioId,
        metadata: { motivo, motivoCierreAnterior, tareasReactivadas }
    });

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
    reactivarTareasCerradasDelCiclo,
    reabrirCicloReproductivo,
    eliminarTareasAutomaticasPendientesDelCiclo,
    crearNuevoCicloReproductivo
};
