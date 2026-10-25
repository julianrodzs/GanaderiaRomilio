const Animal = require('../models/Animal');
const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');
const AsignacionPlanAlimentacion = require('../models/AsignacionPlanAlimentacion');
const HistorialEtapaLote = require('../models/HistorialEtapaLote');
const EventoLote = require('../models/EventoLote');
const Pesaje = require('../models/Pesaje');
const RotacionPotrero = require('../models/RotacionPotrero');
const Potrero = require('../models/Potrero');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const { Tarea } = require('../models/Tarea');
const AsignacionRacionLote = require('../models/AsignacionRacionLote');
const SuministroAlimentacion = require('../models/SuministroAlimentacion');
const CicloEngorde = require('../models/CicloEngorde');
const { calcularGmd } = require('./indicesProductivos-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');
const { diasHastaTarea, limpiarDatosTarea, validarRelacionesTarea } = require('./tarea-integridad-service');
const { upsertEventoAnimal } = require('./eventoAnimal-service');
const { ETAPAS_LOTE, OBJETIVO_POR_PROPOSITO, PROPOSITOS_LOTE, normalizarPropositoLote, propositoCompatibleConObjetivo } = require('../config/lotes');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');
const { validarDestinoPastoreo } = require('./potrero-integridad-service');
const { fechaCivilEnZonaAUTC } = require('./fechaZonaHoraria-service');
const {
    actualizarPesoActualAnimal,
    registrarEventoPesaje,
    sanitizarPesaje,
    sanitizarPesajeMasivo,
    validarAnimalesUnicos,
    validarDatosPesaje
} = require('./pesaje-integridad-service');

const crearError = (mensaje, status = 400, codigo) => Object.assign(new Error(mensaje), { status, codigo });
const MS_DIA = 24 * 60 * 60 * 1000;
const redondear = (valor, decimales = 2) => Number.isFinite(valor) ? Number(valor.toFixed(decimales)) : null;
const ABREVIATURAS_PROPOSITO = Object.freeze({
    ENGORDE: 'ENG',
    REPRODUCCION: 'REP',
    REEMPLAZO: 'REE',
    DESTETE: 'DES',
    CUARENTENA: 'CUA',
    VENTA: 'VEN',
    OTRO: 'OTR'
});

const normalizarFechaOperacion = (valor, zonaHoraria = 'America/Costa_Rica') => {
    if (!valor) return new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
        const [year, month, day] = String(valor).split('-').map(Number);
        return fechaCivilEnZonaAUTC({ year, month, day }, zonaHoraria);
    }
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) throw crearError('La fecha indicada no es válida.', 400, 'FECHA_INVALIDA');
    return fecha;
};

const validarFechaEntre = (fecha, minimo, maximo = new Date(), codigo = 'FECHA_OPERACION_INVALIDA') => {
    if (minimo && fecha < new Date(minimo)) throw crearError('La fecha no puede ser anterior al inicio del lote.', 400, codigo);
    if (maximo && fecha > new Date(maximo)) throw crearError('La fecha efectiva no puede estar en el futuro.', 400, codigo);
};

const construirPrefijoCodigoLote = (especie, proposito, fecha = new Date()) => {
    const fechaValida = new Date(fecha);
    const anio = Number.isNaN(fechaValida.getTime()) ? new Date().getFullYear() : fechaValida.getFullYear();
    const especieCodigo = especie === 'Porcino' ? 'POR' : 'BOV';
    return `${especieCodigo}-${ABREVIATURAS_PROPOSITO[proposito] || 'OTR'}-${anio}`;
};

const crearLoteRapido = async ({ nombre, especie, proposito, fechaInicio }, usuarioId, opciones = {}) => {
    const { session } = opciones;
    const nombreLimpio = String(nombre || '').trim();
    const propositoNormalizado = normalizarPropositoLote(proposito);
    if (!nombreLimpio) throw crearError('Indica el nombre del lote.');
    if (!['Bovino', 'Porcino'].includes(especie)) throw crearError('La especie del lote no es válida.');
    if (!propositoNormalizado || !PROPOSITOS_LOTE.includes(propositoNormalizado)) throw crearError('El objetivo del lote no es válido.');

    const prefijo = construirPrefijoCodigoLote(especie, propositoNormalizado, fechaInicio);
    let lote;
    for (let intento = 0; intento < 5 && !lote; intento += 1) {
        const ultimo = await Lote.findOne({ codigo: { $regex: `^${prefijo}-\\d{3}$` } }).sort({ codigo: -1 }).select('codigo').session(session || null).lean();
        const consecutivo = Number(ultimo?.codigo?.split('-').at(-1) || 0) + 1;
        try {
            const creados = await Lote.create([{
                codigo: `${prefijo}-${String(consecutivo).padStart(3, '0')}`,
                nombre: nombreLimpio,
                especie,
                proposito: propositoNormalizado,
                fechaInicio: fechaInicio || new Date(),
                creadoPor: usuarioId
            }], session ? { session, ordered: true } : {});
            [lote] = creados;
        } catch (error) {
            if (error?.code !== 11000 || intento === 4) throw error;
        }
    }

    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'LOTE_CREADO',
        titulo: 'Lote creado desde compra',
        descripcion: lote.nombre,
        fecha: lote.fechaInicio,
        usuarioId,
        session
    });
    return lote;
};

const registrarEventoOperativoLote = async (datos) => {
    const documento = {
        lote: datos.lote,
        tipo: datos.tipo,
        fecha: datos.fecha || new Date(),
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        referenciaId: datos.referenciaId,
        entidadTipo: datos.entidadTipo,
        registradoPor: datos.usuarioId,
        metadata: datos.metadata || {}
    };
    if (datos.session) {
        const creados = await EventoLote.create([documento], { session: datos.session, ordered: true });
        return creados[0];
    }
    return EventoLote.create(documento);
};

