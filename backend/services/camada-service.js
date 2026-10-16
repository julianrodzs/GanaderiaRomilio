const Camada = require('../models/Camada');
const Animal = require('../models/Animal');
const VentaAnimal = require('../models/VentaAnimal');
const { Tarea } = require('../models/Tarea');
const { ejecutarNotificacionSegura, notificarTareaAsignada } = require('./tarea-notificacion-service');
const { upsertEventoAnimal } = require('./eventoAnimal-service');
const { upsertEventoCamada } = require('./eventoCamada-service');
const reproduccionPorcinaConfig = require('../config/reproduccionPorcinaConfig');

const CAMPOS_ENTEROS_CAMADA = Object.freeze([
    'nacidosTotales',
    'nacidosVivos',
    'nacidosMuertos',
    'momias',
    'destetados',
    'muertosPreDestete',
    'criasParaFinca',
    'criasParaVenta',
    'criasParaEngorde'
]);

const errorPoblacionCamada = (mensaje, status = 422, code = 'CAMADA_POPULATION_INVALID') => Object.assign(
    new Error(mensaje),
    { status, code }
);

const validarEnteroNoNegativo = (valor, campo) => {
    const numero = Number(valor ?? 0);
    if (!Number.isInteger(numero) || numero < 0) {
        throw errorPoblacionCamada(`${campo} debe ser un numero entero no negativo.`);
    }
    return numero;
};

const validarCantidadesCamada = (datos = {}) => {
    const normalizados = { ...datos };
    CAMPOS_ENTEROS_CAMADA.forEach((campo) => {
        if (Object.prototype.hasOwnProperty.call(datos, campo)) {
            normalizados[campo] = validarEnteroNoNegativo(datos[campo], campo);
        }
    });

    const vivos = Number(normalizados.nacidosVivos || 0);
    const muertos = Number(normalizados.muertosPreDestete || 0);
    if (muertos > vivos) {
        throw errorPoblacionCamada('Las muertes predestete no pueden superar los nacidos vivos.');
    }
    const totalDestino = Number(normalizados.criasParaFinca || 0)
        + Number(normalizados.criasParaVenta || 0)
        + Number(normalizados.criasParaEngorde || 0);
    if (totalDestino > Math.max(vivos - muertos, 0)) {
        throw errorPoblacionCamada('La distribucion de crias no puede superar la poblacion viva de la camada.');
    }
    return normalizados;
};

const saldoColectivoCamada = (camada = {}) => Math.max(
    Number(camada.nacidosVivos || 0)
        - Number(camada.muertosPreDestete || 0)
        - Number(camada.criasIndividualizadas || 0)
        - Number(camada.criasVendidas || 0),
    0
);

const inicializarControlPoblacionCamada = async (camadaId, session = null) => {
    let camada = await Camada.findById(camadaId).session(session);
    if (!camada) throw errorPoblacionCamada('Camada no encontrada.', 404, 'CAMADA_NOT_FOUND');
    if (camada.controlPoblacionInicializado) return camada;

    const [individualizadas, ventas] = await Promise.all([
        Animal.countDocuments({ camadaOrigen: camada._id }).session(session),
        VentaAnimal.aggregate([
            { $match: { estado: { $ne: 'Anulada' }, 'camadas.camada': camada._id } },
            { $unwind: '$camadas' },
            { $match: { 'camadas.camada': camada._id } },
            { $group: { _id: null, cantidad: { $sum: '$camadas.cantidad' } } }
        ]).session(session)
    ]);

    await Camada.updateOne(
        { _id: camada._id, controlPoblacionInicializado: { $ne: true } },
        {
            $set: {
                criasIndividualizadas: Number(individualizadas || 0),
                criasVendidas: Number(ventas[0]?.cantidad || 0),
                controlPoblacionInicializado: true
            }
        },
        { session }
    );
    camada = await Camada.findById(camada._id).session(session);
    return camada;
};

const expresionSaldoSuficiente = (cantidad) => ({
    $gte: [
        {
            $subtract: [
                {
                    $subtract: [
                        { $ifNull: ['$nacidosVivos', 0] },
                        { $ifNull: ['$muertosPreDestete', 0] }
                    ]
                },
                {
                    $add: [
                        { $ifNull: ['$criasIndividualizadas', 0] },
                        { $ifNull: ['$criasVendidas', 0] }
                    ]
                }
            ]
        },
        cantidad
    ]
});

