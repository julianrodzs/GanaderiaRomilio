const TIPOS_MOVIMIENTO_FINANCIERO = [
    'Compra',
    'Compra de animales',
    'Inversion',
    'Planilla',
    'Venta de animales'
];

const NATURALEZAS_FINANCIERAS = ['Egreso', 'Ingreso'];

const CATEGORIAS_FINANCIERAS = [
    'Alimentación',
    'Combustible',
    'Compras de animales',
    'Ganado',
    'Herramientas',
    'Infraestructura',
    'Mano de obra',
    'Mantenimiento',
    'Maquinaria',
    'Otros',
    'Porcinos',
    'Potreros',
    'Sanidad',
    'Ventas'
];

const UNIDADES_FINANCIERAS = {
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

const TIPOS_TRABAJO_FINANCIERO = [
    'Alimentación',
    'Cerca',
    'Chapia',
    'Corral',
    'Fertilización',
    'Herbicida',
    'Limpieza',
    'Mantenimiento',
    'Mano de obra general',
    'Otro',
    'Sanidad',
    'Transporte'
];

const TIPOS_INVERSION_FINANCIERA = [
    'Cercas',
    'Corrales',
    'Equipo',
    'Finca',
    'Ganado',
    'Infraestructura',
    'Maquinaria',
    'Mejora de potrero',
    'Otro',
    'Vehículo'
];

const DESTINOS_USO_FINANCIERO = [
    'Administración',
    'Aguas',
    'Alimentación',
    'Animal',
    'Camada',
    'Cerca',
    'Chapia',
    'Cortadora',
    'Finca',
    'Galera',
    'Mantenimiento',
    'Otro',
    'Potrero',
    'Rancho',
    'Sanidad',
    'Tractor'
];

const ESTADOS_ACTIVO_FINANCIERO = [
    'En mantenimiento',
    'En uso',
    'Pendiente',
    'Retirado',
    'Vendido'
];

const METODOS_PAGO_FINANCIERO = [
    'Cheque',
    'Crédito',
    'Efectivo',
    'Otro',
    'SINPE',
    'Tarjeta',
    'Transferencia'
];

const MONEDAS_FINANCIERAS = ['CRC', 'USD'];

const obtenerCatalogosFinancieros = () => ({
    tiposMovimiento: TIPOS_MOVIMIENTO_FINANCIERO,
    naturalezas: NATURALEZAS_FINANCIERAS,
    categorias: CATEGORIAS_FINANCIERAS,
    unidades: Object.keys(UNIDADES_FINANCIERAS),
    equivalenciasUnidades: UNIDADES_FINANCIERAS,
    tiposTrabajo: TIPOS_TRABAJO_FINANCIERO,
    tiposInversion: TIPOS_INVERSION_FINANCIERA,
    destinosUso: DESTINOS_USO_FINANCIERO,
    estadosActivo: ESTADOS_ACTIVO_FINANCIERO,
    metodosPago: METODOS_PAGO_FINANCIERO,
    monedas: MONEDAS_FINANCIERAS
});

module.exports = {
    TIPOS_MOVIMIENTO_FINANCIERO,
    NATURALEZAS_FINANCIERAS,
    CATEGORIAS_FINANCIERAS,
    UNIDADES_FINANCIERAS,
    TIPOS_TRABAJO_FINANCIERO,
    TIPOS_INVERSION_FINANCIERA,
    DESTINOS_USO_FINANCIERO,
    ESTADOS_ACTIVO_FINANCIERO,
    METODOS_PAGO_FINANCIERO,
    MONEDAS_FINANCIERAS,
    obtenerCatalogosFinancieros
};