const validarAnimalParaLote = (animal, lote) => {
    if (!animal) throw crearError('Animal no encontrado.', 404, 'ANIMAL_NO_ENCONTRADO');
    if (animal.estado !== 'Activo') throw crearError(`El animal ${animal.diio || animal.identificadorFinca} no está activo.`, 409, 'ANIMAL_NO_ACTIVO');
    if ((animal.especie || 'Bovino') !== lote.especie) throw crearError('La especie del animal no coincide con la del lote.', 409, 'ESPECIE_INCOMPATIBLE');
    if (!propositoCompatibleConObjetivo(lote.proposito, animal.objetivoProductivo)) {
        throw crearError(
            `El objetivo ${animal.objetivoProductivo || 'sin definir'} no es compatible con un lote de ${lote.proposito}. Se requiere ${OBJETIVO_POR_PROPOSITO[lote.proposito]}.`,
            409,
            'OBJETIVO_INCOMPATIBLE'
        );
    }
};

const registrarEventoLote = ({ animal, lote, pertenencia, titulo, descripcion, usuarioId, metadata = {}, session }) => (
    upsertEventoAnimal({
        animal: animal._id,
        tipoEvento: 'Cambio de lote',
        fecha: metadata.fecha || new Date(),
        titulo,
        descripcion,
        moduloOrigen: 'Lotes',
        referenciaId: pertenencia?._id,
        claveIdempotencia: pertenencia?._id && metadata.accion
            ? `LOTE:${pertenencia._id}:${metadata.accion}`
            : undefined,
        creadoPor: usuarioId,
        metadata: { loteId: lote?._id, codigoLote: lote?.codigo, ...metadata }
    }, { session })
);

const cambiarEtapa = async (loteId, etapa, usuarioId, fechaCambio = new Date(), opciones = {}) => {
    if (!opciones.session) {
        return ejecutarEnTransaccion((session) => cambiarEtapa(
            loteId,
            etapa,
            usuarioId,
            fechaCambio,
            { ...opciones, session }
        ));
    }
    if (etapa && !ETAPAS_LOTE.includes(etapa)) throw crearError('La etapa del lote no es válida.', 422, 'ETAPA_LOTE_INVALIDA');
    const { session } = opciones;
    const lote = await obtenerLote(loteId, { session });
    if (lote.estado !== 'ACTIVO') throw crearError('Solo se puede cambiar la etapa de un lote activo.', 409);
    if (lote.etapaOperativa === etapa) return lote;
    const fecha = normalizarFechaOperacion(fechaCambio, opciones.zonaHoraria);
    validarFechaEntre(fecha, lote.fechaInicio);
    await HistorialEtapaLote.updateMany(
        { lote: lote._id, fechaFin: null },
        { $set: { fechaFin: fecha } },
        { session }
    );
    const etapaAnterior = lote.etapaOperativa;
    lote.etapaOperativa = etapa || null;
    await lote.save({ session });
    if (etapa) {
        await HistorialEtapaLote.create([{ lote: lote._id, etapa, fechaInicio: fecha, registradoPor: usuarioId }], { session, ordered: true });
    }
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'CAMBIO_ETAPA',
        titulo: 'Cambio de etapa',
        descripcion: `${etapaAnterior || 'Sin etapa'} → ${etapa || 'Sin etapa'}`,
        fecha,
        usuarioId,
        metadata: { etapaAnterior, etapaNueva: etapa || null },
        session
    });
    return lote;
};

const obtenerLote = async (loteId, opciones = {}) => {
    const lote = await Lote.findById(loteId).session(opciones.session || null);
    if (!lote) throw crearError('Lote no encontrado.', 404);
    return lote;
};

const cerrarPertenencia = async (pertenencia, { fechaSalida = new Date(), motivoSalida, usuarioId, lote, session }) => {
    const fechaEfectiva = new Date(fechaSalida);
    if (Number.isNaN(fechaEfectiva.getTime()) || fechaEfectiva < new Date(pertenencia.fechaEntrada)) {
        throw crearError('La salida del lote no puede ser anterior a la entrada.', 400, 'FECHA_PERTENENCIA_INVALIDA');
    }
    pertenencia.activo = false;
    pertenencia.fechaSalida = fechaEfectiva;
    pertenencia.motivoSalida = motivoSalida || 'Salida del lote';
    await pertenencia.save(session ? { session } : {});
    const animal = await Animal.findById(pertenencia.animal).session(session || null);
    if (animal && String(animal.loteActual || '') === String(pertenencia.lote)) {
        animal.loteActual = null;
        animal.potreroActual = null;
        await animal.save(session ? { session } : {});
    }
    if (animal) {
        await registrarEventoLote({
            animal,
            lote: lote || await Lote.findById(pertenencia.lote).session(session || null),
            pertenencia,
            titulo: 'Salida de lote',
            descripcion: pertenencia.motivoSalida,
            usuarioId,
            metadata: { fecha: fechaEfectiva, accion: 'SALIDA_LOTE' },
            session
        });
    }
    return pertenencia;
};

