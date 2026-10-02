const ESPECIES_LOTE = ['Bovino', 'Porcino'];
const { normalizarObjetivoProductivo } = require('./objetivosProductivos');
const PROPOSITOS_LOTE = ['ENGORDE', 'REPRODUCCION', 'REEMPLAZO', 'DESTETE', 'CUARENTENA', 'VENTA', 'OTRO'];
const ESTADOS_LOTE = ['ACTIVO', 'CERRADO', 'CANCELADO'];
const ETAPAS_LOTE = ['INGRESO', 'ADAPTACION', 'DESARROLLO', 'ENGORDE', 'FINALIZACION', 'LISTO_VENTA', 'MANTENIMIENTO', 'OTRA'];
const ETAPAS_ALIMENTACION = ['INICIO', 'DESARROLLO', 'ENGORDE', 'FINALIZACION', 'MANTENIMIENTO', 'REPRODUCCION', 'OTRA'];

const OBJETIVO_POR_PROPOSITO = Object.freeze({
    ENGORDE: 'ENGORDE',
    REPRODUCCION: 'REPRODUCCION',
    REEMPLAZO: 'REEMPLAZO'
});

const normalizarPropositoLote = (valor) => {
    const clave = String(valor ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (clave === 'CRIA') return 'REPRODUCCION';
    return PROPOSITOS_LOTE.includes(clave) ? clave : null;
};

const propositoCompatibleConObjetivo = (proposito, objetivo) => {
    const requerido = OBJETIVO_POR_PROPOSITO[proposito];
    return !requerido || requerido === normalizarObjetivoProductivo(objetivo);
};

module.exports = {
    ESPECIES_LOTE,
    PROPOSITOS_LOTE,
    ESTADOS_LOTE,
    ETAPAS_LOTE,
    ETAPAS_ALIMENTACION,
    OBJETIVO_POR_PROPOSITO,
    normalizarPropositoLote,
    propositoCompatibleConObjetivo
};
