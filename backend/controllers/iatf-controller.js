const {
    cambiarEstadoCampana,
    consolidarMetricas,
    crearCampana,
    crearPlantilla,
    ejecutarPaso,
    guardarInsumo,
    listarCampanas,
    listarInsumos,
    listarProtocolos,
    obtenerCampana,
    obtenerActividadPorTarea,
    registrarDiagnosticos,
    registrarIATF,
    reprogramarDependientes,
    resincronizar,
    retirarParticipante,
    versionarPlantilla
} = require('../services/iatf-service');

const responderError = (res, error) => res.status(error.status || 400).json({
    mensaje: error.message,
    error: error.message,
    code: error.code
});

const iatfCtrl = {
    getProtocolos: async (req, res) => {
        try { res.json(await listarProtocolos(req.query.incluirInactivos === 'true')); } catch (error) { responderError(res, error); }
    },
    getProtocolo: async (req, res) => {
        try {
            const protocolos = await listarProtocolos(true);
            const protocolo = protocolos.find((item) => String(item._id) === req.params.id);
            if (!protocolo) return res.status(404).json({ mensaje: 'Protocolo no encontrado.' });
            return res.json(protocolo);
        } catch (error) { return responderError(res, error); }
    },
    postProtocolo: async (req, res) => {
        try { res.status(201).json(await crearPlantilla({ datos: req.body, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    putProtocolo: async (req, res) => {
        try { res.json(await versionarPlantilla({ plantillaId: req.params.id, datos: req.body, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    getCampanas: async (req, res) => {
        try { res.json(await listarCampanas(req.query)); } catch (error) { responderError(res, error); }
    },
    getCampana: async (req, res) => {
        try { res.json(await obtenerCampana(req.params.id)); } catch (error) { responderError(res, error); }
    },
    getActividadTarea: async (req, res) => {
        try { res.json(await obtenerActividadPorTarea({ tareaId: req.params.tareaId, usuarioId: req.usuario.id, rolUsuario: req.usuario.rol })); } catch (error) { responderError(res, error); }
    },
    postCampana: async (req, res) => {
        try { res.status(201).json(await crearCampana({ datos: req.body, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    postEjecutarPaso: async (req, res) => {
        try { res.json(await ejecutarPaso({ campanaId: req.params.id, pasoId: req.params.pasoId, datos: req.body, usuarioId: req.usuario.id, rolUsuario: req.usuario.rol })); } catch (error) { responderError(res, error); }
    },
    postReprogramar: async (req, res) => {
        try { res.json(await reprogramarDependientes({ campanaId: req.params.id, pasoId: req.params.pasoId, recalcular: req.body.recalcular === true, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    postInseminaciones: async (req, res) => {
        try { res.json(await registrarIATF({ campanaId: req.params.id, datos: req.body, usuarioId: req.usuario.id, rolUsuario: req.usuario.rol })); } catch (error) { responderError(res, error); }
    },
    postDiagnosticos: async (req, res) => {
        try { res.json(await registrarDiagnosticos({ campanaId: req.params.id, datos: req.body, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    getMetricas: async (req, res) => {
        try { const campana = await obtenerCampana(req.params.id); res.json(campana.metricas); } catch (error) { responderError(res, error); }
    },
    postFinalizar: async (req, res) => {
        try { res.json(await cambiarEstadoCampana({ campanaId: req.params.id, estado: 'FINALIZADA', motivo: req.body.motivo, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    postCancelar: async (req, res) => {
        try { res.json(await cambiarEstadoCampana({ campanaId: req.params.id, estado: 'CANCELADA', motivo: req.body.motivo, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    postRetirarParticipante: async (req, res) => {
        try { res.json(await retirarParticipante({ campanaId: req.params.id, participanteId: req.params.participanteId, motivo: req.body.motivo, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    postResincronizar: async (req, res) => {
        try { res.status(201).json(await resincronizar({ campanaId: req.params.id, datos: req.body, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    getInsumos: async (req, res) => {
        try { res.json(await listarInsumos(req.query.incluirInactivos === 'true')); } catch (error) { responderError(res, error); }
    },
    postInsumo: async (req, res) => {
        try { res.status(201).json(await guardarInsumo({ datos: req.body, usuarioId: req.usuario.id })); } catch (error) { responderError(res, error); }
    },
    putInsumo: async (req, res) => {
        try {
            const insumo = await guardarInsumo({ id: req.params.id, datos: req.body, usuarioId: req.usuario.id });
            if (!insumo) return res.status(404).json({ mensaje: 'Insumo no encontrado.' });
            return res.json(insumo);
        } catch (error) { return responderError(res, error); }
    },
    getConsolidado: async (req, res) => {
        try {
            const fincas = req.usuario.accesoTodasFincas ? [] : (req.usuario.fincas || []);
            res.json(await consolidarMetricas({ fincasAutorizadas: fincas }));
        } catch (error) { responderError(res, error); }
    }
};

module.exports = iatfCtrl;
