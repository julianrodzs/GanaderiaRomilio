const { Tarea } = require('../models/Tarea');
const Animal = require('../models/Animal');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { rolTienePermiso } = require('../config/permisosRoles');
const { upsertEventoAnimal, eliminarEventosPorReferencia } = require('../services/eventoAnimal-service');
const { upsertEventoCamada, eliminarEventosCamadaPorReferencia } = require('../services/eventoCamada-service');
const {
    ejecutarNotificacionSegura,
    notificarComentarioTarea,
    notificarTareaAsignada,
    notificarTareaCompletada,
    notificarTareaModificada
} = require('../services/tarea-notificacion-service');
const { construirFiltroBusquedaTareas } = require('../services/tareaBusqueda-service');

const { randomUUID } = require('crypto');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { CAMPOS, limpiarDatosTarea, validarRelacionesTarea, esTareaEspecializada, esTareaVinculada, validarTransicionTarea, fechaEjecucionTarea, errorTarea } = require('../services/tarea-integridad-service');
const tareaCtrl = {};

const aplicarEfectosTareaCompletada = async (tarea, session) => {
    if (tarea.moduloOrigen !== 'Reproduccion' || tarea.especie !== 'Bovino'
        || tarea.claveAutomatica !== 'destete' || !tarea.animal || !tarea.referenciaId) return false;
    const ciclo = await RegistroReproductivo.findById(tarea.referenciaId).select('animal fechaPartoReal').session(session);
    if (!ciclo?.fechaPartoReal || String(ciclo.animal) === String(tarea.animal)) return false;
    if (tarea.fechaCompletada < ciclo.fechaPartoReal) throw errorTarea('El destete no puede ser anterior al parto.');
    const resultado = await Animal.updateOne(
        { _id: tarea.animal, madre: ciclo.animal, $or: [{ fechaDestete: null }, { fechaDestete: { $exists: false } }] },
        { $set: { fechaDestete: tarea.fechaCompletada } }, { session }
    );
    return resultado.modifiedCount === 1;
};
const POPULATE_TAREA = [
    { path: 'asignadoA', select: 'nombre apellido correo rol estado' },
    { path: 'creadoPor', select: 'nombre apellido correo rol' },
    {
        path: 'potrero',
        select: 'codigo nombre area estado pastoPrincipal',
        populate: { path: 'pastoPrincipal', select: 'nombre cultivar especieBase' }
    },
    { path: 'animal', select: 'diio identificadorFinca nombre sexo estado especie categoria' },
    { path: 'lote', select: 'codigo nombre especie proposito etapaOperativa estado' },
    { path: 'comentarios.usuario', select: 'nombre apellido correo rol' }
];

const puedeGestionarTareas = (req) => rolTienePermiso(req.usuario?.rol, 'tareas.gestionar');
const puedeVerTodasLasTareas = (req) => rolTienePermiso(req.usuario?.rol, 'tareas.verTodas');
const esAsignado = (req, tarea) => String(tarea.asignadoA?._id || tarea.asignadoA) === String(req.usuario?.id);
const esModoConsulta = (req) => req.usuario?.rol === 'Consulta';

const construirFiltros = (query = {}) => {
    const filtros = {};
    const { estado, prioridad, tipo, asignadoA, potrero, fechaInicio, fechaFin, especie, moduloOrigen, creadoAutomaticamente, categoriaAutomatica } = query;

    if (estado) filtros.estado = estado;
    if (prioridad) filtros.prioridad = prioridad;
    if (tipo) filtros.tipo = tipo;
    if (asignadoA) filtros.asignadoA = asignadoA;
    if (potrero) filtros.potrero = potrero;
    if (especie) filtros.especie = especie;
    if (moduloOrigen) filtros.moduloOrigen = moduloOrigen;
    if (categoriaAutomatica) filtros.categoriaAutomatica = categoriaAutomatica;
    if (creadoAutomaticamente !== undefined && creadoAutomaticamente !== '') {
        filtros.creadoAutomaticamente = creadoAutomaticamente === 'true';
    }

    if (fechaInicio || fechaFin) {
        filtros.fechaProgramada = {};
        if (fechaInicio) filtros.fechaProgramada.$gte = new Date(fechaInicio);
        if (fechaFin) {
            const fin = new Date(fechaFin);
            fin.setUTCHours(23, 59, 59, 999);
            filtros.fechaProgramada.$lte = fin;
        }
    }

    return filtros;
};

