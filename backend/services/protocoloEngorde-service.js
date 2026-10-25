const { ejecutarNotificacionSegura, notificarTareasOrigen } = require('./tarea-notificacion-service');
const CicloEngorde = require('../models/CicloEngorde');
const EventoLote = require('../models/EventoLote');
const Lote = require('../models/Lote');
const PertenenciaLote = require('../models/PertenenciaLote');
const Pesaje = require('../models/Pesaje');
const { Tarea } = require('../models/Tarea');
const { ACCIONES_ENGORDE, PlantillaProtocoloEngorde } = require('../models/PlantillaProtocoloEngorde');
const { asignarRacionLote } = require('./alimentacion-service');
const { crearAplicacionSanitaria } = require('./aplicacionSanitaria-service');
const { cambiarEtapa, calcularResumenPesajes, normalizarFechaOperacion, obtenerDetalleLote, registrarEventoOperativoLote, registrarPesajesLote } = require('./lote-service');
const { tieneFeature } = require('./plan-service');
const { validarUsuarioAsignable } = require('./usuarioAsignable-service');
const { calcularCronograma, calcularCumplimiento, idTexto, normalizarPasos, validarPasos } = require('./protocoloScheduler-service');
const { obtenerFincaActual, obtenerOrganizacionActual } = require('../context/organizacion-context');
const { ejecutarEnTransaccion } = require('./mongo-transaccion-service');
const { sanitizarAplicacionSanitaria } = require('./sanidad-dto-service');

const errorProtocolo = (mensaje, status = 400, code = 'PROTOCOLO_ENGORDE') => Object.assign(new Error(mensaje), { status, code });
const seleccionar = (datos, campos) => Object.fromEntries(campos.filter((campo) => Object.hasOwn(datos || {}, campo)).map((campo) => [campo, datos[campo]]));
const limpiarPlantilla = (datos = {}) => seleccionar(datos, ['nombre', 'descripcion', 'alcance', 'activo', 'etapas']);

const rolesDeTareas = (plantilla) => [...new Set(
    (plantilla.etapas || [])
        .flatMap((etapa) => etapa.pasos || [])
        .filter((paso) => paso.generaTarea !== false)
        .map((paso) => paso.rolResponsable || 'Encargado')
)];

const validarResponsablesPorRol = async (plantilla, datos, responsableGeneral, session) => {
    const asignados = datos.responsablesPorRol && typeof datos.responsablesPorRol === 'object'
        ? datos.responsablesPorRol
        : {};
    const cache = new Map([[idTexto(responsableGeneral._id), responsableGeneral]]);
    const resultado = [];
    for (const rol of rolesDeTareas(plantilla)) {
        const usuarioId = asignados[rol]
            || (responsableGeneral.rol === rol || responsableGeneral.rol === 'Administrador' ? responsableGeneral._id : null);
        if (!usuarioId) throw errorProtocolo(`Selecciona un responsable compatible para el rol ${rol}.`, 400, 'RESPONSABLE_ROL_REQUERIDO');
        const clave = idTexto(usuarioId);
        const usuario = cache.get(clave) || await validarUsuarioAsignable(usuarioId, 'ProtocolosEngorde', { session });
        cache.set(clave, usuario);
        if (![rol, 'Administrador'].includes(usuario.rol)) {
            throw errorProtocolo(`${usuario.nombre} no tiene el rol requerido (${rol}) para estas tareas.`, 400, 'RESPONSABLE_ROL_INCOMPATIBLE');
        }
        resultado.push({ rol, usuario: usuario._id });
    }
    return resultado;
};

const prepararEtapas = (etapas = []) => {
    const preparadas = etapas.map((etapa, indice) => {
    const pasos = normalizarPasos(etapa.pasos || []);
    validarPasos(pasos, ACCIONES_ENGORDE);
    pasos.forEach((paso) => {
        if (['SANIDAD', 'REVISION_SANITARIA'].includes(paso.tipoAccion)
            && !['Administrador', 'Encargado', 'Veterinario'].includes(paso.rolResponsable || 'Encargado')) {
            throw errorProtocolo(`El paso sanitario ${paso.nombre} requiere Administrador, Encargado o Veterinario.`);
        }
    });
    return { ...etapa, orden: Number(etapa.orden ?? indice + 1), pasos };
    });
    const ids = preparadas.flatMap((etapa) => etapa.pasos.map((paso) => idTexto(paso._id)));
    if (new Set(ids).size !== ids.length) throw errorProtocolo('Los pasos deben tener IDs únicos en toda la plantilla.');
    return preparadas;
};

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