const reservarCriasCamada = async ({ camadaId, cantidad = 1, destino, session = null }) => {
    const unidades = validarEnteroNoNegativo(cantidad, 'cantidad');
    if (unidades === 0) return inicializarControlPoblacionCamada(camadaId, session);
    if (!['individualizacion', 'venta'].includes(destino)) {
        throw errorPoblacionCamada('Destino de reserva de camada no valido.');
    }
    await inicializarControlPoblacionCamada(camadaId, session);
    const campo = destino === 'individualizacion' ? 'criasIndividualizadas' : 'criasVendidas';
    const condiciones = [expresionSaldoSuficiente(unidades)];
    if (destino === 'venta') {
        condiciones.push({
            $gte: [
                { $subtract: [{ $ifNull: ['$criasParaVenta', 0] }, { $ifNull: ['$criasVendidas', 0] }] },
                unidades
            ]
        });
    }
    const actualizada = await Camada.findOneAndUpdate(
        {
            _id: camadaId,
            estado: { $ne: 'Cancelada' },
            controlPoblacionInicializado: true,
            $expr: condiciones.length === 1 ? condiciones[0] : { $and: condiciones }
        },
        { $inc: { [campo]: unidades } },
        { new: true, runValidators: true, session }
    );
    if (!actualizada) {
        throw errorPoblacionCamada('La camada no tiene suficientes crias vivas disponibles.', 409, 'CAMADA_STOCK_INSUFICIENTE');
    }
    return actualizada;
};

const liberarCriasCamada = async ({ camadaId, cantidad = 1, destino, session = null }) => {
    const unidades = validarEnteroNoNegativo(cantidad, 'cantidad');
    if (unidades === 0) return Camada.findById(camadaId).session(session);
    const campo = destino === 'individualizacion' ? 'criasIndividualizadas' : 'criasVendidas';
    const actualizada = await Camada.findOneAndUpdate(
        { _id: camadaId, [campo]: { $gte: unidades } },
        { $inc: { [campo]: -unidades } },
        { new: true, runValidators: true, session }
    );
    if (!actualizada) {
        throw errorPoblacionCamada('No se pudo conciliar el saldo de la camada.', 409, 'CAMADA_BALANCE_CONFLICT');
    }
    return actualizada;
};

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

const crearDefinicionTarea = ({ camada, madre, usuarioId, asignadoA, clave, titulo, descripcion, tipo, fechaProgramada, categoriaAutomatica, generaBitacora = false, tipoEventoBitacora }) => ({
    titulo: `${titulo} - ${camada.codigoCamada}`,
    descripcion,
    tipo,
    estado: 'Pendiente',
    prioridad: 'Media',
    fechaProgramada,
    asignadoA,
    creadoPor: usuarioId,
    animal: madre._id || madre,
    moduloOrigen: 'Reproduccion',
    referenciaId: camada._id,
    creadoAutomaticamente: true,
    especie: 'Porcino',
    categoriaAutomatica,
    claveAutomatica: `camada-${clave}`,
    generaBitacora,
    tipoEventoBitacora
});

