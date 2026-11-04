const Programa = require('../models/ProgramaTransferencia');
const Animal = require('../models/Animal');
const { Tarea } = require('../models/Tarea');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { ejecutarEnTransaccion } = require('../services/mongo-transaccion-service');
const { validarUsuarioAsignable } = require('../services/usuarioAsignable-service');
const { seleccionar, validarServicio, registrarEventosMetodo } = require('../services/servicioReproductivo-service');
const { error } = require('../services/metodoReproductivo-service');
const { obtenerDuracionGestacionBovina } = require('../services/duracionGestacion-service');
const { obtenerFincaActual } = require('../context/organizacion-context');
const manejar = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(e.status || 400).json({ mensaje: e.message }); } };
exports.listar = manejar(async () => {
    const programas = await Programa.find({}).populate('donanteId padreId', 'nombre diio').sort({ fechaColecta: -1 }).lean();
    for (const p of programas) {
        const ciclos = await RegistroReproductivo.find({ _id: { $in: p.embriones.map((e) => e.registroReproductivoId).filter(Boolean) } }).lean();
        const prenadas = ciclos.filter((c) => c.gestacionConfirmada && c.estadoAtribucion === 'CONFIRMADA' && c.metodo === 'TRANSFERENCIA_EMBRIONES').length;
        p.metricas = { disponibles: p.embriones.filter((e) => e.estado === 'DISPONIBLE').length, transferidos: ciclos.length, prenadas,
            costoPorEmbrion: p.embriones.length ? p.costoTotal / p.embriones.length : null, costoPorPrenez: prenadas ? p.costoTotal / prenadas : null, moneda: p.moneda };
    }
    return programas;
});
exports.crear = manejar(async (req) => ejecutarEnTransaccion(async (session) => {
    const d = seleccionar(req.body, ['nombre', 'fechaColecta', 'donanteId', 'donanteExternaNombre', 'donanteRegistro', 'donanteRaza', 'padreId', 'padreExternoNombre', 'diioPadre', 'origenEmbrion', 'costoTotal', 'moneda', 'embriones', 'claveIdempotencia']);
    if (d.claveIdempotencia) { const existente = await Programa.findOne({ claveIdempotencia: d.claveIdempotencia }).session(session); if (existente) return existente; }
    if (!Array.isArray(d.embriones) || !d.embriones.length || d.embriones.length > 1000) throw error('Registre entre 1 y 1000 embriones.');
    if (!d.donanteId && !d.donanteExternaNombre) throw error('Indique la donante.');
    if (d.donanteId && !await Animal.findOne({ _id: d.donanteId, sexo: 'Hembra', especie: 'Bovino' }).session(session)) throw error('Donante no encontrada.');
    if (d.padreId && !await Animal.findOne({ _id: d.padreId, sexo: 'Macho', especie: 'Bovino' }).session(session)) throw error('Padre no encontrado.');
    const codigos = new Set();
    for (const e of d.embriones) { seleccionar(e, ['codigo', 'estadoEmbrion', 'grado', 'estadio']); if (!e.codigo?.trim() || codigos.has(e.codigo.trim())) throw error('Los codigos de embriones no pueden repetirse.'); codigos.add(e.codigo.trim()); }
    const [p] = await Programa.create([{ ...d, creadoPor: req.usuario.id }], { session, ordered: true }); return p;
}));
exports.programar = manejar(async (req) => ejecutarEnTransaccion(async (session) => {
    const d = seleccionar(req.body, ['embrionId', 'receptoraId', 'fechaProgramada', 'responsable', 'sincronizacion']);
    const p = await Programa.findById(req.params.id).session(session); if (!p) throw error('Programa no encontrado.', 404);
    const e = p.embriones.id(d.embrionId); if (!e) throw error('Embrion no encontrado.', 404);
    if (e.estado !== 'DISPONIBLE') throw error('El embrion ya esta reservado o transferido.', 409);
    const receptora = await Animal.findOne({ _id: d.receptoraId, sexo: 'Hembra', especie: 'Bovino', estado: 'Activo' }).session(session);
    if (!receptora || String(p.donanteId) === String(receptora._id)) throw error('Receptora no valida.');
    await validarUsuarioAsignable(d.responsable, 'Reproduccion', { session });
    if (!d.fechaProgramada || Number.isNaN(+new Date(d.fechaProgramada))) throw error('Fecha programada invalida.');
    if (d.sincronizacion && (!Array.isArray(d.sincronizacion) || d.sincronizacion.length > 30)) throw error('Calendario de sincronizacion invalido.');
    const sincronizacion = [];
    for (const paso of d.sincronizacion || []) {
        seleccionar(paso, ['actividad', 'fecha']);
        if (!paso.actividad?.trim() || !paso.fecha || Number.isNaN(+new Date(paso.fecha)) || new Date(paso.fecha) > new Date(d.fechaProgramada)) throw error('La actividad de sincronizacion requiere nombre y fecha anterior a la transferencia.');
        const [tarea] = await Tarea.create([{ titulo: `${paso.actividad} · ${receptora.diio || receptora.identificadorFinca}`, tipo: 'Reproducción', estado: 'Pendiente',
            fechaProgramada: paso.fecha, fechaLimite: paso.fecha, asignadoA: d.responsable, creadoPor: req.usuario.id, animal: receptora._id,
            moduloOrigen: 'Reproduccion', especie: 'Bovino', referenciaId: p._id, creadoAutomaticamente: true, categoriaAutomatica: 'Transferencia de embriones', claveAutomatica: `te:${e._id}:sincronizacion:${sincronizacion.length}`
        }], { session, ordered: true });
        sincronizacion.push({ ...paso, tareaId: tarea._id });
    }
    const [t] = await Tarea.create([{ titulo: `Transferencia de embrion ${e.codigo} · ${receptora.diio || receptora.identificadorFinca}`, tipo: 'Reproducción', estado: 'Pendiente', fechaProgramada: d.fechaProgramada, fechaLimite: d.fechaProgramada,
        asignadoA: d.responsable, creadoPor: req.usuario.id, animal: receptora._id, moduloOrigen: 'Reproduccion', especie: 'Bovino', referenciaId: p._id, creadoAutomaticamente: true,
        categoriaAutomatica: 'Transferencia de embriones', claveAutomatica: `te:${e._id}` }], { session, ordered: true });
    Object.assign(e, d, { sincronizacion, estado: 'RESERVADO', tareaId: t._id }); await p.save({ session }); return p;
}));
exports.transferir = manejar(async (req) => {
  const programa = await ejecutarEnTransaccion(async (session) => {
    const d = seleccionar(req.body, ['embrionId', 'fechaServicio']);
    const p = await Programa.findById(req.params.id).session(session); if (!p) throw error('Programa no encontrado.', 404);
    const e = p.embriones.id(d.embrionId); if (!e) throw error('Embrion no encontrado.', 404);
    if (e.estado === 'TRANSFERIDO') { p.$locals.repetida = true; return p; }
    if (e.estado !== 'RESERVADO') throw error('Primero asigne una receptora.', 409);
    await Animal.updateOne({ _id: e.receptoraId }, { $inc: { revisionReproductiva: 1 } }, { session });
    if (await RegistroReproductivo.exists({ animal: e.receptoraId, estadoCiclo: 'Activo' }).session(session)) throw error('La receptora tiene otro ciclo activo.', 409);
    const r = new RegistroReproductivo({ animal: e.receptoraId, especie: 'Bovino', asignadoA: e.responsable, metodo: 'TRANSFERENCIA_EMBRIONES', diasGestacionReferencia: await obtenerDuracionGestacionBovina({ fincaId: obtenerFincaActual(), session }) });
    const s = await validarServicio({ metodo: 'TRANSFERENCIA_EMBRIONES', fechaServicio: d.fechaServicio, toroId: p.padreId, sementalExternoNombre: p.padreExternoNombre, diioSemental: p.diioPadre,
        embrion: { donanteId: p.donanteId, donanteExternaNombre: p.donanteExternaNombre, donanteRegistro: p.donanteRegistro, donanteRaza: p.donanteRaza, origenEmbrion: p.origenEmbrion, estadoEmbrion: e.estadoEmbrion, codigoEmbrion: e.codigo, grado: e.grado, estadio: e.estadio, costo: p.costoTotal / p.embriones.length, moneda: p.moneda }
    }, r, req.usuario.id, session);
    r.servicios.push(s); r.fechaPartoEstimada = require('../services/metodoReproductivo-service').sumarDias(d.fechaServicio, r.diasGestacionReferencia - 7);
    await r.save({ session }); await registrarEventosMetodo(r, req.usuario.id, session);
    e.estado = 'TRANSFERIDO'; e.registroReproductivoId = r._id;
    await Tarea.updateOne({ _id: e.tareaId }, { $set: { estado: 'Completada', fechaCompletada: new Date(d.fechaServicio) } }, { session });
    await p.save({ session }); return p;
  });
  if (!programa.$locals.repetida) {
      const e = programa.embriones.id(req.body.embrionId);
      const r = await RegistroReproductivo.findById(e.registroReproductivoId);
      const animal = await Animal.findById(r.animal);
      await require('../services/reproduccionBovina-service').sincronizarTareasBovinas({ registro: r, animal, usuarioId: req.usuario.id });
  }
  return programa;
});
