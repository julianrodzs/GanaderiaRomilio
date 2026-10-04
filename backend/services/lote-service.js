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
const { calcularGmd } = require('./indicesProductivos-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');
const { upsertEventoAnimal } = require('./eventoAnimal-service');
const { OBJETIVO_POR_PROPOSITO, PROPOSITOS_LOTE, normalizarPropositoLote, propositoCompatibleConObjetivo } = require('../config/lotes');

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

const construirPrefijoCodigoLote = (especie, proposito, fecha = new Date()) => {
    const fechaValida = new Date(fecha);
    const anio = Number.isNaN(fechaValida.getTime()) ? new Date().getFullYear() : fechaValida.getFullYear();
    const especieCodigo = especie === 'Porcino' ? 'POR' : 'BOV';
    return `${especieCodigo}-${ABREVIATURAS_PROPOSITO[proposito] || 'OTR'}-${anio}`;
};

const crearLoteRapido = async ({ nombre, especie, proposito, fechaInicio }, usuarioId) => {
    const nombreLimpio = String(nombre || '').trim();
    const propositoNormalizado = normalizarPropositoLote(proposito);
    if (!nombreLimpio) throw crearError('Indica el nombre del lote.');
    if (!['Bovino', 'Porcino'].includes(especie)) throw crearError('La especie del lote no es válida.');
    if (!propositoNormalizado || !PROPOSITOS_LOTE.includes(propositoNormalizado)) throw crearError('El objetivo del lote no es válido.');

    const prefijo = construirPrefijoCodigoLote(especie, propositoNormalizado, fechaInicio);
    let lote;
    for (let intento = 0; intento < 5 && !lote; intento += 1) {
        const ultimo = await Lote.findOne({ codigo: { $regex: `^${prefijo}-\\d{3}$` } }).sort({ codigo: -1 }).select('codigo').lean();
        const consecutivo = Number(ultimo?.codigo?.split('-').at(-1) || 0) + 1;
        try {
            lote = await Lote.create({
                codigo: `${prefijo}-${String(consecutivo).padStart(3, '0')}`,
                nombre: nombreLimpio,
                especie,
                proposito: propositoNormalizado,
                fechaInicio: fechaInicio || new Date(),
                creadoPor: usuarioId
            });
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
        usuarioId
    });
    return lote;
};

const registrarEventoOperativoLote = (datos) => EventoLote.create({
    lote: datos.lote,
    tipo: datos.tipo,
    fecha: datos.fecha || new Date(),
    titulo: datos.titulo,
    descripcion: datos.descripcion,
    referenciaId: datos.referenciaId,
    entidadTipo: datos.entidadTipo,
    registradoPor: datos.usuarioId,
    metadata: datos.metadata || {}
});

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

const registrarEventoLote = ({ animal, lote, pertenencia, titulo, descripcion, usuarioId, metadata = {} }) => (
    upsertEventoAnimal({
        animal: animal._id,
        tipoEvento: 'Cambio de lote',
        fecha: metadata.fecha || new Date(),
        titulo,
        descripcion,
        moduloOrigen: 'Lotes',
        referenciaId: pertenencia?._id,
        creadoPor: usuarioId,
        metadata: { loteId: lote?._id, codigoLote: lote?.codigo, ...metadata }
    })
);

const cambiarEtapa = async (loteId, etapa, usuarioId, fechaCambio = new Date()) => {
    const lote = await obtenerLote(loteId);
    if (lote.estado !== 'ACTIVO') throw crearError('Solo se puede cambiar la etapa de un lote activo.', 409);
    if (lote.etapaOperativa === etapa) return lote;
    await HistorialEtapaLote.updateMany(
        { lote: lote._id, fechaFin: null },
        { $set: { fechaFin: fechaCambio } }
    );
    const etapaAnterior = lote.etapaOperativa;
    lote.etapaOperativa = etapa || null;
    await lote.save();
    if (etapa) {
        await HistorialEtapaLote.create({ lote: lote._id, etapa, fechaInicio: fechaCambio, registradoPor: usuarioId });
    }
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'CAMBIO_ETAPA',
        titulo: 'Cambio de etapa',
        descripcion: `${etapaAnterior || 'Sin etapa'} → ${etapa || 'Sin etapa'}`,
        fecha: fechaCambio,
        usuarioId,
        metadata: { etapaAnterior, etapaNueva: etapa || null }
    });
    return lote;
};