const obtenerTareaPoblada = (id) => Tarea.findById(id).populate(POPULATE_TAREA);

const sincronizarBitacoraTarea = async (tarea, usuarioId, session, desteteRegistrado = false) => {
    const datos = {
        tipoEvento: desteteRegistrado ? 'Destete' : 'Observacion',
        fecha: tarea.fechaCompletada,
        titulo: `Tarea completada: ${tarea.titulo}`,
        descripcion: tarea.observaciones || tarea.descripcion || 'Actividad de agenda completada; no sustituye un registro de negocio.',
        moduloOrigen: 'Tareas', referenciaId: tarea._id, creadoPor: usuarioId,
        metadata: { tarea: tarea._id, tipo: tarea.tipo, fechaRecepcion: tarea.fechaRecepcionCompletado }
    };
    if (tarea.claveAutomatica?.startsWith('camada-') && tarea.referenciaId) {
        const Camada = require('../models/Camada');
        if (!await Camada.exists({ _id: tarea.referenciaId }).session(session)) throw errorTarea('La camada de origen ya no está disponible.', 409);
        await upsertEventoCamada({ ...datos, camada: tarea.referenciaId }, { session });
    } else if (tarea.animal) {
        await upsertEventoAnimal({ ...datos, animal: tarea.animal }, { session });
    }
};

tareaCtrl.getTareas = async (req, res) => {
    try {
        if (!puedeVerTodasLasTareas(req)) {
            return res.status(403).json({ mensaje: 'No tienes permisos para ver todas las tareas' });
        }

        const tareas = await Tarea.find({
            ...construirFiltros(req.query),
            ...await construirFiltroBusquedaTareas(req.query.busqueda)
        })
            .populate(POPULATE_TAREA)
            .sort({ fechaProgramada: 1, prioridad: 1 });

        res.json(tareas);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener tareas', error: error.message });
    }
};

tareaCtrl.getMisTareas = async (req, res) => {
    try {
        const filtros = {
            ...construirFiltros(req.query),
            ...await construirFiltroBusquedaTareas(req.query.busqueda),
            asignadoA: req.usuario.id
        };

        const tareas = await Tarea.find(filtros)
            .populate(POPULATE_TAREA)
            .sort({ fechaProgramada: 1, prioridad: 1 });

        res.json(tareas);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener mis tareas', error: error.message });
    }
};

tareaCtrl.getTareaById = async (req, res) => {
    try {
        const tarea = await obtenerTareaPoblada(req.params.id);

        if (!tarea) {
            return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        }

        if (!puedeVerTodasLasTareas(req) && !esAsignado(req, tarea)) {
            return res.status(403).json({ mensaje: 'No tienes permisos para ver esta tarea' });
        }

        res.json(tarea);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener tarea', error: error.message });
    }
};

const responderError = (res, error) => res.status(error.name === 'VersionError' ? 409 : error.status || 400).json({
    mensaje: error.name === 'VersionError' ? 'La tarea cambió. Actualiza y revisa antes de reintentar.' : error.message,
    codigo: error.codigo || (error.name === 'VersionError' ? 'TAREA_MODIFICADA' : undefined)
});
const autorizarTarea = (req, tarea) => {
    if (!tarea) throw errorTarea('Tarea no encontrada.', 404);
    if (esModoConsulta(req) || (!puedeGestionarTareas(req) && !esAsignado(req, tarea))) throw errorTarea('No tienes permiso para modificar esta tarea.', 403);
};
const validarVersion = (tarea, valor) => {
    if (!valor) return;
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) throw errorTarea('Versión de tarea inválida.');
    if (tarea.updatedAt.getTime() !== fecha.getTime()) throw errorTarea('La tarea cambió. Revisa la versión actual antes de reintentar.', 409, 'TAREA_MODIFICADA');
};
const validarFechas = (tarea) => {
    if (tarea.fechaLimite && tarea.fechaLimite < tarea.fechaProgramada) throw errorTarea('La fecha límite no puede ser anterior a la programada.');
};