const agregarAnimalesAlLote = async (loteId, datos = {}, usuarioId, opciones = {}) => {
    if (!opciones.session) {
        return ejecutarEnTransaccion((session) => agregarAnimalesAlLote(
            loteId,
            datos,
            usuarioId,
            { ...opciones, session }
        ));
    }
    const { session } = opciones;
    const lote = await Lote.findById(loteId).session(session || null);
    if (!lote) throw crearError('Lote no encontrado.', 404);
    if (lote.estado !== 'ACTIVO') throw crearError('Solo se pueden agregar animales a un lote activo.', 409);
    const ids = [...new Set((datos.animales || []).map(String))];
    if (!ids.length) throw crearError('Selecciona al menos un animal.');
    const animales = await Animal.find({ _id: { $in: ids } }).session(session || null);
    if (animales.length !== ids.length) throw crearError('Uno o más animales no existen.', 404);
    animales.forEach((animal) => validarAnimalParaLote(animal, lote));

    const fechaEntrada = normalizarFechaOperacion(datos.fechaEntrada, opciones.zonaHoraria);
    validarFechaEntre(fechaEntrada, lote.fechaInicio);

    await Lote.updateOne(
        { _id: lote._id, estado: 'ACTIVO' },
        { $inc: { revisionPoblacion: 1 } },
        { session }
    );

    const activas = await PertenenciaLote.find({ animal: { $in: ids }, activo: true }).populate('lote', 'codigo nombre').session(session || null);
    if (activas.length && !datos.permitirMover) {
        throw crearError('Uno o más animales ya pertenecen a un lote activo. Usa la acción Mover.', 409, 'ANIMAL_CON_LOTE_ACTIVO');
    }

    if (lote.ubicacionActual) {
        const [potrero, cantidadActual] = await Promise.all([
            Potrero.findById(lote.ubicacionActual).session(session),
            PertenenciaLote.countDocuments({ lote: lote._id, activo: true }).session(session)
        ]);
        if (!potrero) throw crearError('El potrero actual del lote ya no existe.', 409, 'POTRERO_NO_ENCONTRADO');
        const nuevos = animales.filter((animal) => !activas.some((item) => (
            String(item.animal) === String(animal._id)
            && String(item.lote?._id || item.lote) === String(lote._id)
        ))).length;
        if (Number(potrero.capacidadMaxima) > 0 && cantidadActual + nuevos > Number(potrero.capacidadMaxima)) {
            throw crearError(
                `La incorporación superaría la capacidad máxima de ${potrero.capacidadMaxima} animales del potrero.`,
                409,
                'CAPACIDAD_POTRERO_SUPERADA'
            );
        }
    }

    const resultados = [];
    for (const animal of animales) {
        const anterior = activas.find((item) => String(item.animal) === String(animal._id));
        if (anterior && String(anterior.lote?._id || anterior.lote) === String(lote._id)) {
            if (String(animal.potreroActual || '') !== String(lote.ubicacionActual || '')) {
                animal.potreroActual = lote.ubicacionActual || null;
                await animal.save({ session });
            }
            resultados.push(anterior);
            continue;
        }
        if (anterior) {
            await cerrarPertenencia(anterior, {
                fechaSalida: fechaEntrada,
                motivoSalida: datos.motivoSalida || `Movido al lote ${lote.codigo}`,
                usuarioId,
                lote: anterior.lote,
                session
            });
        }
        const pertenencias = await PertenenciaLote.create([{
            animal: animal._id,
            lote: lote._id,
            fechaEntrada,
            motivoEntrada: datos.motivoEntrada || (anterior ? 'Movimiento entre lotes' : 'Ingreso al lote'),
            registradoPor: usuarioId
        }], session ? { session, ordered: true } : {});
        const [pertenencia] = pertenencias;
        animal.loteActual = lote._id;
        animal.potreroActual = lote.ubicacionActual || null;
        await animal.save(session ? { session } : {});
        await registrarEventoLote({
            animal,
            lote,
            pertenencia,
            titulo: anterior ? 'Movimiento de lote' : 'Ingreso a lote',
            descripcion: anterior
                ? `Movido de ${anterior.lote?.codigo || 'otro lote'} a ${lote.codigo}.`
                : `Ingresó al lote ${lote.codigo}.`,
            usuarioId,
            metadata: { fecha: fechaEntrada, accion: anterior ? 'ENTRADA_TRAS_MOVIMIENTO' : 'ENTRADA_LOTE', loteAnteriorId: anterior?.lote?._id },
            session
        });
        resultados.push(pertenencia);
    }
    const agregados = resultados.filter((item) => String(item.lote) === String(lote._id));
    if (agregados.length) {
        await registrarEventoOperativoLote({
            lote: lote._id,
            tipo: activas.length ? 'ANIMALES_MOVIDOS' : 'ANIMALES_AGREGADOS',
            titulo: `${agregados.length} animal(es) incorporados`,
            descripcion: datos.motivoEntrada || 'Ingreso al lote',
            usuarioId,
            fecha: fechaEntrada,
            metadata: { animales: agregados.map((item) => item.animal) },
            session
        });
    }
    return resultados;
};