const obtenerLote = async (loteId) => {
    const lote = await Lote.findById(loteId);
    if (!lote) throw crearError('Lote no encontrado.', 404);
    return lote;
};

const cerrarPertenencia = async (pertenencia, { fechaSalida = new Date(), motivoSalida, usuarioId, lote }) => {
    pertenencia.activo = false;
    pertenencia.fechaSalida = fechaSalida;
    pertenencia.motivoSalida = motivoSalida || 'Salida del lote';
    await pertenencia.save();
    const animal = await Animal.findById(pertenencia.animal);
    if (animal && String(animal.loteActual || '') === String(pertenencia.lote)) {
        animal.loteActual = null;
        await animal.save();
    }
    if (animal) {
        await registrarEventoLote({
            animal,
            lote: lote || await Lote.findById(pertenencia.lote),
            pertenencia,
            titulo: 'Salida de lote',
            descripcion: pertenencia.motivoSalida,
            usuarioId,
            metadata: { fecha: fechaSalida, accion: 'SALIDA' }
        });
    }
    return pertenencia;
};

const agregarAnimalesAlLote = async (loteId, datos = {}, usuarioId) => {
    const lote = await obtenerLote(loteId);
    if (lote.estado !== 'ACTIVO') throw crearError('Solo se pueden agregar animales a un lote activo.', 409);
    const ids = [...new Set((datos.animales || []).map(String))];
    if (!ids.length) throw crearError('Selecciona al menos un animal.');
    const animales = await Animal.find({ _id: { $in: ids } });
    if (animales.length !== ids.length) throw crearError('Uno o más animales no existen.', 404);
    animales.forEach((animal) => validarAnimalParaLote(animal, lote));

    const activas = await PertenenciaLote.find({ animal: { $in: ids }, activo: true }).populate('lote', 'codigo nombre');
    if (activas.length && !datos.permitirMover) {
        throw crearError('Uno o más animales ya pertenecen a un lote activo. Usa la acción Mover.', 409, 'ANIMAL_CON_LOTE_ACTIVO');
    }

    const resultados = [];
    for (const animal of animales) {
        const anterior = activas.find((item) => String(item.animal) === String(animal._id));
        if (anterior && String(anterior.lote?._id || anterior.lote) === String(lote._id)) {
            resultados.push(anterior);
            continue;
        }
        if (anterior) {
            await cerrarPertenencia(anterior, {
                fechaSalida: datos.fechaEntrada || new Date(),
                motivoSalida: datos.motivoSalida || `Movido al lote ${lote.codigo}`,
                usuarioId,
                lote: anterior.lote
            });
        }
        const pertenencia = await PertenenciaLote.create({
            animal: animal._id,
            lote: lote._id,
            fechaEntrada: datos.fechaEntrada || new Date(),
            motivoEntrada: datos.motivoEntrada || (anterior ? 'Movimiento entre lotes' : 'Ingreso al lote'),
            registradoPor: usuarioId
        });
        animal.loteActual = lote._id;
        await animal.save();
        await registrarEventoLote({
            animal,
            lote,
            pertenencia,
            titulo: anterior ? 'Movimiento de lote' : 'Ingreso a lote',
            descripcion: anterior
                ? `Movido de ${anterior.lote?.codigo || 'otro lote'} a ${lote.codigo}.`
                : `Ingresó al lote ${lote.codigo}.`,
            usuarioId,
            metadata: { accion: anterior ? 'MOVIMIENTO' : 'ENTRADA', loteAnteriorId: anterior?.lote?._id }
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
            metadata: { animales: agregados.map((item) => item.animal) }
        });
    }
    return resultados;
};

