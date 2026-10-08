const {
    obtenerAparienciaActual,
    obtenerConfiguracionApariencia,
    restaurarImagen,
    reutilizarDashboardEnPotreros,
    subirImagenFinca,
    subirLogoOrganizacion
} = require('../services/apariencia-service');

const responderError = (res, error) => res.status(error.status || 500).json({
    mensaje: error.message || 'No se pudo actualizar la apariencia.',
    code: error.code
});

const aparienciaCtrl = {};

aparienciaCtrl.getActual = async (req, res) => {
    try {
        res.json(await obtenerAparienciaActual({ organizacionId: req.organizacionId, fincaId: req.fincaId }));
    } catch (error) { responderError(res, error); }
};

aparienciaCtrl.getConfiguracion = async (req, res) => {
    try {
        res.json(await obtenerConfiguracionApariencia({ organizacionId: req.organizacionId }));
    } catch (error) { responderError(res, error); }
};

aparienciaCtrl.postLogo = async (req, res) => {
    try {
        res.status(201).json(await subirLogoOrganizacion({
            archivo: req.file,
            organizacionId: req.organizacionId,
            usuarioId: req.usuario.id
        }));
    } catch (error) { responderError(res, error); }
};

aparienciaCtrl.postImagenFinca = async (req, res) => {
    try {
        res.status(201).json(await subirImagenFinca({
            tipo: req.params.tipo,
            archivo: req.file,
            fincaId: req.params.fincaId,
            organizacionId: req.organizacionId,
            usuarioId: req.usuario.id
        }));
    } catch (error) { responderError(res, error); }
};

aparienciaCtrl.patchReutilizarDashboard = async (req, res) => {
    try {
        res.json(await reutilizarDashboardEnPotreros({
            fincaId: req.params.fincaId,
            organizacionId: req.organizacionId
        }));
    } catch (error) { responderError(res, error); }
};

aparienciaCtrl.deleteImagen = async (req, res) => {
    try {
        res.json(await restaurarImagen({
            alcance: req.params.alcance,
            tipo: req.params.tipo,
            fincaId: req.query.fincaId,
            organizacionId: req.organizacionId
        }));
    } catch (error) { responderError(res, error); }
};

module.exports = aparienciaCtrl;