const cerrarLote = async (loteId, datos = {}, usuarioId, opciones = {}) => {
    if (!opciones.session) {
        return ejecutarEnTransaccion((session) => cerrarLote(loteId, datos, usuarioId, { ...opciones, session }));
    }
    const { session } = opciones;
    const lote = await obtenerLote(loteId, { session });
    if (['CERRADO', 'CANCELADO'].includes(lote.estado)) return lote;
    const fechaCierre = normalizarFechaOperacion(datos.fechaCierre, opciones.zonaHoraria);
    validarFechaEntre(fechaCierre, lote.fechaInicio);
    const pertenencias = await PertenenciaLote.find({ lote: lote._id, activo: true }).session(session);
    if (pertenencias.some((item) => fechaCierre < new Date(item.fechaEntrada))) {
        throw crearError('La fecha de cierre no puede ser anterior al ingreso de un animal.', 400, 'FECHA_CIERRE_INVALIDA');
    }
    const metricasFinales = await obtenerResumenPesajes(lote, pertenencias, { session });
    if (pertenencias.length && !['SIN_LOTE', 'MOVER'].includes(datos.accionAnimales)) {
        throw crearError('El lote tiene animales activos. Indica si quedarán sin lote o serán movidos.', 409, 'LOTE_CON_ANIMALES');
    }
    if (datos.accionAnimales === 'MOVER') {
        if (!datos.loteDestino) throw crearError('Selecciona el lote de destino.');
        if (String(datos.loteDestino) === String(lote._id)) throw crearError('El lote de destino debe ser diferente.');
        await agregarAnimalesAlLote(datos.loteDestino, {
            animales: pertenencias.map((item) => item.animal),
            permitirMover: true,
            fechaEntrada: fechaCierre,
            motivoSalida: datos.motivo || `Cierre del lote ${lote.codigo}`,
            motivoEntrada: `Traslado por cierre del lote ${lote.codigo}`
        }, usuarioId, { session });
    } else if (datos.accionAnimales === 'SIN_LOTE') {
        for (const pertenencia of pertenencias) {
            await cerrarPertenencia(pertenencia, {
                fechaSalida: fechaCierre,
                motivoSalida: datos.motivo || `Cierre del lote ${lote.codigo}`,
                usuarioId,
                lote,
                session
            });
        }
    }
    lote.estado = datos.estado === 'CANCELADO' ? 'CANCELADO' : 'CERRADO';
    lote.fechaCierre = fechaCierre;
    lote.gmdFinalLote = metricasFinales.gmdPromedioLote;
    lote.kilosGanadosTotales = metricasFinales.kilosGanadosTotales;
    lote.diasTotalesCiclo = Math.max(Math.floor((fechaCierre - new Date(lote.fechaInicio)) / MS_DIA), 0);
    lote.cantidadAnimalesCierre = pertenencias.length;
    lote.pesoPromedioFinalKg = metricasFinales.pesoPromedioActual;
    lote.coberturaPesajesFinal = metricasFinales.coberturaPesajes;
    const rotacionActiva = await RotacionPotrero.findOne({ loteRef: lote._id, estado: 'Activa' }).session(session);
    if (rotacionActiva) {
        if (new Date(lote.fechaCierre) < new Date(rotacionActiva.fechaEntrada)) {
            throw crearError('La fecha de cierre no puede ser anterior al ingreso al potrero.', 400, 'FECHA_CIERRE_INVALIDA');
        }
        rotacionActiva.estado = 'Finalizada';
        rotacionActiva.fechaSalida = lote.fechaCierre;
        rotacionActiva.diasOcupado = Math.round((new Date(lote.fechaCierre) - new Date(rotacionActiva.fechaEntrada)) / MS_DIA);
        await rotacionActiva.save({ session });
        await Potrero.findOneAndUpdate(
            { _id: rotacionActiva.potrero, estado: { $nin: ['Mantenimiento', 'Inactivo'] } },
            { $set: { estado: 'Descanso' } },
            { session }
        );
    }
    lote.ubicacionActual = null;
    if (datos.motivo) lote.descripcion = [lote.descripcion, datos.motivo].filter(Boolean).join('\n');
    await AsignacionPlanAlimentacion.updateMany(
        { lote: lote._id, activo: true },
        { $set: { activo: false, fechaFin: lote.fechaCierre } },
        { session }
    );
    await AsignacionRacionLote.updateMany(
        { lote: lote._id, activo: true },
        { $set: { activo: false, fechaFin: lote.fechaCierre } },
        { session }
    );
    const ciclosActivos = await CicloEngorde.find({
        lote: lote._id,
        estado: { $in: ['PROGRAMADO', 'ACTIVO'] }
    }).session(session);
    for (const ciclo of ciclosActivos) {
        const tienePendientes = ciclo.ejecuciones.some((item) => ['PENDIENTE', 'PARCIAL'].includes(item.estado));
        ciclo.estado = lote.estado === 'CANCELADO' || tienePendientes ? 'CANCELADO' : 'FINALIZADO';
        ciclo.fechaFin = fechaCierre;
        ciclo.motivoCierre = datos.motivo || `Cierre del lote ${lote.codigo}`;
        const etapaAbierta = ciclo.historialEtapas.find((item) => !item.fechaFin);
        if (etapaAbierta) etapaAbierta.fechaFin = fechaCierre;
        ciclo.ejecuciones
            .filter((item) => ['PENDIENTE', 'PARCIAL'].includes(item.estado))
            .forEach((item) => { item.estado = 'CANCELADO'; });
        await ciclo.save({ session });
        await registrarEventoOperativoLote({
            lote: lote._id,
            tipo: `PROTOCOLO_ENGORDE_${ciclo.estado}`,
            titulo: ciclo.estado === 'FINALIZADO' ? 'Protocolo finalizado por cierre del lote' : 'Protocolo cancelado por cierre del lote',
            descripcion: ciclo.motivoCierre,
            referenciaId: ciclo._id,
            entidadTipo: 'CicloEngorde',
            fecha: fechaCierre,
            usuarioId,
            session
        });
    }
    await Tarea.updateMany(
        { lote: lote._id, estado: { $in: ['Pendiente', 'En proceso'] } },
        {
            $set: {
                estado: 'Cancelada',
                cancelacionAutomaticaOrigen: 'CIERRE_LOTE',
                canceladaAutomaticamenteEn: fechaCierre
            }
        },
        { session }
    );
    await lote.save({ session });
    await HistorialEtapaLote.updateMany(
        { lote: lote._id, fechaFin: null },
        { $set: { fechaFin: lote.fechaCierre } },
        { session }
    );
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'LOTE_CERRADO',
        titulo: lote.estado === 'CANCELADO' ? 'Lote cancelado' : 'Lote cerrado',
        descripcion: datos.motivo || 'Cierre manual del lote',
        fecha: lote.fechaCierre,
        usuarioId,
        session
    });
    return lote;
};