const crearDefinicionesTareasCamada = ({ camada, madre, usuarioId }) => {
    const fechas = calcularFechasCamada(camada);
    const asignadoA = camada.asignadoA?._id || camada.asignadoA;
    const destino = camada.destino || 'No definido';
    const codigoMadre = obtenerCodigoMadre(madre);
    const totalDistribuido = (camada.criasParaFinca || 0) + (camada.criasParaVenta || 0) + (camada.criasParaEngorde || 0);
    const mixtoSinDistribucion = destino === 'Mixto' && totalDistribuido === 0;
    const manejarComoFinca = destino === 'Se quedan' || (destino === 'Mixto' && (mixtoSinDistribucion || (camada.criasParaFinca || 0) > 0));
    const manejarComoVenta = destino === 'Se venden' || (destino === 'Mixto' && (mixtoSinDistribucion || (camada.criasParaVenta || 0) > 0));
    const manejarComoEngorde = destino === 'Engorde' || (destino === 'Mixto' && (mixtoSinDistribucion || (camada.criasParaEngorde || 0) > 0));
    const base = [
        ['hierro', 'Aplicar hierro a crías', 'Sanidad', fechas.fechaHierro, 'Sanidad porcina', true, 'Tratamiento'],
        ['vitamina-desparasitacion', 'Vitaminizar y desparasitar crías', 'Sanidad', fechas.fechaVitaminaDesparasitacion, 'Sanidad porcina', true, 'Sanidad'],
        ['destete', 'Destetar camada', 'Reproducción', fechas.fechaDesteteEstimada, 'Crías porcinas', true, 'Destete'],
        ['desparasitar-destete', 'Desparasitar en el destete', 'Sanidad', fechas.fechaDesteteEstimada, 'Sanidad porcina', true, 'Sanidad'],
        ['vitamina-selenio-destete', 'Aplicar vitamina con selenio', 'Sanidad', fechas.fechaDesteteEstimada, 'Sanidad porcina', true, 'Tratamiento'],
        ['nueva-inseminacion-madre', 'Nueva inseminación/monta de la madre', 'Reproducción', fechas.fechaNuevaInseminacionMadre, 'Reproducción porcina', false, null],
        ['revisar-celo-posterior-madre', 'Revisar celo posterior de la madre', 'Reproducción', fechas.fechaRevisionCeloPosteriorMadre, 'Reproducción porcina', false, null]
    ];
    const porDestino = [];

    if (manejarComoFinca || manejarComoEngorde) {
        porDestino.push(
            ['alimento-inicio', 'Dar alimento inicio a crías', 'Alimentación', fechas.fechaAlimentoInicio, 'Alimentación porcina', false, null],
            ['alimento-desarrollo', 'Dar alimento de desarrollo a crías', 'Alimentación', fechas.fechaAlimentoDesarrollo, 'Alimentación porcina', false, null],
            ['alimento-engorde', 'Dar alimento de engorde a crías', 'Alimentación', fechas.fechaAlimentoEngorde, 'Alimentación porcina', false, null]
        );
    }

    if (manejarComoFinca) {
        porDestino.push(
            ['circovirus', 'Aplicar circovirus porcino', 'Sanidad', fechas.fechaCircovirus, 'Sanidad porcina', true, 'Sanidad'],
            ['primera-monta', 'Primera inseminación/monta de crías', 'Reproducción', fechas.fechaPrimeraMonta, 'Crías porcinas', true, 'Monta']
        );
    }

    if (manejarComoVenta) {
        porDestino.push(['venta', 'Vender crías', 'Venta', fechas.fechaVentaEstimada || sumarDias(camada.fechaNacimiento, 30), 'Crías porcinas', true, 'Venta']);
    }

    if (manejarComoEngorde) {
        porDestino.push(['sacrificio', 'Sacrificio de cerdos de engorde', 'Sacrificio', fechas.fechaSacrificioEstimada || sumarDias(camada.fechaNacimiento, 270), 'Crías porcinas', true, 'Sacrificio']);
    }

    return [...base, ...porDestino]
        .filter(([, , , fecha]) => Boolean(fecha))
        .map(([clave, titulo, tipo, fechaProgramada, categoriaAutomatica, generaBitacora, tipoEventoBitacora]) => crearDefinicionTarea({
            camada,
            madre,
            usuarioId,
            asignadoA,
            clave,
            titulo,
            descripcion: `${titulo} de la camada ${camada.codigoCamada}, madre ${codigoMadre}. Fecha base de nacimiento: ${formatearFecha(camada.fechaNacimiento)}.`,
            tipo,
            fechaProgramada,
            categoriaAutomatica,
            generaBitacora,
            tipoEventoBitacora
        }));
};

const sincronizarTareasCamada = async ({ camada, madre, usuarioId }) => {
    if (!usuarioId || !camada.asignadoA || !madre || ['Cancelada', 'Cerrada', 'Vendida'].includes(camada.estado)) {
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
    const descripcionEvento = descripcion || `Camada ${camada.codigoCamada} registrada con ${camada.nacidosVivos || 0} nacidos vivos.`;

    await upsertEventoAnimal({
        animal: madre._id || madre,
        tipoEvento: 'Parto',
        fecha: camada.fechaNacimiento,
        titulo,
        descripcion: descripcionEvento,
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

    await upsertEventoCamada({
        camada: camada._id,
        tipoEvento: 'Camada registrada',
        fecha: camada.fechaNacimiento,
        titulo,
        descripcion: descripcionEvento,
        moduloOrigen: 'Camadas',
        referenciaId: camada._id,
        creadoPor: usuarioId,
        metadata: {
            madre: madre._id || madre,
            codigoCamada: camada.codigoCamada,
            nacidosTotales: camada.nacidosTotales,
            nacidosVivos: camada.nacidosVivos,
            nacidosMuertos: camada.nacidosMuertos,
            destino: camada.destino
        }
    });
};

module.exports = {
    CAMPOS_ENTEROS_CAMADA,
    generarCodigoCamada,
    calcularFechasCamada,
    inicializarControlPoblacionCamada,
    liberarCriasCamada,
    reservarCriasCamada,
    saldoColectivoCamada,
    sincronizarTareasCamada,
    cancelarTareasCamada,
    completarTareasDesteteCamada,
    cancelarTareasEstimadasDelRegistro,
    registrarEventoCamada,
    validarCantidadesCamada,
    validarEnteroNoNegativo
};