const cerrarLote = async (loteId, datos = {}, usuarioId) => {
    const lote = await obtenerLote(loteId);
    const pertenencias = await PertenenciaLote.find({ lote: lote._id, activo: true });
    if (pertenencias.length && !['SIN_LOTE', 'MOVER'].includes(datos.accionAnimales)) {
        throw crearError('El lote tiene animales activos. Indica si quedarán sin lote o serán movidos.', 409, 'LOTE_CON_ANIMALES');
    }
    if (datos.accionAnimales === 'MOVER') {
        if (!datos.loteDestino) throw crearError('Selecciona el lote de destino.');
        if (String(datos.loteDestino) === String(lote._id)) throw crearError('El lote de destino debe ser diferente.');
        await agregarAnimalesAlLote(datos.loteDestino, {
            animales: pertenencias.map((item) => item.animal),
            permitirMover: true,
            fechaEntrada: datos.fechaCierre || new Date(),
            motivoSalida: datos.motivo || `Cierre del lote ${lote.codigo}`,
            motivoEntrada: `Traslado por cierre del lote ${lote.codigo}`
        }, usuarioId);
    } else if (datos.accionAnimales === 'SIN_LOTE') {
        for (const pertenencia of pertenencias) {
            await cerrarPertenencia(pertenencia, {
                fechaSalida: datos.fechaCierre || new Date(),
                motivoSalida: datos.motivo || `Cierre del lote ${lote.codigo}`,
                usuarioId,
                lote
            });
        }
    }
    lote.estado = datos.estado === 'CANCELADO' ? 'CANCELADO' : 'CERRADO';
    lote.fechaCierre = datos.fechaCierre || new Date();
    if (datos.motivo) lote.descripcion = [lote.descripcion, datos.motivo].filter(Boolean).join('\n');
    await AsignacionPlanAlimentacion.updateMany(
        { lote: lote._id, activo: true },
        { $set: { activo: false, fechaFin: lote.fechaCierre } }
    );
    await lote.save();
    await HistorialEtapaLote.updateMany({ lote: lote._id, fechaFin: null }, { $set: { fechaFin: lote.fechaCierre } });
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'LOTE_CERRADO',
        titulo: lote.estado === 'CANCELADO' ? 'Lote cancelado' : 'Lote cerrado',
        descripcion: datos.motivo || 'Cierre manual del lote',
        fecha: lote.fechaCierre,
        usuarioId
    });
    return lote;
};

const retirarAnimalesDelLote = async (loteId, datos = {}, usuarioId) => {
    const lote = await obtenerLote(loteId);
    const ids = [...new Set((datos.animales || []).map(String))];
    if (!ids.length) throw crearError('Selecciona al menos un animal.');
    const pertenencias = await PertenenciaLote.find({ lote: lote._id, animal: { $in: ids }, activo: true });
    if (pertenencias.length !== ids.length) throw crearError('Uno o más animales no pertenecen actualmente a este lote.', 409);
    for (const pertenencia of pertenencias) {
        await cerrarPertenencia(pertenencia, {
            fechaSalida: datos.fechaSalida || new Date(),
            motivoSalida: datos.motivoSalida || 'Salida manual del lote',
            usuarioId,
            lote
        });
    }
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'ANIMALES_RETIRADOS',
        titulo: `${pertenencias.length} animal(es) retirados`,
        descripcion: datos.motivoSalida || 'Salida manual del lote',
        usuarioId,
        metadata: { animales: pertenencias.map((item) => item.animal) }
    });
    return pertenencias;
};

