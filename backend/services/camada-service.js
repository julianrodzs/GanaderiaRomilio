const Camada = require('../models/Camada');
const { Tarea } = require('../models/Tarea');
const { upsertEventoAnimal } = require('./eventoAnimal-service');
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

const obtenerCodigoMadre = (madre) => madre?.diio || madre?.identificadorFinca || madre?.nombre || 'chancha';

const generarCodigoCamada = async (fechaNacimiento) => {
    const fecha = new Date(fechaNacimiento || new Date());
    const anio = fecha.getUTCFullYear();
    const totalAnio = await Camada.countDocuments({
        fechaNacimiento: {
            $gte: new Date(Date.UTC(anio, 0, 1)),
            $lte: new Date(Date.UTC(anio, 11, 31, 23, 59, 59, 999))
        }
    });

    return `CAM-${anio}-${String(totalAnio + 1).padStart(3, '0')}`;
};

const calcularFechasCamada = (datos) => {
    const fechaNacimiento = datos.fechaNacimiento;
    const destino = datos.destino || 'No definido';
    const fechaDesteteEstimada = datos.fechaDesteteEstimada || sumarDias(fechaNacimiento, reproduccionPorcinaConfig.diasDestetePostParto);
    const fechaBasePostDestete = datos.fechaDesteteReal || fechaDesteteEstimada;
    const fechaNuevaInseminacionMadre = sumarDias(fechaBasePostDestete, reproduccionPorcinaConfig.diasNuevaMontaPostDestete);

    return {
        fechaDesteteEstimada,
        fechaHierro: sumarDias(fechaNacimiento, 3),
        fechaVitaminaDesparasitacion: sumarDias(fechaNacimiento, 8),
        fechaAlimentoInicio: ['Se quedan', 'Engorde', 'Mixto'].includes(destino) ? sumarDias(fechaNacimiento, 15) : null,
        fechaCircovirus: ['Se quedan', 'Mixto'].includes(destino) ? sumarDias(fechaNacimiento, 21) : null,
        fechaAlimentoDesarrollo: ['Se quedan', 'Engorde', 'Mixto'].includes(destino) ? sumarDias(fechaNacimiento, 60) : null,
        fechaAlimentoEngorde: ['Se quedan', 'Engorde', 'Mixto'].includes(destino) ? sumarDias(fechaNacimiento, 123) : null,
        fechaVentaEstimada: destino === 'Se venden' ? sumarDias(fechaNacimiento, 30) : null,
        fechaSacrificioEstimada: destino === 'Engorde' ? sumarDias(fechaNacimiento, 270) : null,
        fechaPrimeraMonta: ['Se quedan', 'Mixto'].includes(destino) ? sumarDias(fechaNacimiento, 270) : null,
        fechaNuevaInseminacionMadre,
        fechaRevisionCeloPosteriorMadre: sumarDias(fechaNuevaInseminacionMadre, reproduccionPorcinaConfig.diasRevisionCeloPostNuevaMonta)
    };
};

const crearDefinicionTarea = ({ camada, madre, usuarioId, clave, titulo, descripcion, tipo, fechaProgramada, categoriaAutomatica }) => ({
    titulo: `${titulo} - ${camada.codigoCamada}`,
    descripcion,
    tipo,
    estado: 'Pendiente',
    prioridad: 'Media',
    fechaProgramada,
    asignadoA: usuarioId,
    creadoPor: usuarioId,
    animal: madre._id || madre,
    moduloOrigen: 'Reproduccion',
    referenciaId: camada._id,
    creadoAutomaticamente: true,
    especie: 'Porcino',
    categoriaAutomatica,
    claveAutomatica: `camada-${clave}`
});

