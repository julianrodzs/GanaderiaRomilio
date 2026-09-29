const Animal = require('../models/Animal');
const Finca = require('../models/Finca');
const { Membresia } = require('../models/Membresia');
const Organizacion = require('../models/Organizacion');
const UsoPlan = require('../models/UsoPlan');
const { obtenerOrganizacionActual } = require('../context/organizacion-context');
const { PLAN_MINIMO_POR_FEATURE, obtenerPlanConfig } = require('../config/planes');

const crearErrorPlan = (code, message, detalles = {}, status = 403) => {
    const error = new Error(message);
    error.name = 'PlanError';
    error.code = code;
    error.status = status;
    Object.assign(error, detalles);
    return error;
};

const resolverOrganizacionId = (organizacionId) => {
    const id = organizacionId || obtenerOrganizacionActual();
    if (!id) throw crearErrorPlan('PLAN_ORGANIZATION_REQUIRED', 'No se pudo determinar la organización de la cuenta.', {}, 400);
    return id.toString();
};

const periodoMensual = (fecha = new Date()) => {
    const fechaValida = new Date(fecha);
    return `${fechaValida.getUTCFullYear()}-${String(fechaValida.getUTCMonth() + 1).padStart(2, '0')}`;
};

const obtenerPlanActual = async (organizacionId) => {
    const id = resolverOrganizacionId(organizacionId);
    const organizacion = await Organizacion.findById(id).select('nombre slug estado plan').lean();
    if (!organizacion) throw crearErrorPlan('PLAN_ORGANIZATION_NOT_FOUND', 'Organización no encontrada.', {}, 404);

    const codigo = organizacion.plan?.codigo || 'ESENCIAL';
    const configuracion = obtenerPlanConfig(codigo);
    return {
        organizacion,
        codigo: configuracion.codigo,
        especiePlan: organizacion.plan?.especiePlan || null,
        estado: organizacion.plan?.estado || 'Activo',
        configuracion
    };
};

const obtenerConfiguracionPlan = async (organizacionId) => (await obtenerPlanActual(organizacionId)).configuracion;

const tieneFeature = async (feature, organizacionId) => {
    const actual = await obtenerPlanActual(organizacionId);
    return Boolean(actual.configuracion.funcionalidades?.[feature]);
};

const puedeUsarEspecie = async (especie, organizacionId) => {
    const actual = await obtenerPlanActual(organizacionId);
    if (!['Bovino', 'Porcino'].includes(especie)) {
        return { permitido: false, code: 'PLAN_INVALID_SPECIES', message: 'La especie indicada no es válida.', ...actual };
    }
    if (actual.configuracion.especies.modo === 'AMBAS') return { permitido: true, ...actual };
    if (!actual.especiePlan) {
        return {
            permitido: false,
            code: 'PLAN_SPECIES_SELECTION_REQUIRED',
            message: 'Selecciona la especie que administrarás con el plan Esencial.',
            ...actual
        };
    }
    if (actual.especiePlan !== especie) {
        return {
            permitido: false,
            code: 'PLAN_SPECIES_NOT_AVAILABLE',
            message: `Tu plan permite administrar únicamente ${actual.especiePlan === 'Bovino' ? 'bovinos' : 'porcinos'}.`,
            especiePermitida: actual.especiePlan,
            ...actual
        };
    }
    return { permitido: true, ...actual };
};

const contarAnimalesActivos = async () => {
    const grupos = await Animal.aggregate([
        { $match: { estado: 'Activo' } },
        {
            $group: {
                _id: { $ifNull: ['$especie', 'Bovino'] },
                cantidad: { $sum: 1 }
            }
        }
    ]).option({ omitirAislamientoFinca: true });
    const bovinos = grupos.find((item) => item._id === 'Bovino')?.cantidad || 0;
    const porcinos = grupos.find((item) => item._id === 'Porcino')?.cantidad || 0;
    return { bovinos, porcinos, total: bovinos + porcinos };
};

const obtenerLimiteAnimales = (actual) => {
    const { configuracion, especiePlan } = actual;
    if (configuracion.especies.modo === 'UNA_ESPECIE') {
        if (especiePlan === 'Bovino') return configuracion.limites.bovinosSiSeleccionados;
        if (especiePlan === 'Porcino') return configuracion.limites.porcinosSiSeleccionados;
        return null;
    }
    return configuracion.limites.animalesActivosTotal;
};

