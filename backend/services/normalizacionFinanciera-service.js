const CATEGORIAS_NORMALIZADAS = [
    'Alimentación',
    'Sanidad',
    'Combustible',
    'Mano de obra',
    'Potreros',
    'Infraestructura',
    'Herramientas',
    'Maquinaria',
    'Mantenimiento',
    'Ganado',
    'Porcinos',
    'Ventas',
    'Compras de animales',
    'Otros'
];

const UNIDADES_NORMALIZADAS = {
    L: ['L', 'LT', 'LTS', 'LITRO', 'LITROS'],
    KG: ['KG', 'KGS', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS'],
    G: ['G', 'GR', 'GRAMO', 'GRAMOS'],
    ML: ['ML', 'CC', 'CM3', 'MILILITRO', 'MILILITROS'],
    UNIDAD: ['UNIDAD', 'UNIDADES', 'UND', 'UNDS', 'U', 'ANIMAL', 'ANIMALES'],
    SACO: ['SACO', 'SACOS'],
    GALON: ['GALON', 'GALÓN', 'GALONES'],
    M: ['M', 'MT', 'MTS', 'METRO', 'METROS'],
    DOSIS: ['DOSIS']
};

const normalizarTexto = (valor = '') => String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const contiene = (texto, palabras) => palabras.some((palabra) => texto.includes(normalizarTexto(palabra)));

const normalizarCategoria = ({ categoria, producto, descripcion, tipoMovimiento } = {}) => {
    const categoriaLimpia = String(categoria || '').trim();
    const texto = normalizarTexto(`${categoria || ''} ${producto || ''} ${descripcion || ''} ${tipoMovimiento || ''}`);

    if (contiene(texto, ['venta'])) return 'Ventas';
    if (contiene(texto, ['compra de animales'])) return 'Compras de animales';
    if (contiene(texto, ['gasolina', 'diesel', 'diésel', 'combustible'])) return 'Combustible';
    if (contiene(texto, ['vacuna', 'vitamina', 'desparasit', 'medicamento', 'bimectin', 'antibiot', 'curativo', 'selenio', 'sanidad'])) return 'Sanidad';
    if (contiene(texto, ['alimento', 'sal mineral', 'melaza', 'concentrado', 'forraje', 'pasto', 'alimentacion', 'alimentación'])) return 'Alimentación';
    if (contiene(texto, ['planilla', 'salario', 'jornal', 'mano de obra', 'corte'])) return 'Mano de obra';
    if (contiene(texto, ['ganado', 'bovino', 'vaca', 'novillo', 'toro', 'ternero'])) return 'Ganado';
    if (contiene(texto, ['porcino', 'chancho', 'chancha', 'cerdo', 'lechon', 'lechón'])) return 'Porcinos';

    const categoriaCanonical = CATEGORIAS_NORMALIZADAS.find(
        (item) => normalizarTexto(item) === normalizarTexto(categoriaLimpia)
    );

    if (categoriaCanonical) return categoriaCanonical;

    if (contiene(texto, ['herbicida', 'fertiliz', 'semilla', 'urea', 'chapia', 'potrero', 'alambre', 'cerca', 'poste'])) return 'Potreros';
    if (contiene(texto, ['corral', 'galera', 'infraestructura', 'construccion', 'construcción', 'cemento', 'panel solar', 'tubo'])) return 'Infraestructura';
    if (contiene(texto, ['machete', 'pala', 'herramienta', 'areteadora', 'guantes', 'clavos'])) return 'Herramientas';
    if (contiene(texto, ['tractor', 'maquinaria', 'motor', 'bomba'])) return 'Maquinaria';
    if (contiene(texto, ['mantenimiento', 'reparacion', 'reparación', 'aceite', 'grasa'])) return 'Mantenimiento';

    return categoriaLimpia || 'Otros';
};

const normalizarUnidadBase = (unidad) => {
    const unidadTexto = normalizarTexto(unidad);
    if (!unidadTexto || unidadTexto === '-' || unidadTexto === 'SIN UNIDAD') return undefined;

    for (const [unidadNormalizada, equivalencias] of Object.entries(UNIDADES_NORMALIZADAS)) {
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

const normalizarMovimientoFinanciero = (movimiento = {}) => {
    const categoriaNormalizada = normalizarCategoria(movimiento);
    const datosUnidad = normalizarUnidad({
        unidad: movimiento.unidad,
        cantidad: movimiento.cantidad
    });

    return {
        ...movimiento,
        categoriaNormalizada,
        ...datosUnidad
    };
};

module.exports = {
    CATEGORIAS_NORMALIZADAS,
    UNIDADES_NORMALIZADAS,
    normalizarCategoria,
    normalizarUnidad,
    normalizarMovimientoFinanciero
};
