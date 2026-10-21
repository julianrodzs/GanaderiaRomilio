const Alimento = require('../models/Alimento');
const Racion = require('../models/Racion');
const AsignacionRacionLote = require('../models/AsignacionRacionLote');
const SuministroAlimentacion = require('../models/SuministroAlimentacion');
const CorteForraje = require('../models/CorteForraje');
const { inicializarCatalogo, crearAlimento, actualizarAlimento, crearRacion, actualizarRacion, asignarRacionLote, obtenerRacionActual, crearSuministro, actualizarSuministro } = require('../services/alimentacion-service');
const { normalizarPropositoLote } = require('../config/lotes');
const {
    sanitizarAlimento, sanitizarAsignacion, sanitizarRacion, sanitizarSuministro
} = require('../services/alimentacion-integridad-service');
const { fechaCivilEnZonaAUTC, limitesDiaEnZona } = require('../services/fechaZonaHoraria-service');

const responder = (res, error) => res.status(error.status || 400).json({ mensaje: error.message, codigo: error.codigo });
const listarAlimentos = async (req, res) => { try { await inicializarCatalogo(); const f = {}; if (req.query.activo !== undefined) f.activo = req.query.activo === 'true'; if (req.query.tipo) f.tipo = req.query.tipo; res.json(await Alimento.find(f).populate('catalogoPasto').sort({ activo: -1, nombre: 1 })); } catch (e) { responder(res, e); } };
const crearAlimentoCtrl = async (req, res) => { try { res.status(201).json(await crearAlimento(sanitizarAlimento(req.body), req.usuario?.id)); } catch (e) { responder(res, e); } };
const actualizarAlimentoCtrl = async (req, res) => { try { res.json(await actualizarAlimento(req.params.id, sanitizarAlimento(req.body))); } catch (e) { responder(res, e); } };
const listarRaciones = async (req, res) => { try { const f = {}; ['especie', 'etapa'].forEach((c) => { if (req.query[c]) f[c] = req.query[c]; }); if (req.query.proposito) f.proposito = normalizarPropositoLote(req.query.proposito) || req.query.proposito; if (req.query.activo !== undefined) f.activo = req.query.activo === 'true'; const rs = await Racion.find(f).populate('planAlimentacion', 'nombre etapa').populate('detalles.alimento', 'nombre tipo presentaciones').sort({ activo: -1, nombre: 1 }).lean(); res.json(await Promise.all(rs.map(async (r) => ({ ...r, lotesActivos: await AsignacionRacionLote.countDocuments({ racion: r._id, activo: true }) })))); } catch (e) { responder(res, e); } };
const obtenerRacion = async (req, res) => { try { const r = await Racion.findById(req.params.id).populate('planAlimentacion').populate('detalles.alimento'); if (!r) return res.status(404).json({ mensaje: 'Ración no encontrada.' }); res.json(r); } catch (e) { responder(res, e); } };
const crearRacionCtrl = async (req, res) => { try { res.status(201).json(await crearRacion(sanitizarRacion(req.body), req.usuario?.id)); } catch (e) { responder(res, e); } };
const actualizarRacionCtrl = async (req, res) => { try { res.json(await actualizarRacion(req.params.id, sanitizarRacion(req.body))); } catch (e) { responder(res, e); } };
const asignarRacion = async (req, res) => { try { res.status(201).json(await asignarRacionLote(req.params.id, sanitizarAsignacion(req.body), req.usuario?.id)); } catch (e) { responder(res, e); } };
const racionActual = async (req, res) => { try { res.json(await obtenerRacionActual(req.params.id)); } catch (e) { responder(res, e); } };
const historialRaciones = async (req, res) => { try { res.json(await AsignacionRacionLote.find({ lote: req.params.id }).populate('racion', 'nombre especie proposito etapa activo').populate('asignadoPor', 'nombre apellido').sort({ fechaInicio: -1 })); } catch (e) { responder(res, e); } };
const partesFecha = (texto) => { const [year, month, day] = String(texto).split('-').map(Number); return { year, month, day }; };
const listarSuministros = async (req, res) => { try { const f = {}; const zona = req.organizacion?.zonaHoraria || 'America/Costa_Rica'; if (req.query.lote) f.lote = req.query.lote; if (req.query.registradoPor) f.registradoPor = req.query.registradoPor; if (req.query.fechaInicio || req.query.fechaFin) { f.fechaHora = {}; if (req.query.fechaInicio) f.fechaHora.$gte = fechaCivilEnZonaAUTC(partesFecha(req.query.fechaInicio), zona); if (req.query.fechaFin) { const fecha = new Date(`${req.query.fechaFin}T12:00:00Z`); f.fechaHora.$lt = limitesDiaEnZona(fecha, zona).finExclusivo; } } res.json(await SuministroAlimentacion.find(f).populate('lote', 'codigo nombre especie').populate('responsable registradoPor actualizadoPor', 'nombre apellido').sort({ fechaHora: -1 }).limit(500)); } catch (e) { responder(res, e); } };
const obtenerSuministro = async (req, res) => { try { const s = await SuministroAlimentacion.findById(req.params.id).populate('lote').populate('detalles.alimento').populate('responsable registradoPor actualizadoPor', 'nombre apellido'); if (!s) return res.status(404).json({ mensaje: 'Suministro no encontrado.' }); res.json(s); } catch (e) { responder(res, e); } };
const crearSuministroCtrl = async (req, res) => { try { const datos = sanitizarSuministro({ ...req.body, claveIdempotencia: req.get('Idempotency-Key') || req.body.claveIdempotencia }); res.status(201).json(await crearSuministro(datos, req.usuario?.id, { zonaHoraria: req.organizacion?.zonaHoraria || 'America/Costa_Rica' })); } catch (e) { responder(res, e); } };
const actualizarSuministroCtrl = async (req, res) => { try { res.json(await actualizarSuministro(req.params.id, sanitizarSuministro(req.body, { actualizacion: true }), req.usuario?.id, { zonaHoraria: req.organizacion?.zonaHoraria || 'America/Costa_Rica' })); } catch (e) { responder(res, e); } };
const suministrosLote = async (req, res) => { try { res.json(await SuministroAlimentacion.find({ lote: req.params.id }).populate('registradoPor', 'nombre apellido').sort({ fechaHora: -1 }).limit(200)); } catch (e) { responder(res, e); } };
const cortesDisponibles = async (_req, res) => { try { res.json(await CorteForraje.find().populate('potrero', 'codigo nombre').sort({ fechaCorte: -1 }).limit(100)); } catch (e) { responder(res, e); } };
const resumenHoy = async (req, res) => { try {
    const { inicio, finExclusivo } = limitesDiaEnZona(new Date(), req.organizacion?.zonaHoraria || 'America/Costa_Rica');
    const registros = await SuministroAlimentacion.find({ fechaHora: { $gte: inicio, $lt: finExclusivo } }).populate('lote', 'codigo nombre').sort({ fechaHora: -1 }).lean();
    res.json({ suministros: registros.length, lotes: new Set(registros.map((item) => String(item.lote?._id || item.lote))).size, ultimo: registros[0] || null });
} catch (e) { responder(res, e); } };

module.exports = { listarAlimentos, crearAlimentoCtrl, actualizarAlimentoCtrl, listarRaciones, obtenerRacion, crearRacionCtrl, actualizarRacionCtrl, asignarRacion, racionActual, historialRaciones, listarSuministros, obtenerSuministro, crearSuministroCtrl, actualizarSuministroCtrl, suministrosLote, cortesDisponibles, resumenHoy };
