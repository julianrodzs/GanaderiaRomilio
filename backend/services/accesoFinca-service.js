const { Types } = require('mongoose');
const Finca = require('../models/Finca');

const crearErrorFinca = (mensaje, status = 403, code = 'FINCA_ACCESS_DENIED') => {
    const error = new Error(mensaje);
    error.status = status;
    error.code = code;
    return error;
};

const idsPermitidosMembresia = (membresia) => (
    (membresia?.fincas || []).map((finca) => String(finca?._id || finca))
);

const membresiaPuedeAccederFinca = (membresia, fincaId) => (
    Boolean(membresia?.accesoTodasFincas)
    || idsPermitidosMembresia(membresia).includes(String(fincaId || ''))
);

const consultaFincasSinContexto = (filtro) => Finca.find(filtro)
    .setOptions({ omitirAislamientoOrganizacion: true });

const listarFincasAccesibles = async (membresia, opciones = {}) => {
    const organizacionId = String(membresia?.organizacionId?._id || membresia?.organizacionId || '');
    if (!organizacionId) return [];

    const filtro = {
        organizacionId,
        ...(opciones.incluirInactivas ? {} : { estado: 'Activa' })
    };
    if (!membresia.accesoTodasFincas) {
        filtro._id = { $in: idsPermitidosMembresia(membresia) };
    }

    return consultaFincasSinContexto(filtro).sort({ estado: 1, nombre: 1 }).lean();
};

const resolverFincaActiva = async ({ membresia, organizacion, fincaSolicitada }) => {
    const fincaId = String(fincaSolicitada || organizacion?.fincaPrincipal || '');
    if (!fincaId || !Types.ObjectId.isValid(fincaId)) {
        throw crearErrorFinca('No se pudo determinar una finca activa válida.', 400, 'FINCA_REQUIRED');
    }
    if (!membresiaPuedeAccederFinca(membresia, fincaId)) {
        throw crearErrorFinca('No tienes acceso a la finca seleccionada.');
    }

    const finca = await Finca.findOne({
        _id: fincaId,
        organizacionId: organizacion._id,
        estado: 'Activa'
    })
        .setOptions({ omitirAislamientoOrganizacion: true })
        .lean();
    if (!finca) {
        throw crearErrorFinca('La finca seleccionada no existe o está inactiva.', 403, 'FINCA_NOT_AVAILABLE');
    }
    return finca;
};

const resolverFincasParaReporte = async ({ membresia, organizacionId, fincaIds }) => {
    const accesibles = await listarFincasAccesibles(membresia);
    const porId = new Map(accesibles.map((finca) => [String(finca._id), finca]));
    const solicitadas = Array.isArray(fincaIds)
        ? fincaIds
        : String(fincaIds || '').split(',').map((id) => id.trim()).filter(Boolean);
    const ids = solicitadas.length ? [...new Set(solicitadas)] : [...porId.keys()];

    if (!ids.length) throw crearErrorFinca('No hay fincas activas disponibles para el reporte.', 400, 'FINCAS_EMPTY');
    const denegada = ids.find((id) => !porId.has(String(id)));
    if (denegada) throw crearErrorFinca('Una de las fincas solicitadas no está disponible para este usuario.');

    return ids.map((id) => porId.get(String(id))).filter((finca) => String(finca.organizacionId) === String(organizacionId));
};

module.exports = {
    crearErrorFinca,
    listarFincasAccesibles,
    membresiaPuedeAccederFinca,
    resolverFincaActiva,
    resolverFincasParaReporte
};
