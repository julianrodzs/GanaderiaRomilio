const {
    cambiarEspeciePlanEsencial,
    obtenerEstadoLimites
} = require('../services/plan-service');
const { respuestaErrorPlan } = require('../middleware/plan');

const planCtrl = {};

const presentarPlan = (estado) => ({
    plan: {
        codigo: estado.actual.codigo,
        nombre: estado.actual.configuracion.nombre,
        precioMensualUSD: estado.actual.configuracion.precioMensualUSD,
        estado: estado.actual.estado,
        especiePlan: estado.actual.especiePlan,
        modoEspecies: estado.actual.configuracion.especies.modo
    },
    limites: estado.limites,
    uso: estado.uso,
    sobreLimite: estado.sobreLimite,
    funcionalidades: estado.actual.configuracion.funcionalidades,
    rolesPermitidos: estado.actual.configuracion.rolesPermitidos,
    caracteristicasComerciales: estado.actual.configuracion.caracteristicasComerciales || {}
});

planCtrl.getPlanActual = async (req, res) => {
    try {
        res.json(presentarPlan(await obtenerEstadoLimites(req.organizacionId)));
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(500).json({ mensaje: 'Error al obtener la información del plan', error: error.message });
    }
};

planCtrl.seleccionarEspeciePlan = async (req, res) => {
    try {
        await cambiarEspeciePlanEsencial({
            organizacionId: req.organizacionId,
            especie: req.body.especiePlan
        });
        res.json(presentarPlan(await obtenerEstadoLimites(req.organizacionId)));
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        res.status(400).json({ mensaje: 'No se pudo actualizar la especie del plan', error: error.message });
    }
};

module.exports = planCtrl;