const listarPlantillas = async (incluirInactivas = false) => {
    const premium = await tieneFeature('reportesMultiFinca', obtenerOrganizacionActual());
    return PlantillaProtocoloEngorde.find({
        ...(incluirInactivas ? {} : { activo: true }),
        $or: [
            { alcance: 'FINCA', fincaId: obtenerFincaActual() },
            ...(premium ? [{ alcance: 'ORGANIZACION' }] : [])
        ]
    }).sort({ nombre: 1, version: -1 }).lean();
};

const resolverPlantillaAccesible = async (id, organizacionId, { activa = false, session = null } = {}) => {
    const premium = await tieneFeature('reportesMultiFinca', organizacionId || obtenerOrganizacionActual());
    const filtro = {
        _id: id,
        ...(activa ? { activo: true } : {}),
        $or: [
            { alcance: 'FINCA', fincaId: obtenerFincaActual() },
            ...(premium ? [{ alcance: 'ORGANIZACION' }] : [])
        ]
    };
    const consulta = PlantillaProtocoloEngorde.findOne(filtro);
    if (session) consulta.session(session);
    const plantilla = await consulta;
    if (!plantilla) throw errorProtocolo('Protocolo no encontrado o no disponible para esta finca.', 404, 'PROTOCOLO_NO_AUTORIZADO');
    return plantilla;
};

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
    return ejecutarEnTransaccion(async (session) => {
        const anterior = await resolverPlantillaAccesible(id, organizacionId, { session });
        const combinado = { ...anterior.toObject(), ...limpiarPlantilla(datos), activo: datos.activo ?? true, version: anterior.version + 1 };
        await validarAlcance(combinado, organizacionId);
        combinado.etapas = prepararEtapas(combinado.etapas);
        combinado.fincaId = combinado.alcance === 'ORGANIZACION' ? null : obtenerFincaActual();
        delete combinado._id; delete combinado.createdAt; delete combinado.updatedAt; delete combinado.__v;
        const [nueva] = await PlantillaProtocoloEngorde.create([{ ...combinado, creadoPor: usuarioId }], { session, ordered: true });
        anterior.activo = false;
        await anterior.save({ session });
        return nueva;
    });
};