const crearDefinicionesTareasCamada = ({ camada, madre, usuarioId }) => {
    const fechas = calcularFechasCamada(camada);
    const destino = camada.destino || 'No definido';
    const codigoMadre = obtenerCodigoMadre(madre);
    const totalDistribuido = (camada.criasParaFinca || 0) + (camada.criasParaVenta || 0) + (camada.criasParaEngorde || 0);
    const mixtoSinDistribucion = destino === 'Mixto' && totalDistribuido === 0;
    const manejarComoFinca = destino === 'Se quedan' || (destino === 'Mixto' && (mixtoSinDistribucion || (camada.criasParaFinca || 0) > 0));
    const manejarComoVenta = destino === 'Se venden' || (destino === 'Mixto' && (mixtoSinDistribucion || (camada.criasParaVenta || 0) > 0));
    const manejarComoEngorde = destino === 'Engorde' || (destino === 'Mixto' && (mixtoSinDistribucion || (camada.criasParaEngorde || 0) > 0));
    const base = [
        ['hierro', 'Aplicar hierro a crías', 'Sanidad', fechas.fechaHierro, 'Sanidad porcina'],
        ['vitamina-desparasitacion', 'Vitaminizar y desparasitar crías', 'Sanidad', fechas.fechaVitaminaDesparasitacion, 'Sanidad porcina'],
        ['destete', 'Destetar camada', 'Reproducción', fechas.fechaDesteteEstimada, 'Crías porcinas'],
        ['desparasitar-destete', 'Desparasitar en el destete', 'Sanidad', fechas.fechaDesteteEstimada, 'Sanidad porcina'],
        ['vitamina-selenio-destete', 'Aplicar vitamina con selenio', 'Sanidad', fechas.fechaDesteteEstimada, 'Sanidad porcina'],
        ['nueva-inseminacion-madre', 'Nueva inseminación/monta de la madre', 'Reproducción', fechas.fechaNuevaInseminacionMadre, 'Reproducción porcina'],
        ['revisar-celo-posterior-madre', 'Revisar celo posterior de la madre', 'Reproducción', fechas.fechaRevisionCeloPosteriorMadre, 'Reproducción porcina']
    ];
    const porDestino = [];

    if (manejarComoFinca || manejarComoEngorde) {
        porDestino.push(
            ['alimento-inicio', 'Dar alimento inicio a crías', 'Alimentación', fechas.fechaAlimentoInicio, 'Alimentación porcina'],
            ['alimento-desarrollo', 'Dar alimento de desarrollo a crías', 'Alimentación', fechas.fechaAlimentoDesarrollo, 'Alimentación porcina'],
            ['alimento-engorde', 'Dar alimento de engorde a crías', 'Alimentación', fechas.fechaAlimentoEngorde, 'Alimentación porcina']
        );
    }

    if (manejarComoFinca) {
        porDestino.push(
            ['circovirus', 'Aplicar circovirus porcino', 'Sanidad', fechas.fechaCircovirus, 'Sanidad porcina'],
            ['primera-monta', 'Primera inseminación/monta de crías', 'Reproducción', fechas.fechaPrimeraMonta, 'Crías porcinas']
        );
    }

    if (manejarComoVenta) {
        porDestino.push(['venta', 'Vender crías', 'Venta', fechas.fechaVentaEstimada || sumarDias(camada.fechaNacimiento, 30), 'Crías porcinas']);
    }

    if (manejarComoEngorde) {
        porDestino.push(['sacrificio', 'Sacrificio de cerdos de engorde', 'Sacrificio', fechas.fechaSacrificioEstimada || sumarDias(camada.fechaNacimiento, 270), 'Crías porcinas']);
    }

    return [...base, ...porDestino]
        .filter(([, , , fecha]) => Boolean(fecha))
        .map(([clave, titulo, tipo, fechaProgramada, categoriaAutomatica]) => crearDefinicionTarea({
            camada,
            madre,
            usuarioId,
            clave,
            titulo,
            descripcion: `${titulo} de la camada ${camada.codigoCamada}, madre ${codigoMadre}. Fecha base de nacimiento: ${formatearFecha(camada.fechaNacimiento)}.`,
            tipo,
            fechaProgramada,
            categoriaAutomatica
        }));
};