const retirarAnimalesDelLote = async (loteId, datos = {}, usuarioId, opciones = {}) => {
    if (!opciones.session) {
        return ejecutarEnTransaccion((session) => retirarAnimalesDelLote(
            loteId,
            datos,
            usuarioId,
            { ...opciones, session }
        ));
    }
    const { session } = opciones;
    const lote = await obtenerLote(loteId, { session });
    if (lote.estado !== 'ACTIVO') throw crearError('Solo se pueden retirar animales de un lote activo.', 409);
    const ids = [...new Set((datos.animales || []).map(String))];
    if (!ids.length) throw crearError('Selecciona al menos un animal.');
    const pertenencias = await PertenenciaLote.find({ lote: lote._id, animal: { $in: ids }, activo: true }).session(session);
    if (pertenencias.length !== ids.length) throw crearError('Uno o más animales no pertenecen actualmente a este lote.', 409);
    const fechaSalida = normalizarFechaOperacion(datos.fechaSalida, opciones.zonaHoraria);
    validarFechaEntre(fechaSalida, lote.fechaInicio);
    for (const pertenencia of pertenencias) {
        await cerrarPertenencia(pertenencia, {
            fechaSalida,
            motivoSalida: datos.motivoSalida || 'Salida manual del lote',
            usuarioId,
            lote,
            session
        });
    }
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'ANIMALES_RETIRADOS',
        titulo: `${pertenencias.length} animal(es) retirados`,
        descripcion: datos.motivoSalida || 'Salida manual del lote',
        fecha: fechaSalida,
        usuarioId,
        metadata: { animales: pertenencias.map((item) => item.animal) },
        session
    });
    return pertenencias;
};

const registrarPesajesLote = async (loteId, datos = {}, usuarioId, opciones = {}) => {
    if (!opciones.session) {
        return ejecutarEnTransaccion((session) => registrarPesajesLote(
            loteId,
            datos,
            usuarioId,
            { ...opciones, session }
        ));
    }
    const { session } = opciones;
    const capturaMasiva = sanitizarPesajeMasivo(datos);
    if (capturaMasiva.fecha) capturaMasiva.fecha = normalizarFechaOperacion(capturaMasiva.fecha, opciones.zonaHoraria);
    const lote = await obtenerLote(loteId, { session });
    if (lote.estado !== 'ACTIVO') throw crearError('Solo se pueden registrar pesajes en un lote activo.', 409);
    const entradas = capturaMasiva.pesajes.filter((item) => item.peso !== '' && item.peso !== null && item.peso !== undefined);
    if (!entradas.length) throw crearError('Ingresa al menos un peso.');
    if (entradas.some((item) => !Number.isFinite(Number(item.peso)) || Number(item.peso) <= 0)) throw crearError('Todos los pesos deben ser mayores que cero.');
    const ids = validarAnimalesUnicos(entradas);
    const pertenencias = await PertenenciaLote.find({ lote: loteId, animal: { $in: ids }, activo: true }).session(session);
    if (pertenencias.length !== ids.length) throw crearError('Todos los animales deben pertenecer actualmente al lote.', 409);
    const fecha = capturaMasiva.fecha || new Date();
    const preparados = [];
    for (const item of entradas) {
        const captura = sanitizarPesaje({
            animal: item.animal,
            fecha,
            peso: item.peso,
            etapaProductiva: item.etapaProductiva,
            observaciones: item.observaciones || capturaMasiva.observaciones
        });
        const validacion = await validarDatosPesaje(captura, { session });
        preparados.push({
            ...captura,
            fecha: validacion.fecha,
            peso: validacion.peso,
            etapaProductiva: lote.especie === 'Porcino'
                ? captura.etapaProductiva || validacion.animal.etapaProductiva || undefined
                : undefined,
            lote: lote._id,
            tipoPesaje: 'Lote',
            registradoPor: usuarioId
        });
    }
    const creados = await Pesaje.insertMany(preparados, { session });
    for (const pesaje of creados) {
        await actualizarPesoActualAnimal(pesaje.animal, { session });
        await registrarEventoPesaje(pesaje, usuarioId, {
            session,
            loteId: lote._id,
            crearEventoLote: false,
            titulo: 'Pesaje registrado desde lote',
            descripcion: `Peso registrado: ${pesaje.peso} kg en el lote ${lote.codigo}.`
        });
    }
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'PESAJES_REGISTRADOS',
        titulo: `${creados.length} pesaje(s) registrados`,
        descripcion: capturaMasiva.observaciones || 'Pesaje grupal del lote',
        fecha,
        usuarioId,
        metadata: { pesajes: creados.map((item) => item._id), animales: creados.map((item) => item.animal) },
        session
    });
    return creados;
};

const crearTareaLote = async (loteId, datos = {}, usuarioId) => {
    const lote = await obtenerLote(loteId);
    datos = limpiarDatosTarea(datos);
    if (datos.estado && datos.estado !== 'Pendiente') throw crearError('Las tareas se crean pendientes.');
    await validarRelacionesTarea(datos);
    const tarea = await Tarea.create({
        ...datos,
        lote: lote._id,
        moduloOrigen: 'Lotes',
        referenciaId: lote._id,
        especie: lote.especie,
        creadoPor: usuarioId,
        creadoAutomaticamente: false
    });
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'TAREA_PROGRAMADA',
        titulo: 'Tarea programada',
        descripcion: tarea.titulo,
        fecha: tarea.fechaProgramada,
        referenciaId: tarea._id,
        entidadTipo: 'Tarea',
        usuarioId
    });
    return tarea;
};