tareaCtrl.crearTarea = async (req, res) => {
    try {
        if (!puedeGestionarTareas(req)) throw errorTarea('No tienes permiso para crear tareas.', 403);
        const datos = limpiarDatosTarea(req.body);
        if (datos.estado && datos.estado !== 'Pendiente') throw errorTarea('Las tareas se crean pendientes; registra su ejecución por separado.');
        const tarea = await ejecutarEnTransaccion(async (session) => {
            await validarRelacionesTarea(datos, session);
            const nueva = new Tarea({ ...datos, organizacionId: req.organizacionId, fincaId: req.fincaId, creadoPor: req.usuario.id, asignacionVersion: randomUUID() });
            validarFechas(nueva);
            return nueva.save({ session });
        });
        await ejecutarNotificacionSegura(() => notificarTareaAsignada(tarea, req.usuario));
        res.status(201).json(await obtenerTareaPoblada(tarea._id));
    } catch (error) { responderError(res, error); }
};

const mutarTarea = async (req, res, modo) => {
    try {
        if (modo === 'editar' && !puedeGestionarTareas(req)) throw errorTarea('No tienes permiso para editar tareas.', 403);
        const campos = modo === 'editar' ? [...CAMPOS, 'versionEsperada', 'reapertura']
            : ['observaciones', 'versionEsperada', 'fechaEjecucionReal', ...(modo === 'estado' ? ['estado', 'reapertura'] : [])];
        const datos = limpiarDatosTarea(req.body, campos);
        const clave = String(req.get('Idempotency-Key') || '').trim();
        if (clave.length > 160) throw errorTarea('Clave de idempotencia inválida.');
        const resultado = await ejecutarEnTransaccion(async (session) => {
            const tarea = await Tarea.findById(req.params.id).select('+operacionesIdempotentes').session(session);
            autorizarTarea(req, tarea); // Nunca devolver replay ni metadatos antes de autorizar.
            const destino = modo === 'completar' ? 'Completada' : datos.estado || tarea.estado;
            const contenido = JSON.stringify({ observaciones: datos.observaciones || '', fechaEjecucionReal: datos.fechaEjecucionReal || '' });
            const previa = clave && tarea.operacionesIdempotentes.find((op) => op.clave === clave);
            if (previa) {
                if (modo !== 'completar' || String(previa.usuario) !== req.usuario.id || previa.tipo !== 'Completar tarea'
                    || tarea.estado !== 'Completada' || (previa.contenido && previa.contenido !== contenido)) throw errorTarea('La clave pertenece a otra operación o la tarea fue reabierta.', 409);
                return { id: tarea._id, replay: true };
            }
            if (modo === 'completar' && tarea.estado === 'Completada') throw errorTarea('La tarea ya está completada.', 409, 'TAREA_YA_COMPLETADA');
            validarVersion(tarea, datos.versionEsperada);
            validarTransicionTarea(tarea, destino, puedeGestionarTareas(req), datos.reapertura === true);
            if (esTareaVinculada(tarea) && ['animal', 'potrero', 'lote', 'tipo'].some((campo) => Object.hasOwn(datos, campo) && String(datos[campo] || '') !== String(tarea[campo] || ''))) throw errorTarea('No se puede cambiar el origen de una tarea vinculada.', 409);
            if (esTareaEspecializada(tarea) && ['fechaProgramada', 'fechaLimite'].some((campo) => Object.hasOwn(datos, campo) && new Date(datos[campo]).getTime() !== new Date(tarea[campo]).getTime())) throw errorTarea('Reprograma esta actividad desde su módulo de origen.', 409);
            const anterior = tarea.estado;
            const asignadoAnterior = String(tarea.asignadoA);
            const cambios = Object.fromEntries(Object.entries(datos).filter(([campo]) => CAMPOS.includes(campo)));
            await validarRelacionesTarea(cambios, session);
            Object.assign(tarea, cambios);
            tarea.estado = destino;
            if (asignadoAnterior !== String(tarea.asignadoA)) {
                tarea.asignacionModificadaManualmente = true;
                tarea.asignacionVersion = randomUUID();
            }
            validarFechas(tarea);
            if (destino === 'Completada' && anterior !== destino) {
                tarea.fechaRecepcionCompletado = new Date();
                tarea.fechaCompletada = fechaEjecucionTarea(datos.fechaEjecucionReal, tarea.fechaRecepcionCompletado);
                if (tarea.createdAt && tarea.fechaCompletada < tarea.createdAt) throw errorTarea('La ejecución no puede ser anterior a la creación de la tarea.');
                tarea.completadaOffline = Boolean(datos.fechaEjecucionReal);
                if (clave && modo === 'completar') tarea.operacionesIdempotentes = [...tarea.operacionesIdempotentes, { clave, tipo: 'Completar tarea', usuario: req.usuario.id, ejecutadaEn: tarea.fechaCompletada, contenido }].slice(-50);
            } else if (destino !== 'Completada' && anterior === 'Completada') {
                tarea.fechaCompletada = null;
                tarea.fechaRecepcionCompletado = null;
                tarea.completadaOffline = false;
                await eliminarEventosPorReferencia({ moduloOrigen: 'Tareas', referenciaId: tarea._id, session });
                await eliminarEventosCamadaPorReferencia({ moduloOrigen: 'Tareas', referenciaId: tarea._id, session });
            }
            await tarea.save({ session });
            if (destino === 'Completada' && anterior !== destino) {
                await validarRelacionesTarea({ animal: tarea.animal, potrero: tarea.potrero, lote: tarea.lote }, session);
                const destete = await aplicarEfectosTareaCompletada(tarea, session);
                await sincronizarBitacoraTarea(tarea, req.usuario.id, session, destete);
            }
            return { id: tarea._id, asignacion: asignadoAnterior !== String(tarea.asignadoA), completada: destino === 'Completada' && anterior !== destino };
        });
        const tarea = await obtenerTareaPoblada(resultado.id);
        if (resultado.replay) res.set('X-Idempotent-Replay', 'true');
        else {
            if (resultado.asignacion) await ejecutarNotificacionSegura(() => notificarTareaAsignada(tarea, req.usuario));
            await ejecutarNotificacionSegura(() => resultado.completada ? notificarTareaCompletada(tarea, req.usuario) : notificarTareaModificada(tarea, req.usuario));
        }
        res.json(tarea);
    } catch (error) { responderError(res, error); }
};
tareaCtrl.actualizarTarea = (req, res) => mutarTarea(req, res, 'editar');
tareaCtrl.cambiarEstadoTarea = (req, res) => mutarTarea(req, res, 'estado');
tareaCtrl.completarTarea = (req, res) => mutarTarea(req, res, 'completar');

