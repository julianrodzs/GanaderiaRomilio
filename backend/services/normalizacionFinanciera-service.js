const {
    CATEGORIAS_FINANCIERAS,
    UNIDADES_FINANCIERAS
} = require('../config/catalogosFinancieros');

const normalizarTexto = (valor = '') => String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const normalizarCategoria = ({ categoria } = {}) => {
    const categoriaLimpia = String(categoria || '').trim();

    const categoriaCanonical = CATEGORIAS_FINANCIERAS.find(
        (item) => normalizarTexto(item) === normalizarTexto(categoriaLimpia)
    );

    if (categoriaCanonical) return categoriaCanonical;

    return categoriaLimpia || 'Otros';
};

const normalizarUnidadBase = (unidad) => {
    const unidadTexto = normalizarTexto(unidad);
    if (!unidadTexto || unidadTexto === '-' || unidadTexto === 'SIN UNIDAD') return undefined;

    for (const [unidadNormalizada, equivalencias] of Object.entries(UNIDADES_FINANCIERAS)) {
        if (equivalencias.includes(unidadTexto)) return unidadNormalizada;
    }

    return unidadTexto;
};

const normalizarUnidad = ({ unidad, cantidad } = {}) => {
    const unidadTexto = String(unidad || '').trim();
    const coincidencia = unidadTexto.match(/^([0-9]+(?:[,.][0-9]+)?)\s*(.+)$/);
    const factorUnidad = coincidencia
        ? Number(coincidencia[1].replace(',', '.'))
        : 1;
    const unidadBase = normalizarUnidadBase(coincidencia ? coincidencia[2] : unidadTexto);
    const cantidadNumero = Number(cantidad);
    const cantidadFisica = Number.isFinite(cantidadNumero) && cantidadNumero > 0 && unidadBase
        ? cantidadNumero * factorUnidad
        : undefined;

    return {
        unidadNormalizada: unidadBase,
        factorUnidad: unidadBase ? factorUnidad : undefined,
        cantidadFisica
    };
};

const calcularPrecioUnitarioFisico = ({ monto } = {}, { cantidadFisica } = {}) => {
    const montoNumero = Number(monto);

    if (!Number.isFinite(montoNumero) || montoNumero <= 0 || !cantidadFisica || cantidadFisica <= 0) {
        return undefined;
    }

    return montoNumero / cantidadFisica;
};

const normalizarMovimientoFinanciero = (movimiento = {}) => {
    const categoriaNormalizada = normalizarCategoria(movimiento);
    const datosUnidad = normalizarUnidad({
        unidad: movimiento.unidad,
        cantidad: movimiento.cantidad
    });

    return {
        ...movimiento,
        categoriaNormalizada,
        ...datosUnidad,
        precioUnitarioFisico: calcularPrecioUnitarioFisico(movimiento, datosUnidad)
    };
};

module.exports = {
    CATEGORIAS_NORMALIZADAS: CATEGORIAS_FINANCIERAS,
    UNIDADES_NORMALIZADAS: UNIDADES_FINANCIERAS,
    normalizarCategoria,
    normalizarUnidad,
    calcularPrecioUnitarioFisico,
    normalizarMovimientoFinanciero
};