const moverLoteAPotrero = async (loteId, datos = {}, usuarioId, opciones = {}) => {
    if (!opciones.session) {
        try {
            return await ejecutarEnTransaccion((session) => moverLoteAPotrero(
                loteId,
                datos,
                usuarioId,
                { ...opciones, session }
            ));
        } catch (error) {
            if (error?.code === 11000) throw crearError('El potrero de destino ya tiene una rotacion activa.', 409, 'POTRERO_YA_OCUPADO');
            throw error;
        }
    }
    const { session } = opciones;
    const lote = await obtenerLote(loteId, { session });
    if (lote.estado !== 'ACTIVO') throw crearError('Solo se puede mover un lote activo.', 409);
    if (!datos.potrero) throw crearError('Selecciona el potrero de destino.');
    const fecha = normalizarFechaOperacion(datos.fechaEntrada, opciones.zonaHoraria);
    validarFechaEntre(fecha, lote.fechaInicio);
    const destino = validarDestinoPastoreo(await Potrero.findById(datos.potrero).session(session));
    const cantidad = await PertenenciaLote.countDocuments({ lote: lote._id, activo: true }).session(session);
    if (cantidad < 1) throw crearError('El lote debe tener al menos un animal activo para iniciar una rotacion.', 409, 'LOTE_SIN_ANIMALES');
    if (Number(destino.capacidadMaxima) > 0 && cantidad > Number(destino.capacidadMaxima)) {
        throw crearError(`El lote supera la capacidad maxima de ${destino.capacidadMaxima} animales del potrero.`, 409, 'CAPACIDAD_POTRERO_SUPERADA');
    }
    const activa = await RotacionPotrero.findOne({ loteRef: lote._id, estado: 'Activa' }).session(session);
    if (activa && String(activa.potrero) === String(datos.potrero)) throw crearError('El lote ya se encuentra en ese potrero.', 409);
    const otraActiva = await RotacionPotrero.findOne({ potrero: datos.potrero, estado: 'Activa', _id: { $ne: activa?._id } }).session(session);
    if (otraActiva) throw crearError('El potrero de destino ya tiene una rotación activa.', 409);
    if (activa) {
        if (new Date(fecha) < new Date(activa.fechaEntrada)) throw crearError('La nueva entrada no puede ser anterior a la rotacion activa.', 400, 'FECHA_ROTACION_INVALIDA');
        activa.estado = 'Finalizada';
        activa.fechaSalida = fecha;
        activa.diasOcupado = Math.round((new Date(fecha) - new Date(activa.fechaEntrada)) / MS_DIA);
        await activa.save({ session });
        await Potrero.findOneAndUpdate(
            { _id: activa.potrero, estado: { $nin: ['Mantenimiento', 'Inactivo'] } },
            { $set: { estado: 'Descanso' } },
            { session }
        );
    }
    const [rotacion] = await RotacionPotrero.create([{
        potrero: datos.potrero,
        lote: lote.codigo,
        loteRef: lote._id,
        fechaEntrada: fecha,
        numeroAnimales: cantidad,
        estado: 'Activa',
        observaciones: datos.observaciones
    }], { session, ordered: true });
    const anterior = lote.ubicacionActual;
    lote.ubicacionActual = datos.potrero;
    await lote.save({ session });
    await Potrero.findByIdAndUpdate(datos.potrero, { $set: { estado: 'Ocupado' } }, { session, runValidators: true });
    await Animal.updateMany(
        { loteActual: lote._id, estado: 'Activo' },
        { $set: { potreroActual: datos.potrero } },
        { session }
    );
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'CAMBIO_POTRERO',
        titulo: 'Cambio de potrero',
        descripcion: datos.observaciones || 'El lote fue trasladado a otro potrero.',
        fecha,
        referenciaId: rotacion._id,
        entidadTipo: 'RotacionPotrero',
        usuarioId,
        metadata: { potreroAnterior: anterior || null, potreroNuevo: datos.potrero, numeroAnimales: cantidad },
        session
    });
    return rotacion;
};