const registrarPesajesLote = async (loteId, datos = {}, usuarioId) => {
    const lote = await obtenerLote(loteId);
    if (lote.estado !== 'ACTIVO') throw crearError('Solo se pueden registrar pesajes en un lote activo.', 409);
    const entradas = (datos.pesajes || []).filter((item) => item.peso !== '' && item.peso !== null && item.peso !== undefined);
    if (!entradas.length) throw crearError('Ingresa al menos un peso.');
    if (entradas.some((item) => !Number.isFinite(Number(item.peso)) || Number(item.peso) <= 0)) throw crearError('Todos los pesos deben ser mayores que cero.');
    const ids = [...new Set(entradas.map((item) => String(item.animal)))];
    const pertenencias = await PertenenciaLote.find({ lote: loteId, animal: { $in: ids }, activo: true });
    if (pertenencias.length !== ids.length) throw crearError('Todos los animales deben pertenecer actualmente al lote.', 409);
    const fecha = datos.fecha || new Date();
    const creados = await Pesaje.insertMany(entradas.map((item) => ({
        animal: item.animal,
        fecha,
        peso: Number(item.peso),
        etapaProductiva: lote.especie === 'Porcino' ? item.etapaProductiva || undefined : undefined,
        observaciones: item.observaciones || datos.observaciones,
        registradoPor: usuarioId
    })));
    await Promise.all(creados.map(async (pesaje) => {
        const ultimo = await Pesaje.findOne({ animal: pesaje.animal }).sort({ fecha: -1, createdAt: -1 });
        await Animal.findByIdAndUpdate(pesaje.animal, { pesoActual: ultimo?.peso || null });
        await upsertEventoAnimal({
            animal: pesaje.animal,
            tipoEvento: 'Pesaje',
            fecha: pesaje.fecha,
            titulo: 'Pesaje registrado desde lote',
            descripcion: `Peso registrado: ${pesaje.peso} kg en el lote ${lote.codigo}.`,
            moduloOrigen: 'Pesajes',
            referenciaId: pesaje._id,
            creadoPor: usuarioId,
            metadata: { pesoKg: pesaje.peso, loteId: lote._id }
        });
    }));
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'PESAJES_REGISTRADOS',
        titulo: `${creados.length} pesaje(s) registrados`,
        descripcion: datos.observaciones || 'Pesaje grupal del lote',
        fecha,
        usuarioId,
        metadata: { pesajes: creados.map((item) => item._id) }
    });
    return creados;
};

