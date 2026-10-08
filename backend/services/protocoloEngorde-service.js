const CicloEngorde = require('../models/CicloEngorde');
const EventoLote = require('../models/EventoLote');
const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');
const Pesaje = require('../models/Pesaje');
const { Tarea } = require('../models/Tarea');
const { ACCIONES_ENGORDE, PlantillaProtocoloEngorde } = require('../models/PlantillaProtocoloEngorde');
const { asignarRacionLote } = require('./alimentacion-service');
const { crearAplicacionSanitaria } = require('./aplicacionSanitaria-service');
const { cambiarEtapa, obtenerDetalleLote, registrarEventoOperativoLote, registrarPesajesLote } = require('./lote-service');
const { tieneFeature } = require('./plan-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');
const { calcularCronograma, calcularCumplimiento, idTexto, normalizarPasos, validarPasos } = require('./protocoloScheduler-service');
const { obtenerFincaActual } = require('../context/organizacion-context');

const errorProtocolo = (mensaje, status = 400, code = 'PROTOCOLO_ENGORDE') => Object.assign(new Error(mensaje), { status, code });
const seleccionar = (datos, campos) => Object.fromEntries(campos.filter((campo) => Object.hasOwn(datos || {}, campo)).map((campo) => [campo, datos[campo]]));
const limpiarPlantilla = (datos = {}) => seleccionar(datos, ['nombre', 'descripcion', 'alcance', 'activo', 'etapas']);

const prepararEtapas = (etapas = []) => etapas.map((etapa, indice) => {
    const pasos = normalizarPasos(etapa.pasos || []);
    validarPasos(pasos, ACCIONES_ENGORDE);
    return { ...etapa, orden: Number(etapa.orden ?? indice + 1), pasos };
});

const validarAlcance = async (datos, organizacionId) => {
    if (datos.alcance === 'ORGANIZACION' && !await tieneFeature('reportesMultiFinca', organizacionId)) {
        throw errorProtocolo('Las plantillas compartidas entre fincas requieren el plan Premium.', 403, 'PLAN_FEATURE_REQUIRED');
    }
};

const rolPuedeEjecutarPaso = ({ rolUsuario, tipoAccion, asignada }) => {
    if (['Administrador', 'Encargado'].includes(rolUsuario)) return true;
    if (rolUsuario === 'Veterinario' && ['SANIDAD', 'REVISION_SANITARIA'].includes(tipoAccion)) return true;
    return Boolean(asignada);
};

const listarPlantillas = (incluirInactivas = false) => PlantillaProtocoloEngorde.find({
    ...(incluirInactivas ? {} : { activo: true }),
    $or: [{ fincaId: obtenerFincaActual() }, { alcance: 'ORGANIZACION' }]
}).sort({ nombre: 1, version: -1 }).lean();

const crearPlantilla = async ({ datos, usuarioId, organizacionId }) => {
    const limpio = limpiarPlantilla(datos);
    if (!String(limpio.nombre || '').trim()) throw errorProtocolo('El nombre del protocolo es requerido.');
    await validarAlcance(limpio, organizacionId);
    limpio.etapas = prepararEtapas(limpio.etapas);
    return PlantillaProtocoloEngorde.create({
        ...limpio,
        alcance: limpio.alcance || 'FINCA',
        fincaId: limpio.alcance === 'ORGANIZACION' ? null : obtenerFincaActual(),
        creadoPor: usuarioId
    });
};

const versionarPlantilla = async ({ id, datos, usuarioId, organizacionId }) => {
    const anterior = await PlantillaProtocoloEngorde.findById(id);
    if (!anterior) throw errorProtocolo('Protocolo no encontrado.', 404);
    const combinado = { ...anterior.toObject(), ...limpiarPlantilla(datos), activo: datos.activo ?? true, version: anterior.version + 1 };
    await validarAlcance(combinado, organizacionId);
    combinado.etapas = prepararEtapas(combinado.etapas);
    delete combinado._id; delete combinado.createdAt; delete combinado.updatedAt; delete combinado.__v;
    const nueva = await PlantillaProtocoloEngorde.create({ ...combinado, creadoPor: usuarioId });
    anterior.activo = false;
    await anterior.save();
    return nueva;
};

