const precioConfigurable = (variable, valorInicial) => {
    const valor = Number(process.env[variable]);
    return Number.isFinite(valor) && valor >= 0 ? valor : valorInicial;
};

const FEATURES = Object.freeze({
    CENTRO_ALERTAS: 'centroAlertas',
    EMAILS_OPERATIVOS: 'emailsOperativos',
    REPORTES_BASICOS: 'reportesBasicos',
    ANALITICA_PRODUCTIVA: 'analiticaProductiva',
    ANALITICA_ECONOMICA: 'analiticaEconomica',
    CONFIGURACION_EMAIL_AVANZADA: 'configuracionEmailAvanzada',
    AMBOS_TIPOS_ANIMALES: 'ambosTiposAnimales',
    REPORTES_MULTI_FINCA: 'reportesMultiFinca',
    AUDITORIA_AVANZADA: 'auditoriaAvanzada'
});

const rolesBasicos = ['Administrador', 'Encargado', 'Trabajador'];
const todosLosRoles = ['Administrador', 'Encargado', 'Trabajador', 'Veterinario', 'Contador', 'Consulta'];

const planesConfig = Object.freeze({
    ESENCIAL: {
        codigo: 'ESENCIAL',
        nombre: 'Esencial',
        precioMensualUSD: precioConfigurable('PLAN_PRECIO_ESENCIAL_USD', 6),
        limites: {
            fincas: 1,
            usuarios: 3,
            bovinosSiSeleccionados: 210,
            porcinosSiSeleccionados: 500,
            animalesActivosTotal: null,
            conteosDroneMensualesBovino: 15,
            conteosDroneMensuales: null,
            modoConteoDrone: 'LIMITADO_POR_ESPECIE'
        },
        especies: { modo: 'UNA_ESPECIE' },
        rolesPermitidos: rolesBasicos,
        funcionalidades: {
            centroAlertas: true,
            emailsOperativos: false,
            reportesBasicos: true,
            analiticaProductiva: false,
            analiticaEconomica: false,
            ambosTiposAnimales: false,
            configuracionEmailAvanzada: false,
            reportesMultiFinca: false,
            auditoriaAvanzada: false
        }
    },
    GESTION: {
        codigo: 'GESTION',
        nombre: 'Gestión',
        precioMensualUSD: precioConfigurable('PLAN_PRECIO_GESTION_USD', 12),
        limites: {
            fincas: 2,
            usuarios: 8,
            animalesActivosTotal: 2000,
            conteosDroneMensuales: 60,
            modoConteoDrone: 'LIMITADO'
        },
        especies: { modo: 'AMBAS' },
        rolesPermitidos: rolesBasicos,
        funcionalidades: {
            centroAlertas: true,
            emailsOperativos: false,
            reportesBasicos: true,
            analiticaProductiva: true,
            analiticaEconomica: false,
            ambosTiposAnimales: true,
            configuracionEmailAvanzada: false,
            reportesMultiFinca: false,
            auditoriaAvanzada: false
        }
    },
    PRO: {
        codigo: 'PRO',
        nombre: 'Pro',
        precioMensualUSD: precioConfigurable('PLAN_PRECIO_PRO_USD', 20),
        limites: {
            fincas: 5,
            usuarios: 20,
            animalesActivosTotal: 5000,
            conteosDroneMensuales: 150,
            modoConteoDrone: 'LIMITADO'
        },
        especies: { modo: 'AMBAS' },
        rolesPermitidos: todosLosRoles,
        funcionalidades: {
            centroAlertas: true,
            emailsOperativos: true,
            reportesBasicos: true,
            analiticaProductiva: true,
            analiticaEconomica: true,
            ambosTiposAnimales: true,
            configuracionEmailAvanzada: false,
            reportesMultiFinca: false,
            auditoriaAvanzada: true
        }
    },
    PREMIUM: {
        codigo: 'PREMIUM',
        nombre: 'Premium',
        precioMensualUSD: precioConfigurable('PLAN_PRECIO_PREMIUM_USD', 35),
        limites: {
            fincas: 10,
            usuarios: 50,
            animalesActivosTotal: 10000,
            conteosDroneMensuales: null,
            modoConteoDrone: 'USO_INTENSIVO'
        },
        especies: { modo: 'AMBAS' },
        rolesPermitidos: todosLosRoles,
        funcionalidades: {
            centroAlertas: true,
            emailsOperativos: true,
            reportesBasicos: true,
            analiticaProductiva: true,
            analiticaEconomica: true,
            ambosTiposAnimales: true,
            configuracionEmailAvanzada: true,
            reportesMultiFinca: true,
            auditoriaAvanzada: true
        },
        caracteristicasComerciales: {
            soportePrioritario: true
        }
    }
});

const PLAN_MINIMO_POR_FEATURE = Object.freeze({
    analiticaProductiva: 'GESTION',
    analiticaEconomica: 'PRO',
    emailsOperativos: 'PRO',
    configuracionEmailAvanzada: 'PREMIUM',
    reportesMultiFinca: 'PREMIUM',
    auditoriaAvanzada: 'PRO'
});

const obtenerPlanConfig = (codigo = 'ESENCIAL') => planesConfig[codigo] || planesConfig.ESENCIAL;

module.exports = {
    FEATURES,
    PLAN_MINIMO_POR_FEATURE,
    planesConfig,
    obtenerPlanConfig
};