const crearTareas = async (ciclo, responsable, opciones = {}) => {
    const { session = null, notificar = true } = opciones;
    for (const ejecucion of ciclo.ejecuciones) {
        const paso = ciclo.protocoloSnapshot.etapas.flatMap((etapa) => etapa.pasos).find((item) => idTexto(item._id) === idTexto(ejecucion.pasoId));
        if (!paso?.generaTarea) continue;
        const responsablePaso = ciclo.responsablesPorRol?.find((item) => item.rol === (paso.rolResponsable || 'Encargado'))?.usuario || responsable;
        const tarea = await Tarea.findOneAndUpdate(
            { claveAutomatica: `PROTOCOLO_ENGORDE:${ciclo._id}:${ejecucion.pasoId}` },
            { $setOnInsert: {
                titulo: `${paso.nombre} · ${ciclo.protocoloSnapshot.nombre}`,
                descripcion: paso.instrucciones || 'Actividad del protocolo de engorde.',
                tipo: paso.tipoAccion === 'PESAJE' ? 'Pesaje' : paso.tipoAccion === 'SANIDAD' || paso.tipoAccion === 'REVISION_SANITARIA' ? 'Sanidad' : paso.tipoAccion === 'CAMBIO_RACION' ? 'Alimentación' : paso.tipoAccion === 'EVALUAR_VENTA' ? 'Venta' : 'Otro',
                fechaProgramada: ejecucion.fechaProgramada,
                fechaLimite: ejecucion.ventanaFin,
                asignadoA: responsablePaso,
                creadoPor: ciclo.creadoPor,
                lote: ciclo.lote,
                moduloOrigen: 'ProtocoloEngorde',
                referenciaId: ciclo._id,
                creadoAutomaticamente: true,
                especie: 'Bovino',
                categoriaAutomatica: 'PROTOCOLO_ENGORDE',
                claveAutomatica: `PROTOCOLO_ENGORDE:${ciclo._id}:${ejecucion.pasoId}`
            } },
            { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
        );
        ejecucion.tarea = tarea._id;
    }
    await ciclo.save(session ? { session } : {});
    if (notificar) await ejecutarNotificacionSegura(() => notificarTareasOrigen({ referenciaId: ciclo._id, moduloOrigen: 'ProtocoloEngorde' }, ciclo.creadoPor));
};

const crearCiclo = async ({ datos, usuarioId, zonaHoraria }) => {
    let cicloId;
    await ejecutarEnTransaccion(async (session) => {
        const [lote, protocolo] = await Promise.all([
            Lote.findById(datos.lote).session(session),
            resolverPlantillaAccesible(datos.protocolo, obtenerOrganizacionActual(), { activa: true, session })
        ]);
        if (!lote) throw errorProtocolo('Lote no encontrado.', 404);
        if (lote.estado !== 'ACTIVO' || lote.especie !== 'Bovino' || lote.proposito !== 'ENGORDE') throw errorProtocolo('El protocolo solo puede iniciarse en un lote bovino de engorde activo.', 409);
        if (await CicloEngorde.exists({ lote: lote._id, estado: { $in: ['PROGRAMADO', 'ACTIVO'] } }).session(session)) throw errorProtocolo('El lote ya tiene un protocolo de engorde activo.', 409);
        const responsable = await validarUsuarioAsignable(datos.responsable, 'ProtocolosEngorde', { session });
        const pertenencias = await PertenenciaLote.find({ lote: lote._id, activo: true }).populate('animal', 'diio identificadorFinca nombre estado pesoActual').session(session);
        if (!pertenencias.length) throw errorProtocolo('El lote no tiene animales activos.', 409);
        const fechaInicio = normalizarFechaOperacion(datos.fechaInicio, zonaHoraria);
        if (fechaInicio < new Date(lote.fechaInicio)) throw errorProtocolo('El protocolo no puede iniciar antes que el lote.', 400, 'FECHA_PROTOCOLO_INVALIDA');
        const snapshot = protocolo.toObject();
        const responsablesPorRol = await validarResponsablesPorRol(snapshot, datos, responsable, session);
        const primeraEtapa = [...snapshot.etapas].sort((a, b) => a.orden - b.orden)[0];
        const ejecuciones = calcularCronograma({ pasos: primeraEtapa.pasos, fechaInicio }).map((item) => ({ ...item, etapaId: primeraEtapa._id, obligatorio: primeraEtapa.pasos.find((paso) => idTexto(paso._id) === idTexto(item.pasoId))?.obligatorio !== false }));
        const [ciclo] = await CicloEngorde.create([{
            lote: lote._id, protocolo: protocolo._id, protocoloVersion: protocolo.version, protocoloSnapshot: snapshot,
            fechaInicio, estado: 'ACTIVO', etapaActualId: primeraEtapa._id, responsable: responsable._id,
            responsablesPorRol,
            participantesSnapshot: pertenencias.map((item) => ({ animal: item.animal._id, diio: item.animal.diio || item.animal.identificadorFinca, nombre: item.animal.nombre, pesoInicialKg: item.animal.pesoActual })),
            historialEtapas: [{ etapaId: primeraEtapa._id, codigo: primeraEtapa.codigo, fechaInicio, avanzadoPor: usuarioId }], creadoPor: usuarioId
        }], { session, ordered: true });
        await crearTareas(ciclo, responsable._id, { session, notificar: false });
        if (lote.etapaOperativa !== primeraEtapa.codigo) await cambiarEtapa(lote._id, primeraEtapa.codigo, usuarioId, fechaInicio, { session, zonaHoraria });
        await registrarEventoOperativoLote({ lote: lote._id, tipo: 'PROTOCOLO_ENGORDE_INICIADO', titulo: 'Protocolo de engorde iniciado', descripcion: protocolo.nombre, referenciaId: ciclo._id, entidadTipo: 'CicloEngorde', usuarioId, session });
        cicloId = ciclo._id;
    });
    await ejecutarNotificacionSegura(() => notificarTareasOrigen({ referenciaId: cicloId, moduloOrigen: 'ProtocoloEngorde' }, usuarioId));
    return obtenerCiclo(cicloId);
};

const listarCiclos = (filtros = {}) => CicloEngorde.find({
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.lote ? { lote: filtros.lote } : {})
}).populate('lote', 'codigo nombre especie proposito etapaOperativa estado').populate('responsable', 'nombre apellido').populate('responsablesPorRol.usuario', 'nombre apellido').sort({ createdAt: -1 }).lean();

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
        const cumpleEvento = criterio.tipo === 'EVENTO' && ejecucionesEtapa.some((item) => item.tipoAccion === criterio.evento && item.estado === 'REALIZADO');
        const cumple = criterio.tipo === 'MANUAL' ? false : cumpleEvento || (actual != null && (criterio.operador === '<=' ? actual <= criterio.valor : criterio.operador === '=' ? actual === criterio.valor : actual >= criterio.valor));
        return { ...criterio, actual, cumple };
    });
    return { etapa: etapa || null, diasEnEtapa: dias, criterios: resultados, sugerirAvance: resultados.length > 0 && resultados.every((item) => item.cumple) };
};