const puedeCrearAnimal = async ({ organizacionId, especie, cantidad = 1 } = {}) => {
    const especieDisponible = await puedeUsarEspecie(especie || 'Bovino', organizacionId);
    if (!especieDisponible.permitido) return especieDisponible;
    const actual = especieDisponible;
    const uso = await contarAnimalesActivos();
    const limite = obtenerLimiteAnimales(actual);
    const cantidadSolicitada = Math.max(Number(cantidad) || 1, 1);
    const usados = actual.configuracion.especies.modo === 'UNA_ESPECIE'
        ? (actual.especiePlan === 'Porcino' ? uso.porcinos : uso.bovinos)
        : uso.total;
    const sobreLimite = limite !== null && usados > limite;
    const permitido = limite === null || usados + cantidadSolicitada <= limite;

    return {
        ...actual,
        permitido,
        code: permitido ? null : 'PLAN_ANIMAL_LIMIT_REACHED',
        message: permitido ? null : 'Has alcanzado el límite de animales activos de tu plan.',
        actual: usados,
        limite,
        cantidadSolicitada,
        sobreLimite,
        uso
    };
};

const asegurarPuedeCrearAnimal = async (datos) => {
    const resultado = await puedeCrearAnimal(datos);
    if (!resultado.permitido) {
        throw crearErrorPlan(resultado.code, resultado.message, {
            recurso: 'animales',
            actual: resultado.actual,
            limite: resultado.limite,
            especiePermitida: resultado.especiePermitida
        });
    }
    return resultado;
};

const contarUsuariosActivos = (organizacionId) => Membresia.countDocuments({
    organizacionId: resolverOrganizacionId(organizacionId),
    estado: 'Activo'
});

const puedeUsarRol = async (rol, organizacionId) => {
    const actual = await obtenerPlanActual(organizacionId);
    const permitido = actual.configuracion.rolesPermitidos.includes(rol);
    return {
        permitido,
        code: permitido ? null : 'PLAN_ROLE_NOT_AVAILABLE',
        message: permitido ? null : `El rol ${rol} no está disponible en tu plan.`,
        rolesPermitidos: actual.configuracion.rolesPermitidos,
        ...actual
    };
};

const puedeCrearUsuario = async ({ organizacionId, rol = 'Encargado', estado = 'Activo' } = {}) => {
    const rolDisponible = await puedeUsarRol(rol, organizacionId);
    if (!rolDisponible.permitido) return rolDisponible;
    const actual = await contarUsuariosActivos(organizacionId);
    const limite = rolDisponible.configuracion.limites.usuarios;
    const consumeLimite = estado !== 'Inactivo';
    const permitido = !consumeLimite || actual + 1 <= limite;
    return {
        ...rolDisponible,
        permitido,
        code: permitido ? null : 'PLAN_USER_LIMIT_REACHED',
        message: permitido ? null : 'Has alcanzado el límite de usuarios activos de tu plan.',
        actual,
        limite,
        sobreLimite: actual > limite
    };
};

const asegurarPuedeCrearUsuario = async (datos) => {
    const resultado = await puedeCrearUsuario(datos);
    if (!resultado.permitido) {
        throw crearErrorPlan(resultado.code, resultado.message, {
            recurso: 'usuarios', actual: resultado.actual, limite: resultado.limite, rolesPermitidos: resultado.rolesPermitidos
        });
    }
    return resultado;
};

const contarFincasActivas = () => Finca.countDocuments({ estado: 'Activa' });

const puedeCrearFinca = async ({ organizacionId, estado = 'Activa' } = {}) => {
    const actualPlan = await obtenerPlanActual(organizacionId);
    const actual = await contarFincasActivas();
    const limite = actualPlan.configuracion.limites.fincas;
    const consumeLimite = estado !== 'Inactiva';
    const permitido = !consumeLimite || actual + 1 <= limite;
    return {
        permitido,
        code: permitido ? null : 'PLAN_FARM_LIMIT_REACHED',
        message: permitido ? null : 'Has alcanzado el límite de fincas activas de tu plan.',
        actual,
        limite,
        sobreLimite: actual > limite,
        ...actualPlan
    };
};

const asegurarPuedeCrearFinca = async (datos) => {
    const resultado = await puedeCrearFinca(datos);
    if (!resultado.permitido) {
        throw crearErrorPlan(resultado.code, resultado.message, {
            recurso: 'fincas', actual: resultado.actual, limite: resultado.limite
        });
    }
    return resultado;
};

const obtenerUsoMensual = async ({ organizacionId, periodo = periodoMensual() } = {}) => {
    resolverOrganizacionId(organizacionId);
    const uso = await UsoPlan.findOne({ periodo }).lean();
    return uso || {
        periodo,
        conteosDrone: 0,
        conteosDroneReservados: 0,
        referenciasConteoDrone: [],
        emailsOperativos: 0,
        otrosUsos: {}
    };
};

