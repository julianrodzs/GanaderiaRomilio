const service = require('../services/protocoloPorcino-service');
const responder = (res, error) => res.status(error.status || 400).json({ mensaje: error.message, code: error.code });

module.exports = {
    getPlantillas: async (req, res) => { try { res.json(await service.listarPlantillas(req.query.incluirInactivas === 'true')); } catch (error) { responder(res, error); } },
    postPlantilla: async (req, res) => { try { res.status(201).json(await service.crearPlantilla({ datos: req.body, usuarioId: req.usuario.id, organizacionId: req.organizacionId })); } catch (error) { responder(res, error); } },
    putPlantilla: async (req, res) => { try { res.json(await service.versionarPlantilla({ id: req.params.id, datos: req.body, usuarioId: req.usuario.id, organizacionId: req.organizacionId })); } catch (error) { responder(res, error); } },
    getBandas: async (req, res) => { try { res.json(await service.listarBandas(req.query)); } catch (error) { responder(res, error); } },
    postBanda: async (req, res) => { try { res.status(201).json(await service.crearBanda({ datos: req.body, usuarioId: req.usuario.id })); } catch (error) { responder(res, error); } },
    getBanda: async (req, res) => { try { res.json(await service.obtenerBanda(req.params.id)); } catch (error) { responder(res, error); } },
    getActividadTarea: async (req, res) => { try { res.json(await service.obtenerActividadPorTarea({ tareaId: req.params.tareaId, usuarioId: req.usuario.id, rolUsuario: req.usuario.rol })); } catch (error) { responder(res, error); } },
    postPaso: async (req, res) => { try { res.json(await service.ejecutarPaso({ bandaId: req.params.id, pasoId: req.params.pasoId, datos: req.body, usuarioId: req.usuario.id, rolUsuario: req.usuario.rol })); } catch (error) { responder(res, error); } },
    postReprogramar: async (req, res) => { try { res.json(await service.reprogramar({ bandaId: req.params.id, eventos: req.body.eventos || {}, usuarioId: req.usuario.id })); } catch (error) { responder(res, error); } },
    postRetirar: async (req, res) => { try { res.json(await service.retirarParticipante({ bandaId: req.params.id, participanteId: req.params.participanteId, motivo: req.body.motivo, usuarioId: req.usuario.id })); } catch (error) { responder(res, error); } },
    postFinalizar: async (req, res) => { try { res.json(await service.cerrarBanda({ bandaId: req.params.id, estado: 'FINALIZADA', motivo: req.body.motivo, usuarioId: req.usuario.id })); } catch (error) { responder(res, error); } },
    postCancelar: async (req, res) => { try { res.json(await service.cerrarBanda({ bandaId: req.params.id, estado: 'CANCELADA', motivo: req.body.motivo, usuarioId: req.usuario.id })); } catch (error) { responder(res, error); } },
    getConsolidado: async (req, res) => { try { res.json(await service.consolidar({ fincasAutorizadas: req.usuario.accesoTodasFincas ? [] : req.usuario.fincas })); } catch (error) { responder(res, error); } }
};
