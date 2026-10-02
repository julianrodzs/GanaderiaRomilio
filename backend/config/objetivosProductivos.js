const OBJETIVOS_PRODUCTIVOS = Object.freeze([
    'ENGORDE',
    'REPRODUCCION',
    'REEMPLAZO',
    'OTRO',
    'SIN_DEFINIR'
]);
const OBJETIVOS_LINEA_PRODUCTIVA = Object.freeze(OBJETIVOS_PRODUCTIVOS.filter((objetivo) => objetivo !== 'SIN_DEFINIR'));

const ETIQUETAS_OBJETIVO_PRODUCTIVO = Object.freeze({
    ENGORDE: 'Engorde',
    REPRODUCCION: 'Reproducción',
    REEMPLAZO: 'Reemplazo',
    OTRO: 'Otro',
    SIN_DEFINIR: 'Sin definir'
});

const claveNormalizada = (valor) => String(valor ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();

const normalizarObjetivoProductivo = (valor) => {
    const clave = claveNormalizada(valor);
    if (!clave || clave === 'SIN_DEFINIR') return 'SIN_DEFINIR';
    if (clave === 'CRIA' || clave === 'REPRODUCCION') return 'REPRODUCCION';
    return OBJETIVOS_PRODUCTIVOS.includes(clave) ? clave : null;
};

const prepararObjetivoProductivo = (valor) => {
    const normalizado = normalizarObjetivoProductivo(valor);
    if (!normalizado) {
        const error = new Error(`El objetivo productivo ${String(valor).trim()} no está permitido.`);
        error.status = 400;
        error.codigo = 'OBJETIVO_PRODUCTIVO_INVALIDO';
        throw error;
    }
    return normalizado;
};

module.exports = {
    ETIQUETAS_OBJETIVO_PRODUCTIVO,
    OBJETIVOS_PRODUCTIVOS,
    OBJETIVOS_LINEA_PRODUCTIVA,
    claveNormalizada,
    normalizarObjetivoProductivo,
    prepararObjetivoProductivo
};
