const TIPOS_MOVIMIENTO_FINANCIERO = [
    'Planilla',
    'Inversion',
    'Compra',
    'Venta de animales',
    'Compra de animales'
];

const NATURALEZAS_FINANCIERAS = ['Ingreso', 'Egreso'];

const CATEGORIAS_FINANCIERAS = [
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
    'Chapia',
    'Herbicida',
    'Fertilización',
    'Cerca',
    'Corral',
    'Mantenimiento',
    'Limpieza',
    'Alimentación',
    'Sanidad',
    'Transporte',
    'Mano de obra general',
    'Otro'
];

const TIPOS_INVERSION_FINANCIERA = [
    'Ganado',
    'Finca',
    'Infraestructura',
    'Cercas',
    'Corrales',
    'Maquinaria',
    'Equipo',
    'Vehículo',
    'Mejora de potrero',
    'Otro'
];

const DESTINOS_USO_FINANCIERO = [
    'Chapia',
    'Tractor',
    'Galera',
    'Cortadora',
    'Cerca',
    'Rancho',
    'Aguas',
    'Sanidad',
    'Potrero',
    'Mantenimiento',
    'Alimentación',
    'Camada',
    'Animal',
    'Finca',
    'Administración',
    'Otro'
];

const ESTADOS_ACTIVO_FINANCIERO = [
    'En uso',
    'Pendiente',
    'En mantenimiento',
    'Vendido',
    'Retirado'
];

const METODOS_PAGO_FINANCIERO = [
    'Efectivo',
    'Transferencia',
    'SINPE',
    'Tarjeta',
    'Cheque',
    'Crédito',
    'Otro'
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