const crearTareaLote = async (loteId, datos = {}, usuarioId) => {
    const lote = await obtenerLote(loteId);
    await validarUsuarioAsignable(datos.asignadoA, 'Tareas');
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

const moverLoteAPotrero = async (loteId, datos = {}, usuarioId) => {
    const lote = await obtenerLote(loteId);
    if (lote.estado !== 'ACTIVO') throw crearError('Solo se puede mover un lote activo.', 409);
    if (!datos.potrero) throw crearError('Selecciona el potrero de destino.');
    const fecha = datos.fechaEntrada || new Date();
    const cantidad = await PertenenciaLote.countDocuments({ lote: lote._id, activo: true });
    const activa = await RotacionPotrero.findOne({ loteRef: lote._id, estado: 'Activa' });
    if (activa && String(activa.potrero) === String(datos.potrero)) throw crearError('El lote ya se encuentra en ese potrero.', 409);
    const otraActiva = await RotacionPotrero.findOne({ potrero: datos.potrero, estado: 'Activa', _id: { $ne: activa?._id } });
    if (otraActiva) throw crearError('El potrero de destino ya tiene una rotación activa.', 409);
    if (activa) {
        activa.estado = 'Finalizada';
        activa.fechaSalida = fecha;
        activa.diasOcupado = Math.max(Math.round((new Date(fecha) - new Date(activa.fechaEntrada)) / MS_DIA), 0);
        await activa.save();
        await Potrero.findOneAndUpdate({ _id: activa.potrero, estado: { $ne: 'Mantenimiento' } }, { $set: { estado: 'Descanso' } });
    }
    const rotacion = await RotacionPotrero.create({
        potrero: datos.potrero,
        lote: lote.codigo,
        loteRef: lote._id,
        fechaEntrada: fecha,
        numeroAnimales: cantidad,
        estado: 'Activa',
        observaciones: datos.observaciones
    });
    const anterior = lote.ubicacionActual;
    lote.ubicacionActual = datos.potrero;
    await lote.save();
    await Potrero.findOneAndUpdate({ _id: datos.potrero, estado: { $ne: 'Mantenimiento' } }, { $set: { estado: 'Ocupado' } });
    await Animal.updateMany({ loteActual: lote._id, estado: 'Activo' }, { $set: { potreroActual: datos.potrero } });
    await registrarEventoOperativoLote({
        lote: lote._id,
        tipo: 'CAMBIO_POTRERO',
        titulo: 'Cambio de potrero',
        descripcion: datos.observaciones || 'El lote fue trasladado a otro potrero.',
        fecha,
        referenciaId: rotacion._id,
        entidadTipo: 'RotacionPotrero',
        usuarioId,
        metadata: { potreroAnterior: anterior || null, potreroNuevo: datos.potrero, numeroAnimales: cantidad }
    });
    return rotacion;
};

const obtenerResumenPesajes = async (lote, pertenencias) => {
    const ids = pertenencias.map((item) => item.animal?._id || item.animal).filter(Boolean);
    if (!ids.length) return { pesoPromedioActual: null, coberturaPesajes: { conPesaje: 0, total: 0 }, gmdPromedioLote: null, cumplimientoGmd: null, alcanzaronPesoObjetivo: 0 };
    const pesajes = await Pesaje.find({ animal: { $in: ids } }).sort({ fecha: 1 }).lean();
    const porAnimal = new Map(ids.map((id) => [String(id), []]));
    pesajes.forEach((pesaje) => porAnimal.get(String(pesaje.animal))?.push(pesaje));
    const ultimos = [];
    const pesosEntrada = [];
    const crecimientos = [];
    let alcanzaronPesoObjetivo = 0;
    pertenencias.forEach((pertenencia) => {
        const lista = porAnimal.get(String(pertenencia.animal?._id || pertenencia.animal)) || [];
        const fechaEntrada = new Date(pertenencia.fechaEntrada);
        const cercanoEntrada = [...lista].sort((a, b) => Math.abs(new Date(a.fecha) - fechaEntrada) - Math.abs(new Date(b.fecha) - fechaEntrada))[0];
        if (cercanoEntrada && Math.abs(new Date(cercanoEntrada.fecha) - fechaEntrada) <= 30 * MS_DIA) pesosEntrada.push(Number(cercanoEntrada.peso));
        if (lista.length) {
            const ultimo = lista[lista.length - 1];
            ultimos.push(Number(ultimo.peso));
            if (lote.pesoObjetivoKg && Number(ultimo.peso) >= Number(lote.pesoObjetivoKg)) alcanzaronPesoObjetivo += 1;
        }
        const desdeEntrada = lista.filter((pesaje) => new Date(pesaje.fecha) >= new Date(pertenencia.fechaEntrada));
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
        cumplimientoGmd: gmd !== null && lote.gmdObjetivoKgDia ? redondear((gmd / lote.gmdObjetivoKgDia) * 100, 1) : null,
        alcanzaronPesoObjetivo
    };
};

const obtenerResumenSanitario = async (animales) => {
    const ids = animales.map((animal) => animal._id);
    const estados = { Sano: 0, 'En observación': 0, Enfermo: 0, Recuperación: 0 };
    animales.forEach((animal) => { estados[animal.estadoSanitario || 'Sano'] = (estados[animal.estadoSanitario || 'Sano'] || 0) + 1; });
    const tratamientosActivos = ids.length ? await TratamientoSanitario.countDocuments({ animales: { $in: ids }, estado: 'Activo' }) : 0;
    return { estados, tratamientosActivos };
};

const obtenerResumenTareas = async (loteId) => {
    const tareas = await Tarea.find({ lote: loteId, estado: { $in: ['Pendiente', 'En proceso'] } }).sort({ fechaProgramada: 1 }).lean();
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return { pendientes: tareas.length, vencidas: tareas.filter((tarea) => new Date(tarea.fechaProgramada) < hoy).length, proxima: tareas[0] || null };
};

const obtenerDetalleLote = async (loteId) => {
    const lote = await Lote.findById(loteId).populate('ubicacionActual', 'codigo nombre').lean();
    if (!lote) throw crearError('Lote no encontrado.', 404);
    const pertenencias = await PertenenciaLote.find({ lote: loteId, activo: true })
        .populate('animal', 'diio identificadorFinca nombre sexo categoria objetivoProductivo pesoActual estado estadoSanitario potreroActual compraId camadaOrigen')
        .sort({ fechaEntrada: 1 }).lean();
    const animales = pertenencias.map((item) => item.animal).filter(Boolean);
    const [pesajes, sanidad, tareas, plan, racion, ultimoSuministro, etapas, rotaciones, eventos] = await Promise.all([
        obtenerResumenPesajes(lote, pertenencias),
        obtenerResumenSanitario(animales),
        obtenerResumenTareas(loteId),
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
        resumen: { diasActivo, ...pesajes, sanidad, tareas, origen, camadasOrigen },
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
    return { ...detalle, gmdObjetivoKgDia: undefined, resumen };
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
    obtenerResumenSanitario,
    registrarPesajesLote,
    crearTareaLote,
    moverLoteAPotrero,
    construirPrefijoCodigoLote,
    crearLoteRapido,
    proyectarDetalleLotePorPlan
};
