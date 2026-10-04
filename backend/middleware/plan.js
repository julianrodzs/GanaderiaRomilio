const { PLAN_MINIMO_POR_FEATURE, obtenerPlanConfig } = require('../config/planes');
const { asegurarPlanVigente, obtenerPlanActual } = require('../services/plan-service');

const respuestaErrorPlan = (error, res, mensajeAlterno = 'La operación no está disponible para tu plan.') => {
    if (error?.name !== 'PlanError' && !String(error?.code || '').startsWith('PLAN_')) return false;
    return res.status(error.status || 403).json({
        code: error.code || 'PLAN_OPERATION_NOT_AVAILABLE',
        feature: error.feature,
        recurso: error.recurso,
        actual: error.actual,
        limite: error.limite,
        periodo: error.periodo,
        especiePermitida: error.especiePermitida,
        rolesPermitidos: error.rolesPermitidos,
        message: error.message || mensajeAlterno,
        mensaje: error.message || mensajeAlterno
    });
};

const resolverAccesoFeature = (actual, feature) => {
    asegurarPlanVigente(actual);
    if (actual.configuracion.funcionalidades?.[feature]) {
        return { permitido: true, status: 200 };
    }
    const codigoMinimo = PLAN_MINIMO_POR_FEATURE[feature];
    const planMinimo = codigoMinimo ? obtenerPlanConfig(codigoMinimo) : null;
    return {
        permitido: false,
        status: 403,
        respuesta: {
            code: 'PLAN_FEATURE_NOT_AVAILABLE',
            feature,
            planActual: actual.codigo,
            planMinimo: codigoMinimo || null,
            message: planMinimo
                ? `Este reporte está disponible a partir del plan ${planMinimo.nombre}.`
                : 'Esta función no está disponible en tu plan.',
            mensaje: planMinimo
                ? `Este reporte está disponible a partir del plan ${planMinimo.nombre}.`
                : 'Esta función no está disponible en tu plan.'
        }
    };
};

const requireFeature = (feature, dependencias = {}) => async (req, res, next) => {
    try {
        const obtenerPlan = dependencias.obtenerPlanActual || obtenerPlanActual;
        const actual = await obtenerPlan(req.organizacionId);
        const acceso = resolverAccesoFeature(actual, feature);
        if (acceso.permitido) {
            req.planActual = actual;
            return next();
        }
        return res.status(acceso.status).json(acceso.respuesta);
    } catch (error) {
        if (respuestaErrorPlan(error, res)) return;
        return res.status(500).json({ mensaje: 'No se pudo validar el plan', error: error.message });
    }
};

module.exports = {
    requireFeature,
    resolverAccesoFeature,
    respuestaErrorPlan
};