const calcularResumenPesajes = (lote, pertenencias, pesajes = []) => {
    const ids = pertenencias.map((item) => item.animal?._id || item.animal).filter(Boolean);
    if (!ids.length) return { pesoPromedioActual: null, coberturaPesajes: { conPesaje: 0, total: 0 }, gmdPromedioLote: null, cumplimientoGmd: null, alcanzaronPesoObjetivo: 0 };
    const porAnimal = new Map(ids.map((id) => [String(id), []]));
    pesajes.forEach((pesaje) => porAnimal.get(String(pesaje.animal))?.push(pesaje));
    const ultimos = [];
    const pesosEntrada = [];
    const crecimientos = [];
    let alcanzaronPesoObjetivo = 0;
    pertenencias.forEach((pertenencia) => {
        const lista = porAnimal.get(String(pertenencia.animal?._id || pertenencia.animal)) || [];
        const fechaEntrada = new Date(pertenencia.fechaEntrada);
        const desdeEntrada = lista.filter((pesaje) => (
            new Date(pesaje.fecha) >= fechaEntrada
            && (!pertenencia.fechaSalida || new Date(pesaje.fecha) <= new Date(pertenencia.fechaSalida))
        ));
        const medicionEntrada = desdeEntrada[0];
        if (medicionEntrada) pesosEntrada.push(Number(medicionEntrada.peso));
        if (desdeEntrada.length) {
            const ultimo = desdeEntrada[desdeEntrada.length - 1];
            ultimos.push(Number(ultimo.peso));
            if (lote.pesoObjetivoKg && Number(ultimo.peso) >= Number(lote.pesoObjetivoKg)) alcanzaronPesoObjetivo += 1;
        }
        const gmd = calcularGmd(desdeEntrada);
        if (gmd) crecimientos.push(gmd);
    });
    const dias = crecimientos.reduce((total, item) => total + item.dias, 0);
    const ganancia = crecimientos.reduce((total, item) => total + item.gananciaKg, 0);
    const gmd = dias > 0 ? ganancia / dias : null;
    return {
        pesoPromedioActual: ultimos.length ? redondear(ultimos.reduce((a, b) => a + b, 0) / ultimos.length) : null,
        pesoPromedioEntradaLote: pesosEntrada.length ? redondear(pesosEntrada.reduce((a, b) => a + b, 0) / pesosEntrada.length) : null,
        coberturaPesoEntrada: { conDato: pesosEntrada.length, total: ids.length },
        coberturaPesajes: { conPesaje: ultimos.length, total: ids.length },
        gmdPromedioLote: redondear(gmd, 3),
        kilosGanadosTotales: redondear(ganancia, 2),
        animalDias: redondear(dias, 2),
        cumplimientoGmd: gmd !== null && lote.gmdObjetivoKgDia ? redondear((gmd / lote.gmdObjetivoKgDia) * 100, 1) : null,
        alcanzaronPesoObjetivo
    };
};

const obtenerResumenPesajes = async (lote, pertenencias, opciones = {}) => {
    const ids = pertenencias.map((item) => item.animal?._id || item.animal).filter(Boolean);
    if (!ids.length) return calcularResumenPesajes(lote, pertenencias, []);
    const consulta = Pesaje.find({ animal: { $in: ids } }).sort({ fecha: 1 });
    if (opciones.session) consulta.session(opciones.session);
    return calcularResumenPesajes(lote, pertenencias, await consulta.lean());
};

const obtenerResumenSanitario = async (animales) => {
    const ids = animales.map((animal) => animal._id);
    const estados = { Sano: 0, 'En observación': 0, Enfermo: 0, Recuperación: 0 };
    animales.forEach((animal) => { estados[animal.estadoSanitario || 'Sano'] = (estados[animal.estadoSanitario || 'Sano'] || 0) + 1; });
    const tratamientosActivos = ids.length ? await TratamientoSanitario.countDocuments({ animales: { $in: ids }, estado: 'Activo' }) : 0;
    return { estados, tratamientosActivos };
};

const obtenerResumenTareas = async (loteId, zonaHoraria = 'America/Costa_Rica') => {
    const tareas = await Tarea.find({ lote: loteId, estado: { $in: ['Pendiente', 'En proceso'] } }).sort({ fechaProgramada: 1 }).lean();
    return {
        pendientes: tareas.length,
        vencidas: tareas.filter((tarea) => diasHastaTarea(tarea.fechaLimite || tarea.fechaProgramada, zonaHoraria) < 0).length,
        proxima: tareas[0] || null
    };
};

const obtenerResumenListadoLotes = async (filtro = {}) => {
    const lotes = await Lote.find(filtro)
        .select('codigo nombre especie proposito etapaOperativa fechaInicio fechaCierre estado pesoObjetivoKg gmdObjetivoKgDia ubicacionActual gmdFinalLote kilosGanadosTotales diasTotalesCiclo cantidadAnimalesCierre pesoPromedioFinalKg coberturaPesajesFinal')
        .populate('ubicacionActual', 'codigo nombre')
        .sort({ estado: 1, createdAt: -1 })
        .lean();
    if (!lotes.length) return [];
    const ids = lotes.map((lote) => lote._id);
    const [pertenencias, asignaciones] = await Promise.all([
        PertenenciaLote.find({ lote: { $in: ids }, activo: true })
            .select('lote animal')
            .populate('animal', 'pesoActual')
            .lean(),
        AsignacionPlanAlimentacion.find({ lote: { $in: ids }, activo: true })
            .select('lote plan')
            .populate('plan', 'nombre etapa activo')
            .lean()
    ]);
    const poblacion = new Map();
    pertenencias.forEach((item) => {
        const clave = String(item.lote);
        const actual = poblacion.get(clave) || { cantidad: 0, conPeso: 0, pesoTotal: 0 };
        actual.cantidad += 1;
        if (Number(item.animal?.pesoActual) > 0) {
            actual.conPeso += 1;
            actual.pesoTotal += Number(item.animal.pesoActual);
        }
        poblacion.set(clave, actual);
    });
    const planes = new Map(asignaciones.map((item) => [String(item.lote), item.plan || null]));
    return lotes.map((lote) => {
        const datos = poblacion.get(String(lote._id)) || { cantidad: 0, conPeso: 0, pesoTotal: 0 };
        const cerrado = lote.estado !== 'ACTIVO';
        return {
            ...lote,
            cantidadAnimales: cerrado ? lote.cantidadAnimalesCierre || 0 : datos.cantidad,
            resumen: {
                pesoPromedioActual: cerrado
                    ? lote.pesoPromedioFinalKg ?? null
                    : datos.conPeso ? redondear(datos.pesoTotal / datos.conPeso) : null,
                coberturaPesajes: cerrado
                    ? lote.coberturaPesajesFinal || { conPesaje: 0, total: lote.cantidadAnimalesCierre || 0 }
                    : { conPesaje: datos.conPeso, total: datos.cantidad },
                gmdPromedioLote: cerrado ? lote.gmdFinalLote ?? null : undefined,
                kilosGanadosTotales: cerrado ? lote.kilosGanadosTotales ?? null : undefined
            },
            planAlimentacionActual: planes.get(String(lote._id)) || null
        };
    });
};

