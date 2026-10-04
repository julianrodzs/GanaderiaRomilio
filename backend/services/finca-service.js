const { ESPECIES_PRODUCTIVAS, OBJETIVOS_PRODUCTIVOS, normalizarLineasProductivas } = require('../config/lineasProductivas');
const { normalizarObjetivoProductivo } = require('../config/objetivosProductivos');
const Finca = require('../models/Finca');
const Organizacion = require('../models/Organizacion');
const { asegurarPuedeCrearFinca, ejecutarConReservaCuota, puedeUsarEspecie } = require('./plan-service');

const limpiarTexto = (valor = '') => String(valor || '').trim();
const prepararDatosFinca = (datos = {}, parcial = false) => {
    const resultado = {};
    if (!parcial || datos.nombre !== undefined) resultado.nombre = limpiarTexto(datos.nombre);
    if (!parcial || datos.codigo !== undefined) resultado.codigo = limpiarTexto(datos.codigo).toUpperCase();
    if (datos.descripcion !== undefined) resultado.descripcion = limpiarTexto(datos.descripcion);
    if (datos.ubicacion !== undefined) resultado.ubicacion = limpiarTexto(datos.ubicacion);
    if (datos.lineasProductivas !== undefined) resultado.lineasProductivas = validarLineasProductivas(datos.lineasProductivas);
    if (!parcial && (!resultado.nombre || !resultado.codigo)) {
        const error = new Error('Nombre y código de finca son requeridos.');
        error.status = 400;
        throw error;
    }
    return resultado;
};

const validarLineasProductivas = (lineas) => {
    if (!Array.isArray(lineas)) {
        const error = new Error('Las líneas productivas deben enviarse como una lista.');
        error.status = 400;
        throw error;
    }
    const especies = new Set();
    lineas.forEach((linea) => {
        if (!ESPECIES_PRODUCTIVAS.includes(linea?.especie)) {
            const error = new Error('La línea productiva contiene una especie no permitida.');
            error.status = 400;
            throw error;
        }
        if (especies.has(linea.especie)) {
            const error = new Error(`La especie ${linea.especie} está repetida.`);
            error.status = 400;
            throw error;
        }
        especies.add(linea.especie);
        if (!Array.isArray(linea.objetivos) || linea.objetivos.length === 0) {
            const error = new Error(`Selecciona al menos un objetivo para ${linea.especie}.`);
            error.status = 400;
            throw error;
        }
        const invalido = linea.objetivos.find((objetivo) => !normalizarObjetivoProductivo(objetivo));
        if (invalido) {
            const error = new Error(`El objetivo ${invalido} no está permitido.`);
            error.status = 400;
            throw error;
        }
    });
    return normalizarLineasProductivas(lineas);
};

const validarEspeciesLineasPlan = async (lineasProductivas, organizacionId) => {
    await Promise.all(lineasProductivas.filter((linea) => linea.activa !== false).map(async (linea) => {
        const resultado = await puedeUsarEspecie(linea.especie, organizacionId);
        if (!resultado.permitido) {
            const error = new Error(resultado.message);
            error.name = 'PlanError'; error.code = resultado.code; error.status = 403;
            error.especiePermitida = resultado.especiePermitida;
            throw error;
        }
    }));
    return lineasProductivas;
};

const actualizarLineasProductivas = async (fincaId, lineas, organizacionId) => {
    const lineasProductivas = validarLineasProductivas(lineas);
    await validarEspeciesLineasPlan(lineasProductivas, organizacionId);
    const finca = await Finca.findByIdAndUpdate(
        fincaId,
        { $set: { lineasProductivas } },
        { new: true, runValidators: true }
    );
    if (!finca) {
        const error = new Error('Finca no encontrada.');
        error.status = 404;
        throw error;
    }
    return finca;
};

const crearFinca = async ({ organizacionId, datos }) => {
    const permiso = await asegurarPuedeCrearFinca({ organizacionId, estado: 'Activa' });
    const preparada = prepararDatosFinca(datos);
    await validarEspeciesLineasPlan(preparada.lineasProductivas || [], organizacionId);
    const existente = await Finca.findOne({ codigo: preparada.codigo }).lean();
    if (existente) {
        const error = new Error('Ya existe una finca con ese código.');
        error.status = 409;
        throw error;
    }
    return ejecutarConReservaCuota({
        permiso, recurso: 'fincas', organizacionId,
        operacion: () => Finca.create({ ...preparada, estado: 'Activa' })
    });
};