const obtenerLimiteDrone = (actual) => {
    if (actual.configuracion.codigo === 'ESENCIAL') {
        return actual.especiePlan === 'Bovino'
            ? actual.configuracion.limites.conteosDroneMensualesBovino
            : 0;
    }
    return actual.configuracion.limites.conteosDroneMensuales;
};

const puedeProcesarConteoDrone = async ({ organizacionId, periodo = periodoMensual() } = {}) => {
    const actualPlan = await obtenerPlanActual(organizacionId);
    if (actualPlan.configuracion.codigo === 'ESENCIAL' && !actualPlan.especiePlan) {
        return {
            permitido: false,
            code: 'PLAN_SPECIES_SELECTION_REQUIRED',
            message: 'Selecciona la especie del plan Esencial antes de utilizar el conteo con dron.',
            ...actualPlan
        };
    }
    if (actualPlan.configuracion.codigo === 'ESENCIAL' && actualPlan.especiePlan === 'Porcino') {
        return {
            permitido: false,
            code: 'PLAN_DRONE_NOT_AVAILABLE',
            message: 'El conteo con dron no aplica al plan Esencial configurado para porcinos.',
            ...actualPlan
        };
    }

    const uso = await obtenerUsoMensual({ organizacionId, periodo });
    const limite = obtenerLimiteDrone(actualPlan);
    const consumido = Number(uso.conteosDrone || 0);
    const reservado = Number(uso.conteosDroneReservados || 0);
    const permitido = limite === null || consumido + reservado < limite;
    return {
        permitido,
        code: permitido ? null : 'PLAN_DRONE_LIMIT_REACHED',
        message: permitido ? null : 'Has alcanzado el límite mensual de conteos con dron de tu plan.',
        periodo,
        actual: consumido,
        reservado,
        limite,
        modo: actualPlan.configuracion.limites.modoConteoDrone,
        sobreLimite: limite !== null && consumido > limite,
        ...actualPlan
    };
};

const asegurarPuedeProcesarConteoDrone = async (datos) => {
    const resultado = await puedeProcesarConteoDrone(datos);
    if (!resultado.permitido) {
        throw crearErrorPlan(resultado.code, resultado.message, {
            recurso: 'conteosDrone', actual: resultado.actual, limite: resultado.limite, periodo: resultado.periodo
        });
    }
    return resultado;
};

