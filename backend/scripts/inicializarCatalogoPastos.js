require('dotenv').config();
const conectarDB = require('../database');
const CatalogoPasto = require('../models/CatalogoPasto');
const { asegurarCatalogoPastosBase } = require('../services/potreroCobertura-service');

const ejecutar = async () => {
    await conectarDB();
    await asegurarCatalogoPastosBase();
    const resumen = await CatalogoPasto.aggregate([
        { $group: { _id: '$categoria', cantidad: { $sum: 1 }, activos: { $sum: { $cond: ['$activo', 1, 0] } } } },
        { $sort: { _id: 1 } }
    ]);
    console.log('Catálogo de coberturas inicializado:', resumen);
    process.exit(0);
};

ejecutar().catch((error) => {
    console.error('No se pudo inicializar el catálogo de coberturas:', error.message);
    process.exit(1);
});