const actualizarFinca = async (fincaId, datos, organizacionId) => {
    const preparada = prepararDatosFinca(datos, true);
    if (preparada.lineasProductivas) {
        await validarEspeciesLineasPlan(preparada.lineasProductivas, organizacionId);
    }
    const finca = await Finca.findByIdAndUpdate(
        fincaId,
        { $set: preparada },
        { new: true, runValidators: true }
    );
    if (!finca) {
        const error = new Error('Finca no encontrada.');
        error.status = 404;
        throw error;
    }
    return finca;
};

const cambiarEstadoFinca = async ({ fincaId, estado, organizacionId }) => {
    if (!['Activa', 'Inactiva'].includes(estado)) {
        const error = new Error('Estado de finca no válido.');
        error.status = 400;
        throw error;
    }
    const organizacion = await Organizacion.findById(organizacionId).select('fincaPrincipal');
    if (estado === 'Inactiva' && String(organizacion?.fincaPrincipal || '') === String(fincaId)) {
        const error = new Error('Primero selecciona otra finca principal antes de desactivar esta finca.');
        error.status = 409;
        throw error;
    }
    const actual = await Finca.findById(fincaId).select('estado');
    if (!actual) {
        const error = new Error('Finca no encontrada.'); error.status = 404; throw error;
    }
    if (actual.estado === estado) return actual;
    if (estado === 'Activa') {
        const permiso = await asegurarPuedeCrearFinca({ organizacionId, estado });
        return ejecutarConReservaCuota({
            permiso, recurso: 'fincas', organizacionId,
            operacion: () => Finca.findByIdAndUpdate(fincaId, { $set: { estado } }, { new: true, runValidators: true })
        });
    }
    const finca = await Finca.findByIdAndUpdate(fincaId, { $set: { estado } }, { new: true, runValidators: true });
    if (!finca) {
        const error = new Error('Finca no encontrada.');
        error.status = 404;
        throw error;
    }
    return finca;
};

const marcarFincaPrincipal = async ({ fincaId, organizacionId }) => {
    const finca = await Finca.findOne({ _id: fincaId, estado: 'Activa' });
    if (!finca) {
        const error = new Error('La finca principal debe existir y estar activa.');
        error.status = 400;
        throw error;
    }
    await Organizacion.findByIdAndUpdate(organizacionId, { $set: { fincaPrincipal: finca._id } });
    return finca;
};

const validarObjetivoProductivoFinca = async ({ fincaId, especie, objetivoProductivo }) => {
    if (!fincaId || !especie) return true;
    const finca = await Finca.findById(fincaId).select('lineasProductivas estado').lean();
    if (!finca || finca.estado !== 'Activa') {
        const error = new Error('La finca asociada no está activa o no existe.');
        error.status = 400;
        throw error;
    }
    if (!finca.lineasProductivas?.length) return true;
    const linea = finca.lineasProductivas.find((item) => item.especie === especie && item.activa !== false);
    if (!linea) {
        const error = new Error(`${especie} no está habilitado en esta finca.`);
        error.status = 400;
        throw error;
    }
    const objetivoCanonico = normalizarObjetivoProductivo(objetivoProductivo);
    if (objetivoProductivo && !objetivoCanonico) {
        const error = new Error(`${objetivoProductivo} no es un objetivo productivo válido.`);
        error.status = 400;
        throw error;
    }
    if (objetivoCanonico === 'SIN_DEFINIR') return true;
    if (objetivoCanonico && !linea.objetivos.includes(objetivoCanonico)) {
        const error = new Error(`${objetivoProductivo} no está habilitado para ${especie} en esta finca.`);
        error.status = 400;
        throw error;
    }
    return true;
};

module.exports = {
    actualizarFinca,
    actualizarLineasProductivas,
    cambiarEstadoFinca,
    crearFinca,
    marcarFincaPrincipal,
    prepararDatosFinca,
    validarEspeciesLineasPlan,
    validarLineasProductivas,
    validarObjetivoProductivoFinca
};