const crearTareas = async (ciclo, responsable) => {
    for (const ejecucion of ciclo.ejecuciones) {
        const paso = ciclo.protocoloSnapshot.etapas.flatMap((etapa) => etapa.pasos).find((item) => idTexto(item._id) === idTexto(ejecucion.pasoId));
        if (!paso?.generaTarea) continue;
        const tarea = await Tarea.findOneAndUpdate(
            { claveAutomatica: `PROTOCOLO_ENGORDE:${ciclo._id}:${ejecucion.pasoId}` },
            { $setOnInsert: {
                titulo: `${paso.nombre} · ${ciclo.protocoloSnapshot.nombre}`,
                descripcion: paso.instrucciones || 'Actividad del protocolo de engorde.',
                tipo: paso.tipoAccion === 'PESAJE' ? 'Pesaje' : paso.tipoAccion === 'SANIDAD' || paso.tipoAccion === 'REVISION_SANITARIA' ? 'Sanidad' : paso.tipoAccion === 'CAMBIO_RACION' ? 'Alimentación' : paso.tipoAccion === 'EVALUAR_VENTA' ? 'Venta' : 'Otro',
                fechaProgramada: ejecucion.fechaProgramada,
                fechaLimite: ejecucion.ventanaFin,
                asignadoA: responsable,
                creadoPor: ciclo.creadoPor,
                lote: ciclo.lote,
                moduloOrigen: 'ProtocoloEngorde',
                referenciaId: ciclo._id,
                creadoAutomaticamente: true,
                especie: 'Bovino',
                categoriaAutomatica: 'PROTOCOLO_ENGORDE',
                claveAutomatica: `PROTOCOLO_ENGORDE:${ciclo._id}:${ejecucion.pasoId}`
            } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        ejecucion.tarea = tarea._id;
    }
    await ciclo.save();
};

const crearCiclo = async ({ datos, usuarioId }) => {
    const [lote, protocolo] = await Promise.all([Lote.findById(datos.lote), PlantillaProtocoloEngorde.findById(datos.protocolo)]);
    if (!lote) throw errorProtocolo('Lote no encontrado.', 404);
    if (!protocolo?.activo) throw errorProtocolo('Selecciona un protocolo activo.', 409);
    if (lote.estado !== 'ACTIVO' || lote.especie !== 'Bovino' || lote.proposito !== 'ENGORDE') throw errorProtocolo('El protocolo solo puede iniciarse en un lote bovino de engorde activo.', 409);
    if (await CicloEngorde.exists({ lote: lote._id, estado: { $in: ['PROGRAMADO', 'ACTIVO'] } })) throw errorProtocolo('El lote ya tiene un protocolo de engorde activo.', 409);
    const responsable = await validarUsuarioAsignable(datos.responsable, 'ProtocolosEngorde');
    const pertenencias = await PertenenciaLote.find({ lote: lote._id, activo: true }).populate('animal', 'diio identificadorFinca nombre estado pesoActual').lean();
    if (!pertenencias.length) throw errorProtocolo('El lote no tiene animales activos.', 409);
    const fechaInicio = new Date(datos.fechaInicio || Date.now());
    const snapshot = protocolo.toObject();
    const primeraEtapa = [...snapshot.etapas].sort((a, b) => a.orden - b.orden)[0];
    const ejecuciones = calcularCronograma({ pasos: primeraEtapa.pasos, fechaInicio }).map((item) => ({ ...item, etapaId: primeraEtapa._id, obligatorio: primeraEtapa.pasos.find((paso) => idTexto(paso._id) === idTexto(item.pasoId))?.obligatorio !== false }));
    const ciclo = await CicloEngorde.create({
        lote: lote._id, protocolo: protocolo._id, protocoloVersion: protocolo.version, protocoloSnapshot: snapshot,
        fechaInicio, estado: 'ACTIVO', etapaActualId: primeraEtapa._id, responsable: responsable._id,
        participantesSnapshot: pertenencias.map((item) => ({ animal: item.animal._id, diio: item.animal.diio || item.animal.identificadorFinca, nombre: item.animal.nombre, pesoInicialKg: item.animal.pesoActual })),
        historialEtapas: [{ etapaId: primeraEtapa._id, codigo: primeraEtapa.codigo, fechaInicio, avanzadoPor: usuarioId }], creadoPor: usuarioId
    });
    await crearTareas(ciclo, responsable._id);
    if (lote.etapaOperativa !== primeraEtapa.codigo) await cambiarEtapa(lote._id, primeraEtapa.codigo, usuarioId, fechaInicio);
    await registrarEventoOperativoLote({ lote: lote._id, tipo: 'PROTOCOLO_ENGORDE_INICIADO', titulo: 'Protocolo de engorde iniciado', descripcion: protocolo.nombre, referenciaId: ciclo._id, entidadTipo: 'CicloEngorde', usuarioId });
    return obtenerCiclo(ciclo._id);
};

const listarCiclos = (filtros = {}) => CicloEngorde.find({
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.lote ? { lote: filtros.lote } : {})
}).populate('lote', 'codigo nombre especie proposito etapaOperativa estado').populate('responsable', 'nombre apellido').sort({ createdAt: -1 }).lean();

const obtenerActividadPorTarea = async ({ tareaId, usuarioId, rolUsuario }) => {
    const tarea = await Tarea.findOne({ _id: tareaId, categoriaAutomatica: 'PROTOCOLO_ENGORDE' }).lean();
    if (!tarea) throw errorProtocolo('Actividad de engorde no encontrada.', 404);
    if (!['Administrador', 'Encargado'].includes(rolUsuario) && idTexto(tarea.asignadoA) !== idTexto(usuarioId)) throw errorProtocolo('Esta actividad está asignada a otro usuario.', 403);
    const ciclo = await obtenerCiclo(tarea.referenciaId);
    const ejecucion = ciclo.ejecuciones.find((item) => idTexto(item.tarea) === idTexto(tareaId));
    if (!ejecucion) throw errorProtocolo('La tarea no está vinculada a una ejecución vigente.', 409);
    return { tarea, ciclo, ejecucion };
};

const evaluarCriterios = (ciclo, detalle) => {
    const etapa = ciclo.protocoloSnapshot.etapas.find((item) => idTexto(item._id) === idTexto(ciclo.etapaActualId));
    const historial = ciclo.historialEtapas.find((item) => idTexto(item.etapaId) === idTexto(etapa?._id) && !item.fechaFin);
    const dias = historial ? Math.max(0, Math.floor((Date.now() - new Date(historial.fechaInicio)) / 86400000)) : 0;
    const valores = { TIEMPO: dias, PESO_PROMEDIO: detalle.resumen?.pesoPromedioActual, GMD: detalle.resumen?.gmdPromedioLote };
    const ejecucionesEtapa = ciclo.ejecuciones.filter((item) => idTexto(item.etapaId) === idTexto(etapa?._id));
    const resultados = (etapa?.criteriosSalida || []).map((criterio) => {
        const actual = valores[criterio.tipo];
        const cumpleEvento = criterio.tipo === 'EVENTO' && ejecucionesEtapa.some((item) => item.tipoAccion === criterio.evento && ['REALIZADO', 'PARCIAL'].includes(item.estado));
        const cumple = criterio.tipo === 'MANUAL' ? false : cumpleEvento || (actual != null && (criterio.operador === '<=' ? actual <= criterio.valor : criterio.operador === '=' ? actual === criterio.valor : actual >= criterio.valor));
        return { ...criterio, actual, cumple };
    });
    return { etapa: etapa || null, diasEnEtapa: dias, criterios: resultados, sugerirAvance: resultados.length > 0 && resultados.every((item) => item.cumple) };
};

const obtenerCiclo = async (id) => {
    const ciclo = await CicloEngorde.findById(id).populate('lote', 'codigo nombre etapaOperativa estado pesoObjetivoKg gmdObjetivoKgDia').populate('responsable', 'nombre apellido rol').lean();
    if (!ciclo) throw errorProtocolo('Ciclo de engorde no encontrado.', 404);
    const detalle = await obtenerDetalleLote(ciclo.lote._id);
    return { ...ciclo, detalleLote: detalle, cumplimiento: calcularCumplimiento(ciclo.ejecuciones), evaluacionEtapa: evaluarCriterios(ciclo, detalle) };
};

const ejecutarPaso = async ({ cicloId, pasoId, datos = {}, usuarioId, rolUsuario }) => {
    const ciclo = await CicloEngorde.findById(cicloId);
    if (!ciclo || ciclo.estado !== 'ACTIVO') throw errorProtocolo('El ciclo no está activo.', 409);
    const ejecucion = ciclo.ejecuciones.id(pasoId) || ciclo.ejecuciones.find((item) => idTexto(item.pasoId) === idTexto(pasoId));
    if (!ejecucion) throw errorProtocolo('Paso no encontrado.', 404);
    if (ejecucion.estado === 'REALIZADO') throw errorProtocolo('Esta actividad ya fue registrada.', 409, 'PASO_YA_REALIZADO');
    const paso = ciclo.protocoloSnapshot.etapas.flatMap((etapa) => etapa.pasos).find((item) => idTexto(item._id) === idTexto(ejecucion.pasoId));
    const asignada = ejecucion.tarea && await Tarea.exists({ _id: ejecucion.tarea, asignadoA: usuarioId });
    if (!rolPuedeEjecutarPaso({ rolUsuario, tipoAccion: paso.tipoAccion, asignada })) {
        throw errorProtocolo('Solo puedes ejecutar actividades asignadas a tu usuario.', 403, 'ACTIVIDAD_NO_ASIGNADA');
    }
    let resultado = seleccionar(datos, ['observaciones', 'resultado']);
    if (paso.tipoAccion === 'PESAJE') resultado.pesajes = await registrarPesajesLote(ciclo.lote, { fecha: datos.fechaReal, pesajes: datos.pesajes, observaciones: datos.observaciones }, usuarioId);
    if (paso.tipoAccion === 'CAMBIO_RACION') resultado.asignacion = await asignarRacionLote(ciclo.lote, { racion: datos.racion, fechaInicio: datos.fechaReal, observaciones: datos.observaciones }, usuarioId);
    if (paso.tipoAccion === 'SANIDAD') {
        const miembros = await PertenenciaLote.find({ lote: ciclo.lote, activo: true }).select('animal').lean();
        resultado.aplicacion = await crearAplicacionSanitaria({ ...datos.aplicacion, animales: datos.animales?.length ? datos.animales : miembros.map((item) => item.animal), fechaAplicacion: datos.fechaReal || new Date(), especie: 'Bovino', naturaleza: 'Aplicacion unica', lote: ciclo.lote }, usuarioId, { soloActivos: true });
    }
    ejecucion.fechaReal = datos.fechaReal || new Date(); ejecucion.estado = datos.estado === 'PARCIAL' ? 'PARCIAL' : 'REALIZADO'; ejecucion.animales = datos.animales || []; ejecucion.resultado = resultado; ejecucion.realizadoPor = usuarioId;
    if (ejecucion.tarea) await Tarea.updateOne({ _id: ejecucion.tarea }, { $set: { estado: 'Completada', fechaCompletada: ejecucion.fechaReal, observaciones: datos.observaciones } });
    await ciclo.save();
    await registrarEventoOperativoLote({ lote: ciclo.lote, tipo: 'PASO_PROTOCOLO_ENGORDE', titulo: paso.nombre, descripcion: datos.observaciones, referenciaId: ciclo._id, entidadTipo: 'CicloEngorde', usuarioId, metadata: { pasoId: paso._id, tipoAccion: paso.tipoAccion } });
    return obtenerCiclo(ciclo._id);
};

const avanzarEtapa = async ({ cicloId, datos = {}, usuarioId }) => {
    const ciclo = await CicloEngorde.findById(cicloId);
    if (!ciclo || ciclo.estado !== 'ACTIVO') throw errorProtocolo('El ciclo no está activo.', 409);
    const etapas = [...ciclo.protocoloSnapshot.etapas].sort((a, b) => a.orden - b.orden);
    const actual = etapas.findIndex((item) => idTexto(item._id) === idTexto(ciclo.etapaActualId));
    const siguiente = datos.etapaId ? etapas.find((item) => idTexto(item._id) === idTexto(datos.etapaId)) : etapas[actual + 1];
    if (!siguiente) throw errorProtocolo('No existe una etapa siguiente. Finaliza el ciclo si corresponde.', 409);
    const fecha = new Date(datos.fecha || Date.now());
    const abierto = ciclo.historialEtapas.find((item) => !item.fechaFin); if (abierto) abierto.fechaFin = fecha;
    ciclo.etapaActualId = siguiente._id; ciclo.historialEtapas.push({ etapaId: siguiente._id, codigo: siguiente.codigo, fechaInicio: fecha, avanzadoPor: usuarioId });
    const nuevas = calcularCronograma({ pasos: siguiente.pasos, fechaInicio: fecha }).map((item) => ({ ...item, etapaId: siguiente._id, obligatorio: siguiente.pasos.find((paso) => idTexto(paso._id) === idTexto(item.pasoId))?.obligatorio !== false }));
    ciclo.ejecuciones.push(...nuevas);
    await ciclo.save();
    await crearTareas(ciclo, ciclo.responsable);
    await cambiarEtapa(ciclo.lote, siguiente.codigo, usuarioId, fecha);
    return obtenerCiclo(ciclo._id);
};

const cerrarCiclo = async ({ cicloId, estado, motivo, usuarioId }) => {
    const ciclo = await CicloEngorde.findById(cicloId);
    if (!ciclo) throw errorProtocolo('Ciclo no encontrado.', 404);
    if (!['FINALIZADO', 'CANCELADO'].includes(estado)) throw errorProtocolo('Estado final inválido.');
    if (['FINALIZADO', 'CANCELADO'].includes(ciclo.estado)) return obtenerCiclo(ciclo._id);
    ciclo.estado = estado; ciclo.fechaFin = new Date(); ciclo.motivoCierre = motivo;
    const abierto = ciclo.historialEtapas.find((item) => !item.fechaFin); if (abierto) abierto.fechaFin = ciclo.fechaFin;
    ciclo.ejecuciones.filter((item) => item.estado === 'PENDIENTE').forEach((item) => { item.estado = 'CANCELADO'; });
    await ciclo.save();
    await Tarea.updateMany({ moduloOrigen: 'ProtocoloEngorde', referenciaId: ciclo._id, estado: { $in: ['Pendiente', 'En proceso'] } }, { $set: { estado: 'Cancelada' } });
    await EventoLote.create({ lote: ciclo.lote, tipo: `PROTOCOLO_ENGORDE_${estado}`, titulo: estado === 'FINALIZADO' ? 'Protocolo de engorde finalizado' : 'Protocolo de engorde cancelado', descripcion: motivo, referenciaId: ciclo._id, entidadTipo: 'CicloEngorde', registradoPor: usuarioId });
    return obtenerCiclo(ciclo._id);
};

const obtenerCandidatosVenta = async (cicloId) => {
    const ciclo = await obtenerCiclo(cicloId);
    const objetivo = Number(ciclo.detalleLote.pesoObjetivoKg || ciclo.evaluacionEtapa.etapa?.pesoObjetivoKg || 0);
    const ids = ciclo.detalleLote.animales.map((item) => item._id);
    const pesajes = await Pesaje.find({ animal: { $in: ids } }).sort({ fecha: -1 }).lean();
    const vistos = new Set();
    return pesajes.filter((item) => !vistos.has(idTexto(item.animal)) && vistos.add(idTexto(item.animal))).filter((item) => !objetivo || item.peso >= objetivo).map((item) => ({ animal: item.animal, pesoKg: item.peso, fecha: item.fecha, pesoObjetivoKg: objetivo || null }));
};

const consolidar = async ({ fincasAutorizadas = [] }) => {
    const filtro = { estado: 'ACTIVO', ...(fincasAutorizadas.length ? { fincaId: { $in: fincasAutorizadas } } : {}) };
    const ciclos = await CicloEngorde.find(filtro).setOptions({ omitirAislamientoFinca: true }).lean();
    const porFinca = new Map();
    for (const ciclo of ciclos) {
        const [lote, pertenencias] = await Promise.all([
            Lote.findById(ciclo.lote).setOptions({ omitirAislamientoFinca: true }).lean(),
            PertenenciaLote.find({ lote: ciclo.lote, activo: true }).setOptions({ omitirAislamientoFinca: true }).lean()
        ]);
        if (!lote) continue;
        const ids = pertenencias.map((item) => item.animal);
        const pesajes = ids.length ? await Pesaje.find({ animal: { $in: ids } }).setOptions({ omitirAislamientoFinca: true }).sort({ fecha: 1 }).lean() : [];
        const porAnimal = new Map(ids.map((id) => [idTexto(id), []]));
        pesajes.forEach((item) => porAnimal.get(idTexto(item.animal))?.push(item));
        let sumaPeso = 0; let animalesConPeso = 0; let gananciaKg = 0; let animalDias = 0;
        porAnimal.forEach((lista) => {
            if (lista.length) { sumaPeso += Number(lista.at(-1).peso); animalesConPeso += 1; }
            if (lista.length >= 2) { const dias = (new Date(lista.at(-1).fecha) - new Date(lista[0].fecha)) / 86400000; if (dias > 0) { gananciaKg += Number(lista.at(-1).peso) - Number(lista[0].peso); animalDias += dias; } }
        });
        const clave = idTexto(ciclo.fincaId);
        const actual = porFinca.get(clave) || { fincaId: ciclo.fincaId, lotesActivos: 0, animales: 0, sumaPeso: 0, animalesConPeso: 0, gananciaKg: 0, animalDias: 0, sumaDiasLote: 0, lotesListosVenta: 0, pasos: [] };
        actual.lotesActivos += 1; actual.animales += ids.length; actual.sumaPeso += sumaPeso; actual.animalesConPeso += animalesConPeso; actual.gananciaKg += gananciaKg; actual.animalDias += animalDias; actual.sumaDiasLote += Math.max(0, (Date.now() - new Date(ciclo.fechaInicio)) / 86400000);
        const objetivo = Number(lote.pesoObjetivoKg || 0); const promedio = animalesConPeso ? sumaPeso / animalesConPeso : null;
        if (lote.etapaOperativa === 'LISTO_VENTA' || (objetivo && promedio >= objetivo)) actual.lotesListosVenta += 1;
        actual.pasos.push(...ciclo.ejecuciones); porFinca.set(clave, actual);
    }
    return [...porFinca.values()].map((item) => ({
        fincaId: item.fincaId, lotesActivos: item.lotesActivos, animales: item.animales,
        pesoPromedioKg: item.animalesConPeso ? Number((item.sumaPeso / item.animalesConPeso).toFixed(2)) : null,
        coberturaPeso: { conDato: item.animalesConPeso, total: item.animales },
        gmdKgDia: item.animalDias ? Number((item.gananciaKg / item.animalDias).toFixed(3)) : null,
        diasPromedio: item.lotesActivos ? Number((item.sumaDiasLote / item.lotesActivos).toFixed(1)) : null,
        lotesListosVenta: item.lotesListosVenta, cumplimiento: calcularCumplimiento(item.pasos)
    }));
};

module.exports = { avanzarEtapa, cerrarCiclo, consolidar, crearCiclo, crearPlantilla, ejecutarPaso, listarCiclos, listarPlantillas, obtenerActividadPorTarea, obtenerCandidatosVenta, obtenerCiclo, prepararEtapas, rolPuedeEjecutarPaso, versionarPlantilla };