const sincronizarTareasCamada = async ({ camada, madre, usuarioId }) => {
    if (!usuarioId || !madre || ['Cancelada', 'Cerrada', 'Vendida'].includes(camada.estado)) {
        return { creadas: 0, actualizadas: 0, canceladas: 0 };
    }

    const definiciones = crearDefinicionesTareasCamada({ camada, madre, usuarioId });
    const clavesVigentes = definiciones.map((tarea) => tarea.claveAutomatica);
    const existentes = await Tarea.find({
        moduloOrigen: 'Reproduccion',
        referenciaId: camada._id,
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

    const canceladas = await Tarea.updateMany(
        {
            moduloOrigen: 'Reproduccion',
            referenciaId: camada._id,
            creadoAutomaticamente: true,
            claveAutomatica: { $nin: clavesVigentes },
            estado: { $in: ['Pendiente', 'En proceso'] }
        },
        { $set: { estado: 'Cancelada', observaciones: 'Cancelada por cambio de camada.' } }
    );
    const tareasGeneradas = await Tarea.find({
        moduloOrigen: 'Reproduccion',
        referenciaId: camada._id,
        creadoAutomaticamente: true
    }).select('_id claveAutomatica');

    await Camada.updateOne(
        { _id: camada._id },
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
        canceladas: canceladas.modifiedCount || 0
    };
};

const cancelarTareasCamada = (camadaId, motivo = 'Cancelada por cierre de camada.') => Tarea.updateMany(
    {
        moduloOrigen: 'Reproduccion',
        referenciaId: camadaId,
        creadoAutomaticamente: true,
        estado: { $in: ['Pendiente', 'En proceso'] }
    },
    { $set: { estado: 'Cancelada', observaciones: motivo } }
);

const completarTareasDesteteCamada = (camadaId, fechaCompletada = new Date()) => Tarea.updateMany(
    {
        moduloOrigen: 'Reproduccion',
        referenciaId: camadaId,
        creadoAutomaticamente: true,
        estado: { $in: ['Pendiente', 'En proceso'] },
        claveAutomatica: {
            $in: [
                'camada-destete',
                'camada-desparasitar-destete',
                'camada-vitamina-selenio-destete'
            ]
        }
    },
    {
        $set: {
            estado: 'Completada',
            fechaCompletada,
            observaciones: 'Completada automáticamente al registrar el destete real de la camada.'
        }
    }
);

const cancelarTareasEstimadasDelRegistro = (registroId) => {
    if (!registroId) return Promise.resolve({ modifiedCount: 0 });

    return Tarea.updateMany(
        {
            moduloOrigen: 'Reproduccion',
            referenciaId: registroId,
            creadoAutomaticamente: true,
            estado: { $in: ['Pendiente', 'En proceso'] },
            claveAutomatica: {
                $in: [
                    'destetar',
                    'desparasitar-destete',
                    'vitamina-selenio',
                    'nueva-inseminacion',
                    'revisar-celo-posterior',
                    'crias-hierro',
                    'crias-vitamina-desparasitacion',
                    'crias-alimento-inicio',
                    'crias-circovirus',
                    'crias-alimento-desarrollo',
                    'crias-alimento-engorde',
                    'crias-primera-monta',
                    'crias-vender',
                    'crias-sacrificio'
                ]
            }
        },
        {
            $set: {
                estado: 'Cancelada',
                observaciones: 'Cancelada porque las tareas de crías ahora se generan desde la camada registrada.'
            }
        }
    );
};

const registrarEventoCamada = async ({ camada, madre, usuarioId, titulo = 'Camada registrada', descripcion }) => {
    await upsertEventoAnimal({
        animal: madre._id || madre,
        tipoEvento: 'Parto',
        fecha: camada.fechaNacimiento,
        titulo,
        descripcion: descripcion || `Camada ${camada.codigoCamada} registrada con ${camada.nacidosVivos || 0} nacidos vivos.`,
        moduloOrigen: 'Reproduccion',
        referenciaId: camada._id,
        creadoPor: usuarioId,
        metadata: {
            camada: camada._id,
            codigoCamada: camada.codigoCamada,
            nacidosTotales: camada.nacidosTotales,
            nacidosVivos: camada.nacidosVivos,
            nacidosMuertos: camada.nacidosMuertos,
            destino: camada.destino
        }
    });
};

module.exports = {
    generarCodigoCamada,
    calcularFechasCamada,
    sincronizarTareasCamada,
    cancelarTareasCamada,
    completarTareasDesteteCamada,
    cancelarTareasEstimadasDelRegistro,
    registrarEventoCamada
};