const obtenerCiclo = async (id) => {
    const ciclo = await CicloEngorde.findById(id).populate('lote', 'codigo nombre etapaOperativa estado pesoObjetivoKg gmdObjetivoKgDia').populate('responsable', 'nombre apellido rol').populate('responsablesPorRol.usuario', 'nombre apellido').lean();
    if (!ciclo) throw errorProtocolo('Ciclo de engorde no encontrado.', 404);
    const detalle = await obtenerDetalleLote(ciclo.lote._id);
    return { ...ciclo, detalleLote: detalle, cumplimiento: calcularCumplimiento(ciclo.ejecuciones), evaluacionEtapa: evaluarCriterios(ciclo, detalle) };
};

const ejecutarPaso = async ({ cicloId, pasoId, datos = {}, usuarioId, rolUsuario, zonaHoraria }) => {
    let fueReplay = false;
    await ejecutarEnTransaccion(async (session) => {
        const ciclo = await CicloEngorde.findById(cicloId).session(session);
        if (!ciclo || ciclo.estado !== 'ACTIVO') throw errorProtocolo('El ciclo no está activo.', 409);
        const lote = await Lote.findById(ciclo.lote).session(session);
        if (!lote || lote.estado !== 'ACTIVO') throw errorProtocolo('El lote del ciclo ya no está activo.', 409, 'LOTE_NO_ACTIVO');
        const ejecucion = ciclo.ejecuciones.id(pasoId) || ciclo.ejecuciones.find((item) => idTexto(item.pasoId) === idTexto(pasoId));
        if (!ejecucion) throw errorProtocolo('Paso no encontrado.', 404);
        if (ejecucion.estado === 'REALIZADO') throw errorProtocolo('Esta actividad ya fue registrada.', 409, 'PASO_YA_REALIZADO');
        if (['OMITIDO', 'CANCELADO'].includes(ejecucion.estado)) throw errorProtocolo('Esta actividad ya no admite ejecución.', 409, 'PASO_NO_EJECUTABLE');
        const paso = ciclo.protocoloSnapshot.etapas.flatMap((etapa) => etapa.pasos).find((item) => idTexto(item._id) === idTexto(ejecucion.pasoId));
        const tarea = ejecucion.tarea ? await Tarea.findById(ejecucion.tarea).session(session) : null;
        if (tarea && !['Pendiente', 'En proceso'].includes(tarea.estado)) throw errorProtocolo('La tarea asociada ya no está disponible.', 409, 'TAREA_NO_EJECUTABLE');
        const asignada = tarea && idTexto(tarea.asignadoA) === idTexto(usuarioId);
        if (!rolPuedeEjecutarPaso({ rolUsuario, tipoAccion: paso.tipoAccion, asignada })) {
            throw errorProtocolo('Solo puedes ejecutar actividades asignadas a tu usuario.', 403, 'ACTIVIDAD_NO_ASIGNADA');
        }

        const fechaReal = normalizarFechaOperacion(datos.fechaReal, zonaHoraria);
        if (fechaReal < new Date(ciclo.fechaInicio)) throw errorProtocolo('La ejecución no puede ser anterior al inicio del ciclo.', 400, 'FECHA_EJECUCION_INVALIDA');
        const pertenencias = await PertenenciaLote.find({ lote: ciclo.lote, activo: true }).select('animal').session(session).lean();
        const miembros = pertenencias.map((item) => idTexto(item.animal));
        const conjuntoMiembros = new Set(miembros);
        const completados = new Set((ejecucion.animales || []).map(idTexto));
        let solicitados = [];
        if (paso.tipoAccion === 'PESAJE') solicitados = (datos.pesajes || []).filter((item) => item.peso !== '' && item.peso != null).map((item) => idTexto(item.animal));
        if (paso.tipoAccion === 'SANIDAD') solicitados = (datos.animales?.length ? datos.animales : miembros.filter((id) => !completados.has(id))).map(idTexto);
        if (['PESAJE', 'SANIDAD'].includes(paso.tipoAccion)) {
            if (!solicitados.length) throw errorProtocolo('Selecciona al menos un animal pendiente.', 400, 'SIN_PARTICIPANTES');
            if (solicitados.some((id) => !conjuntoMiembros.has(id))) {
                throw errorProtocolo('Todos los animales deben pertenecer activamente al lote.', 409, 'ANIMAL_FUERA_DEL_LOTE');
            }
        }
        const nuevos = solicitados.filter((id) => !completados.has(id));
        if (solicitados.length && !nuevos.length) {
            fueReplay = true;
            return;
        }

        const resultadoAnterior = ejecucion.resultado?.toObject?.() || ejecucion.resultado || {};
        const resultado = { ...resultadoAnterior, ...seleccionar(datos, ['observaciones', 'resultado']) };
        if (paso.tipoAccion === 'PESAJE') {
            const pesajesNuevos = (datos.pesajes || []).filter((item) => nuevos.includes(idTexto(item.animal)));
            const registrados = await registrarPesajesLote(ciclo.lote, { fecha: fechaReal, pesajes: pesajesNuevos, observaciones: datos.observaciones }, usuarioId, { session });
            resultado.pesajes = [...(resultadoAnterior.pesajes || []), ...registrados.map((item) => item._id)];
        }
        if (paso.tipoAccion === 'CAMBIO_RACION') {
            resultado.asignacion = await asignarRacionLote(ciclo.lote, { racion: datos.racion, fechaInicio: fechaReal, observaciones: datos.observaciones }, usuarioId, { session });
        }
        if (paso.tipoAccion === 'SANIDAD') {
            const aplicacion = sanitizarAplicacionSanitaria(datos.aplicacion || {});
            let responsable = null;
            if (aplicacion.responsableUsuario) {
                responsable = await validarUsuarioAsignable(aplicacion.responsableUsuario, 'Sanidad', { session });
            }
            const creada = await crearAplicacionSanitaria({
                ...seleccionar(aplicacion, ['producto', 'tipo', 'dosis', 'viaAplicacion', 'diasRetiroCarne', 'motivo', 'observaciones', 'responsableUsuario']),
                animales: nuevos,
                fechaAplicacion: fechaReal,
                especie: 'Bovino',
                naturaleza: 'Aplicacion unica',
                lote: ciclo.lote,
                responsable: responsable ? `${responsable.nombre} ${responsable.apellido || ''}`.trim() : undefined,
                claveIdempotencia: `PROTOCOLO_ENGORDE:${ciclo._id}:${ejecucion._id}:${[...nuevos].sort().join('-')}`
            }, usuarioId, { soloActivos: true, session });
            resultado.aplicaciones = [...(resultadoAnterior.aplicaciones || []), creada._id];
        }

        const acumulados = [...new Set([...completados, ...nuevos])];
        const requiereCobertura = ['PESAJE', 'SANIDAD'].includes(paso.tipoAccion);
        const completa = !requiereCobertura || miembros.every((id) => acumulados.includes(id));
        ejecucion.fechaReal = fechaReal;
        ejecucion.estado = completa ? 'REALIZADO' : 'PARCIAL';
        ejecucion.animales = acumulados;
        ejecucion.resultado = resultado;
        ejecucion.realizadoPor = usuarioId;
        if (tarea) {
            tarea.estado = completa ? 'Completada' : 'En proceso';
            tarea.fechaCompletada = completa ? fechaReal : undefined;
            tarea.observaciones = datos.observaciones;
            await tarea.save({ session });
        }

        const etapa = ciclo.protocoloSnapshot.etapas.find((item) => idTexto(item._id) === idTexto(ejecucion.etapaId));
        const historialEtapa = ciclo.historialEtapas.find((item) => idTexto(item.etapaId) === idTexto(ejecucion.etapaId));
        const recalculadas = calcularCronograma({ pasos: etapa.pasos, fechaInicio: historialEtapa?.fechaInicio || ciclo.fechaInicio, ejecuciones: ciclo.ejecuciones });
        for (const item of recalculadas) {
            const dependiente = ciclo.ejecuciones.find((actual) => idTexto(actual.etapaId) === idTexto(ejecucion.etapaId) && idTexto(actual.pasoId) === idTexto(item.pasoId));
            if (!dependiente || !['PENDIENTE', 'PARCIAL'].includes(dependiente.estado) || idTexto(dependiente._id) === idTexto(ejecucion._id)) continue;
            dependiente.fechaProgramada = item.fechaProgramada;
            dependiente.ventanaInicio = item.ventanaInicio;
            dependiente.ventanaFin = item.ventanaFin;
            if (dependiente.tarea) {
                await Tarea.updateOne(
                    { _id: dependiente.tarea, estado: { $in: ['Pendiente', 'En proceso'] } },
                    { $set: { fechaProgramada: item.fechaProgramada, fechaLimite: item.ventanaFin } },
                    { session }
                );
            }
        }
        await ciclo.save({ session });
        await registrarEventoOperativoLote({ lote: ciclo.lote, tipo: 'PASO_PROTOCOLO_ENGORDE', titulo: paso.nombre, descripcion: datos.observaciones, fecha: fechaReal, referenciaId: ciclo._id, entidadTipo: 'CicloEngorde', usuarioId, metadata: { pasoId: paso._id, ejecucionId: ejecucion._id, tipoAccion: paso.tipoAccion, estado: ejecucion.estado, animales: nuevos }, session });
    });
    return obtenerCiclo(cicloId, { replay: fueReplay });
};

