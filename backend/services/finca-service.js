const { ESPECIES_PRODUCTIVAS, OBJETIVOS_PRODUCTIVOS, normalizarLineasProductivas } = require('../config/lineasProductivas');
const Finca = require('../models/Finca');

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
        const invalido = linea.objetivos.find((objetivo) => !OBJETIVOS_PRODUCTIVOS.includes(objetivo));
        if (invalido) {
            const error = new Error(`El objetivo ${invalido} no está permitido.`);
            error.status = 400;
            throw error;
        }
    });
    return normalizarLineasProductivas(lineas);
};

const actualizarLineasProductivas = async (fincaId, lineas) => {
    const lineasProductivas = validarLineasProductivas(lineas);
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
    if (objetivoProductivo && !linea.objetivos.includes(objetivoProductivo)) {
        const error = new Error(`${objetivoProductivo} no está habilitado para ${especie} en esta finca.`);
        error.status = 400;
        throw error;
    }
    return true;
};

module.exports = {
    actualizarLineasProductivas,
    validarLineasProductivas,
    validarObjetivoProductivoFinca
};