tareaCtrl.eliminarTarea = async (req, res) => {
    try {
        if (!puedeGestionarTareas(req)) throw errorTarea('No tienes permiso para eliminar tareas.', 403);
        await ejecutarEnTransaccion(async (session) => {
            const tarea = await Tarea.findById(req.params.id).session(session);
            autorizarTarea(req, tarea);
            if (esTareaVinculada(tarea) || tarea.estado === 'Completada') throw errorTarea('La tarea conserva trazabilidad de origen. Cancélala o gestiónala desde su módulo; no puede borrarse.', 409);
            // save aplica el control de versión antes del borrado dentro de la transacción.
            tarea.observaciones = tarea.observaciones || 'Tarea eliminada';
            await tarea.save({ session });
            await Tarea.deleteOne({ _id: tarea._id, __v: tarea.__v }, { session });
            await eliminarEventosPorReferencia({ moduloOrigen: 'Tareas', referenciaId: tarea._id, session });
            await eliminarEventosCamadaPorReferencia({ moduloOrigen: 'Tareas', referenciaId: tarea._id, session });
            await require('../models/Notificacion').deleteMany({ entidadTipo: 'Tarea', entidadId: tarea._id }, { session });
        });
        res.json({ mensaje: 'Tarea eliminada' });
    } catch (error) { responderError(res, error); }
};

tareaCtrl.agregarComentario = async (req, res) => {
    try {
        const { texto } = limpiarDatosTarea(req.body, ['texto']);
        if (typeof texto !== 'string' || !texto.trim()) throw errorTarea('El comentario es requerido.');
        const comentarioId = await ejecutarEnTransaccion(async (session) => {
            const tarea = await Tarea.findById(req.params.id).session(session);
            autorizarTarea(req, tarea);
            tarea.comentarios.push({ usuario: req.usuario.id, texto: texto.trim() });
            await tarea.save({ session });
            return tarea.comentarios.at(-1)._id;
        });
        const tarea = await obtenerTareaPoblada(req.params.id);
        await ejecutarNotificacionSegura(() => notificarComentarioTarea(tarea, req.usuario, comentarioId));
        res.status(201).json(tarea);
    } catch (error) { responderError(res, error); }
};
module.exports = tareaCtrl;