const avanzarEtapa = async ({ cicloId, datos = {}, usuarioId, zonaHoraria }) => {
    await ejecutarEnTransaccion(async (session) => {
        const ciclo = await CicloEngorde.findById(cicloId).session(session);
        if (!ciclo || ciclo.estado !== 'ACTIVO') throw errorProtocolo('El ciclo no está activo.', 409);
        const etapas = [...ciclo.protocoloSnapshot.etapas].sort((a, b) => a.orden - b.orden);
        const actual = etapas.findIndex((item) => idTexto(item._id) === idTexto(ciclo.etapaActualId));
        const siguiente = etapas[actual + 1];
        if (!siguiente) throw errorProtocolo('No existe una etapa siguiente. Finaliza el ciclo si corresponde.', 409);
        if (datos.etapaId && idTexto(datos.etapaId) !== idTexto(siguiente._id)) {
            throw errorProtocolo('Solo se puede avanzar a la siguiente etapa del protocolo.', 409, 'TRANSICION_ETAPA_INVALIDA');
        }
        const pendientes = ciclo.ejecuciones.filter((item) => (
            idTexto(item.etapaId) === idTexto(ciclo.etapaActualId)
            && item.obligatorio !== false
            && item.estado !== 'REALIZADO'
        ));
        if (pendientes.length && !String(datos.motivoOmitirPendientes || '').trim()) {
            throw errorProtocolo('Completa las actividades obligatorias antes de avanzar o registra un motivo de omisión.', 409, 'PASOS_OBLIGATORIOS_PENDIENTES');
        }
        const fecha = normalizarFechaOperacion(datos.fecha, zonaHoraria);
        const abierto = ciclo.historialEtapas.find((item) => !item.fechaFin);
        if (abierto && fecha < new Date(abierto.fechaInicio)) throw errorProtocolo('La nueva etapa no puede iniciar antes de la etapa actual.', 400, 'FECHA_ETAPA_INVALIDA');
        for (const pendiente of pendientes) {
            pendiente.estado = 'OMITIDO';
            pendiente.resultado = { ...(pendiente.resultado || {}), motivoOmision: datos.motivoOmitirPendientes };
            if (pendiente.tarea) {
                await Tarea.updateOne(
                    { _id: pendiente.tarea, estado: { $in: ['Pendiente', 'En proceso'] } },
                    { $set: { estado: 'Cancelada', observaciones: datos.motivoOmitirPendientes } },
                    { session }
                );
            }
        }
        if (abierto) abierto.fechaFin = fecha;
        ciclo.etapaActualId = siguiente._id;
        ciclo.historialEtapas.push({ etapaId: siguiente._id, codigo: siguiente.codigo, fechaInicio: fecha, avanzadoPor: usuarioId });
        const nuevas = calcularCronograma({ pasos: siguiente.pasos, fechaInicio: fecha }).map((item) => ({ ...item, etapaId: siguiente._id, obligatorio: siguiente.pasos.find((paso) => idTexto(paso._id) === idTexto(item.pasoId))?.obligatorio !== false }));
        ciclo.ejecuciones.push(...nuevas);
        await ciclo.save({ session });
        await crearTareas(ciclo, ciclo.responsable, { session, notificar: false });
        await cambiarEtapa(ciclo.lote, siguiente.codigo, usuarioId, fecha, { session, zonaHoraria });
        await registrarEventoOperativoLote({
            lote: ciclo.lote,
            tipo: 'AVANCE_ETAPA_PROTOCOLO',
            titulo: `Avance a ${siguiente.nombre}`,
            descripcion: datos.motivoOmitirPendientes,
            fecha,
            referenciaId: ciclo._id,
            entidadTipo: 'CicloEngorde',
            usuarioId,
            metadata: { omitidos: pendientes.map((item) => item._id) },
            session
        });
    });
    await ejecutarNotificacionSegura(() => notificarTareasOrigen({ referenciaId: cicloId, moduloOrigen: 'ProtocoloEngorde' }, usuarioId));
    return obtenerCiclo(cicloId);
};