const obtenerOCrearUso = async (periodo) => UsoPlan.findOneAndUpdate(
    { periodo },
    { $setOnInsert: { periodo } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
);

const reservarUsoDrone = async ({ organizacionId, periodo = periodoMensual() } = {}) => {
    const permiso = await asegurarPuedeProcesarConteoDrone({ organizacionId, periodo });
    const uso = await obtenerOCrearUso(periodo);
    const filtro = { _id: uso._id };
    if (permiso.limite !== null) {
        filtro.$expr = {
            $lt: [
                { $add: ['$conteosDrone', '$conteosDroneReservados'] },
                permiso.limite
            ]
        };
    }
    const reservado = await UsoPlan.findOneAndUpdate(filtro, { $inc: { conteosDroneReservados: 1 } }, { new: true });
    if (!reservado) {
        throw crearErrorPlan('PLAN_DRONE_LIMIT_REACHED', 'Has alcanzado el límite mensual de conteos con dron de tu plan.', {
            recurso: 'conteosDrone', limite: permiso.limite, periodo
        });
    }
    return { permiso, uso: reservado };
};

const liberarReservaDrone = async ({ periodo = periodoMensual() } = {}) => UsoPlan.findOneAndUpdate(
    { periodo, conteosDroneReservados: { $gt: 0 } },
    { $inc: { conteosDroneReservados: -1 } },
    { new: true }
);

const incrementarUsoDrone = async ({ periodo = periodoMensual(), conteoId, liberarReserva = false } = {}) => {
    if (!conteoId) throw new Error('conteoId es requerido para registrar el uso del dron');
    const uso = await obtenerOCrearUso(periodo);
    const filtro = { _id: uso._id, referenciasConteoDrone: { $ne: conteoId } };
    const incremento = { conteosDrone: 1 };
    if (liberarReserva && uso.conteosDroneReservados > 0) incremento.conteosDroneReservados = -1;
    const actualizado = await UsoPlan.findOneAndUpdate(
        filtro,
        { $inc: incremento, $addToSet: { referenciasConteoDrone: conteoId } },
        { new: true }
    );
    if (actualizado) return actualizado;
    if (liberarReserva) await liberarReservaDrone({ periodo });
    return UsoPlan.findById(uso._id);
};

const incrementarEmailsOperativos = async ({ periodo = periodoMensual(), cantidad = 1 } = {}) => {
    if (cantidad <= 0) return obtenerUsoMensual({ periodo });
    return UsoPlan.findOneAndUpdate(
        { periodo },
        { $setOnInsert: { periodo }, $inc: { emailsOperativos: cantidad } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

const obtenerEstadoLimites = async (organizacionId) => {
    const actual = await obtenerPlanActual(organizacionId);
    const [animales, usuarios, fincas, uso] = await Promise.all([
        contarAnimalesActivos(),
        contarUsuariosActivos(organizacionId),
        contarFincasActivas(),
        obtenerUsoMensual({ organizacionId })
    ]);
    const limiteAnimales = obtenerLimiteAnimales(actual);
    const animalesConsumidos = actual.configuracion.especies.modo === 'UNA_ESPECIE'
        ? (actual.especiePlan === 'Porcino' ? animales.porcinos : animales.bovinos)
        : animales.total;
    const limiteDrone = obtenerLimiteDrone(actual);

    return {
        actual,
        limites: {
            animales: limiteAnimales,
            usuarios: actual.configuracion.limites.usuarios,
            fincas: actual.configuracion.limites.fincas,
            conteosDrone: limiteDrone,
            modoConteoDrone: actual.configuracion.limites.modoConteoDrone
        },
        uso: {
            animalesActuales: animalesConsumidos,
            animalesPorEspecie: animales,
            usuariosActuales: usuarios,
            fincasActuales: fincas,
            conteosDroneMes: Number(uso.conteosDrone || 0),
            emailsOperativosMes: Number(uso.emailsOperativos || 0),
            periodo: uso.periodo
        },
        sobreLimite: {
            animales: limiteAnimales !== null && animalesConsumidos > limiteAnimales,
            usuarios: usuarios > actual.configuracion.limites.usuarios,
            fincas: fincas > actual.configuracion.limites.fincas,
            conteosDrone: limiteDrone !== null && Number(uso.conteosDrone || 0) > limiteDrone
        }
    };
};

const cambiarEspeciePlanEsencial = async ({ organizacionId, especie }) => {
    const id = resolverOrganizacionId(organizacionId);
    const actual = await obtenerPlanActual(id);
    if (actual.codigo !== 'ESENCIAL') {
        throw crearErrorPlan('PLAN_SPECIES_SELECTION_NOT_REQUIRED', 'Tu plan permite utilizar ambas especies.', {}, 400);
    }
    if (!['Bovino', 'Porcino'].includes(especie)) {
        throw crearErrorPlan('PLAN_INVALID_SPECIES', 'Selecciona Bovino o Porcino.', {}, 400);
    }
    const conteos = await contarAnimalesActivos();
    const especieOpuesta = especie === 'Bovino' ? 'porcinos' : 'bovinos';
    if (conteos[especieOpuesta] > 0) {
        throw crearErrorPlan(
            'PLAN_SPECIES_CHANGE_CONFLICT',
            'No puedes cambiar la especie mientras existan animales activos de la otra especie.',
            { animalesEnConflicto: conteos[especieOpuesta] }
        );
    }
    await Organizacion.findByIdAndUpdate(id, {
        $set: { 'plan.especiePlan': especie, 'plan.fechaAsignacion': new Date() }
    });
    return obtenerPlanActual(id);
};

const obtenerMensajeFeature = (feature) => {
    const codigo = PLAN_MINIMO_POR_FEATURE[feature];
    const plan = codigo ? obtenerPlanConfig(codigo) : null;
    return plan ? `Esta función está disponible a partir del plan ${plan.nombre}.` : 'Esta función no está disponible en tu plan.';
};

module.exports = {
    asegurarPuedeCrearAnimal,
    asegurarPuedeCrearFinca,
    asegurarPuedeCrearUsuario,
    asegurarPuedeProcesarConteoDrone,
    cambiarEspeciePlanEsencial,
    contarAnimalesActivos,
    contarFincasActivas,
    contarUsuariosActivos,
    crearErrorPlan,
    incrementarEmailsOperativos,
    incrementarUsoDrone,
    liberarReservaDrone,
    obtenerConfiguracionPlan,
    obtenerEstadoLimites,
    obtenerMensajeFeature,
    obtenerPlanActual,
    obtenerUsoMensual,
    puedeCrearAnimal,
    puedeCrearFinca,
    puedeCrearUsuario,
    puedeProcesarConteoDrone,
    puedeUsarEspecie,
    puedeUsarRol,
    periodoMensual,
    reservarUsoDrone,
    tieneFeature
};
