const service = require('../services/protocoloEngorde-service');
const responder = (res, error) => res.status(error.status || 400).json({ mensaje: error.message, code: error.code });

module.exports = {
    getPlantillas: async (req, res) => { try { res.json(await service.listarPlantillas(req.query.incluirInactivas === 'true')); } catch (error) { responder(res, error); } },
    postPlantilla: async (req, res) => { try { res.status(201).json(await service.crearPlantilla({ datos: req.body, usuarioId: req.usuario.id, organizacionId: req.organizacionId })); } catch (error) { responder(res, error); } },
    putPlantilla: async (req, res) => { try { res.json(await service.versionarPlantilla({ id: req.params.id, datos: req.body, usuarioId: req.usuario.id, organizacionId: req.organizacionId })); } catch (error) { responder(res, error); } },
    getCiclos: async (req, res) => { try { res.json(await service.listarCiclos(req.query)); } catch (error) { responder(res, error); } },
    getCiclo: async (req, res) => { try { res.json(await service.obtenerCiclo(req.params.id)); } catch (error) { responder(res, error); } },
    getActividadTarea: async (req, res) => { try { res.json(await service.obtenerActividadPorTarea({ tareaId: req.params.tareaId, usuarioId: req.usuario.id, rolUsuario: req.usuario.rol })); } catch (error) { responder(res, error); } },
    postCiclo: async (req, res) => { try { res.status(201).json(await service.crearCiclo({ datos: req.body, usuarioId: req.usuario.id })); } catch (error) { responder(res, error); } },
    postPaso: async (req, res) => { try { res.json(await service.ejecutarPaso({ cicloId: req.params.id, pasoId: req.params.pasoId, datos: req.body, usuarioId: req.usuario.id, rolUsuario: req.usuario.rol })); } catch (error) { responder(res, error); } },
    postAvanzar: async (req, res) => { try { res.json(await service.avanzarEtapa({ cicloId: req.params.id, datos: req.body, usuarioId: req.usuario.id })); } catch (error) { responder(res, error); } },
    postFinalizar: async (req, res) => { try { res.json(await service.cerrarCiclo({ cicloId: req.params.id, estado: 'FINALIZADO', motivo: req.body.motivo, usuarioId: req.usuario.id })); } catch (error) { responder(res, error); } },
    postCancelar: async (req, res) => { try { res.json(await service.cerrarCiclo({ cicloId: req.params.id, estado: 'CANCELADO', motivo: req.body.motivo, usuarioId: req.usuario.id })); } catch (error) { responder(res, error); } },
    getCandidatosVenta: async (req, res) => { try { res.json(await service.obtenerCandidatosVenta(req.params.id)); } catch (error) { responder(res, error); } },
    getConsolidado: async (req, res) => { try { res.json(await service.consolidar({ fincasAutorizadas: req.usuario.accesoTodasFincas ? [] : req.usuario.fincas })); } catch (error) { responder(res, error); } }
};