const cerrarCiclo = async ({ cicloId, estado, motivo, usuarioId }) => {
    if (!['FINALIZADO', 'CANCELADO'].includes(estado)) throw errorProtocolo('Estado final inválido.');
    let yaCerrado = false;
    await ejecutarEnTransaccion(async (session) => {
        const ciclo = await CicloEngorde.findById(cicloId).session(session);
        if (!ciclo) throw errorProtocolo('Ciclo no encontrado.', 404);
        if (['FINALIZADO', 'CANCELADO'].includes(ciclo.estado)) { yaCerrado = true; return; }
        const obligatoriasPendientes = ciclo.ejecuciones.filter((item) => item.obligatorio !== false && item.estado !== 'REALIZADO');
        if (estado === 'FINALIZADO' && obligatoriasPendientes.length) {
            throw errorProtocolo('No se puede finalizar mientras existan actividades obligatorias pendientes o parciales.', 409, 'PASOS_OBLIGATORIOS_PENDIENTES');
        }
        ciclo.estado = estado;
        ciclo.fechaFin = new Date();
        ciclo.motivoCierre = motivo;
        const abierto = ciclo.historialEtapas.find((item) => !item.fechaFin);
        if (abierto) abierto.fechaFin = ciclo.fechaFin;
        ciclo.ejecuciones.filter((item) => ['PENDIENTE', 'PARCIAL'].includes(item.estado)).forEach((item) => { item.estado = 'CANCELADO'; });
        await ciclo.save({ session });
        await Tarea.updateMany(
            { moduloOrigen: 'ProtocoloEngorde', referenciaId: ciclo._id, estado: { $in: ['Pendiente', 'En proceso'] } },
            { $set: { estado: 'Cancelada', observaciones: motivo } },
            { session }
        );
        await registrarEventoOperativoLote({
            lote: ciclo.lote,
            tipo: `PROTOCOLO_ENGORDE_${estado}`,
            titulo: estado === 'FINALIZADO' ? 'Protocolo de engorde finalizado' : 'Protocolo de engorde cancelado',
            descripcion: motivo,
            referenciaId: ciclo._id,
            entidadTipo: 'CicloEngorde',
            usuarioId,
            session
        });
    });
    return obtenerCiclo(cicloId, { yaCerrado });
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
        const resumen = calcularResumenPesajes(lote, pertenencias, pesajes);
        const animalesConPeso = Number(resumen.coberturaPesajes?.conPesaje || 0);
        const sumaPeso = animalesConPeso && resumen.pesoPromedioActual != null
            ? Number(resumen.pesoPromedioActual) * animalesConPeso
            : 0;
        const gananciaKg = Number(resumen.kilosGanadosTotales || 0);
        const animalDias = Number(resumen.animalDias || 0);
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
