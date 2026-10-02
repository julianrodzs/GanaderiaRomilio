const ESPECIES_PRODUCTIVAS = ['Bovino', 'Porcino'];
const { OBJETIVOS_LINEA_PRODUCTIVA: OBJETIVOS_PRODUCTIVOS, normalizarObjetivoProductivo } = require('./objetivosProductivos');

const normalizarLineasProductivas = (lineas = []) => {
    if (!Array.isArray(lineas)) return [];
    const porEspecie = new Map();
    lineas.forEach((linea) => {
        if (!ESPECIES_PRODUCTIVAS.includes(linea?.especie)) return;
        const objetivos = [...new Set((linea.objetivos || [])
            .map(normalizarObjetivoProductivo)
            .filter((objetivo) => OBJETIVOS_PRODUCTIVOS.includes(objetivo)))];
        porEspecie.set(linea.especie, {
            especie: linea.especie,
            objetivos,
            activa: linea.activa !== false
        });
    });
    return ESPECIES_PRODUCTIVAS
        .filter((especie) => porEspecie.has(especie))
        .map((especie) => porEspecie.get(especie));
};

module.exports = {
    ESPECIES_PRODUCTIVAS,
    OBJETIVOS_PRODUCTIVOS,
    normalizarLineasProductivas
};