const listarEventosLote = async (loteId, { pagina = 1, limite = 50 } = {}) => {
    await obtenerLote(loteId);
    const paginaValida = Math.max(1, Number(pagina) || 1);
    const limiteValido = Math.min(100, Math.max(10, Number(limite) || 50));
    const filtro = { lote: loteId };
    const [datos, total] = await Promise.all([
        EventoLote.find(filtro)
            .populate('registradoPor', 'nombre apellido rol')
            .sort({ fecha: -1, _id: -1 })
            .skip((paginaValida - 1) * limiteValido)
            .limit(limiteValido)
            .lean(),
        EventoLote.countDocuments(filtro)
    ]);
    return {
        datos,
        paginacion: {
            pagina: paginaValida,
            limite: limiteValido,
            total,
            hayMas: paginaValida * limiteValido < total
        }
    };
};

const obtenerDetalleLote = async (loteId, opciones = {}) => {
    const lote = await Lote.findById(loteId).populate('ubicacionActual', 'codigo nombre').lean();
    if (!lote) throw crearError('Lote no encontrado.', 404);
    const pertenencias = await PertenenciaLote.find({ lote: loteId, activo: true })
        .populate('animal', 'diio identificadorFinca nombre sexo categoria objetivoProductivo pesoActual estado estadoSanitario potreroActual compraId camadaOrigen')
        .sort({ fechaEntrada: 1 }).lean();
    const animales = pertenencias.map((item) => item.animal).filter(Boolean);
    const [pesajes, sanidad, tareas, plan, racion, ultimoSuministro, etapas, rotaciones, eventos] = await Promise.all([
        obtenerResumenPesajes(lote, pertenencias),
        obtenerResumenSanitario(animales),
        obtenerResumenTareas(loteId, opciones.zonaHoraria),
        AsignacionPlanAlimentacion.findOne({ lote: loteId, activo: true }).populate('plan').lean(),
        AsignacionRacionLote.findOne({ lote: loteId, activo: true }).populate('racion', 'nombre etapa activo').lean(),
        SuministroAlimentacion.findOne({ lote: loteId }).sort({ fechaHora: -1 }).lean(),
        HistorialEtapaLote.find({ lote: loteId }).sort({ fechaInicio: -1 }).lean(),
        RotacionPotrero.find({ loteRef: loteId }).populate('potrero', 'codigo nombre').sort({ fechaEntrada: -1 }).lean(),
        EventoLote.find({ lote: loteId }).populate('registradoPor', 'nombre apellido rol').sort({ fecha: -1 }).limit(100).lean()
    ]);
    const origen = {
        comprados: animales.filter((animal) => animal.compraId).length,
        nacidosEnFinca: animales.filter((animal) => !animal.compraId).length
    };
    const camadasOrigen = lote.especie === 'Porcino'
        ? new Set(animales.map((animal) => String(animal.camadaOrigen || '')).filter(Boolean)).size
        : 0;
    const fin = lote.fechaCierre ? new Date(lote.fechaCierre) : new Date();
    const diasActivo = Math.max(Math.floor((fin - new Date(lote.fechaInicio)) / MS_DIA), 0);
    return {
        ...lote,
        animales: pertenencias.map((item) => ({ ...item.animal, pertenencia: item })),
        resumen: {
            diasActivo,
            ...pesajes,
            ...(lote.estado !== 'ACTIVO' ? {
                pesoPromedioActual: lote.pesoPromedioFinalKg ?? pesajes.pesoPromedioActual,
                coberturaPesajes: lote.coberturaPesajesFinal || pesajes.coberturaPesajes,
                gmdPromedioLote: lote.gmdFinalLote ?? pesajes.gmdPromedioLote,
                kilosGanadosTotales: lote.kilosGanadosTotales ?? pesajes.kilosGanadosTotales,
                cantidadAnimalesCierre: lote.cantidadAnimalesCierre ?? 0
            } : {}),
            sanidad,
            tareas,
            origen,
            camadasOrigen
        },
        planAlimentacionActual: plan || null,
        racionActual: racion || null,
        ultimoSuministro: ultimoSuministro || null,
        historialEtapas: etapas,
        rotaciones,
        eventos
    };
};

const proyectarDetalleLotePorPlan = (detalle, incluirAnalitica) => {
    if (incluirAnalitica || !detalle) return detalle;
    const resumen = { ...(detalle.resumen || {}) };
    delete resumen.gmdPromedioLote;
    delete resumen.cumplimientoGmd;
    delete resumen.alcanzaronPesoObjetivo;
    delete resumen.kilosGanadosTotales;
    return {
        ...detalle,
        gmdObjetivoKgDia: undefined,
        gmdFinalLote: undefined,
        kilosGanadosTotales: undefined,
        resumen
    };
};

module.exports = {
    agregarAnimalesAlLote,
    cerrarLote,
    cerrarPertenencia,
    obtenerDetalleLote,
    obtenerLote,
    retirarAnimalesDelLote,
    validarAnimalParaLote,
    cambiarEtapa,
    registrarEventoOperativoLote,
    obtenerResumenPesajes,
    calcularResumenPesajes,
    obtenerResumenSanitario,
    registrarPesajesLote,
    crearTareaLote,
    moverLoteAPotrero,
    construirPrefijoCodigoLote,
    crearLoteRapido,
    proyectarDetalleLotePorPlan,
    obtenerResumenListadoLotes,
    listarEventosLote,
    normalizarFechaOperacion
};
