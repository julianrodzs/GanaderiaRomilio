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
        vigente: estado.actual.vigente,
        especiePlan: estado.actual.especiePlan,
        modoEspecies: estado.actual.configuracion.especies.modo,
        proveedorPago: estado.actual.organizacion?.plan?.proveedorPago || null,
        fechaRenovacion: estado.actual.organizacion?.plan?.fechaRenovacion || null,
        fechaExpiracion: estado.actual.organizacion?.plan?.fechaExpiracion || null
    },
    limites: estado.limites,
    uso: estado.uso,
    sobreLimite: estado.sobreLimite,
    funcionalidades: Object.fromEntries(Object.keys(estado.actual.configuracion.funcionalidades)
        .map((feature) => [feature, estado.actual.vigente && estado.actual.configuracion.funcionalidades[feature]])),
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
