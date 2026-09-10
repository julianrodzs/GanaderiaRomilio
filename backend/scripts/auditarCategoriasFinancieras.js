require('dotenv').config({ path: 'backend/.env' });

const mongoose = require('mongoose');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const CatalogoFinanciero = require('../models/CatalogoFinanciero');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const limpiar = (valor) => String(valor || '').trim();

const valorVacio = (campo) => ({
    $or: [
        { [campo]: { $exists: false } },
        { [campo]: null },
        { [campo]: '' }
    ]
});

const valorPresente = (campo) => ({
    [campo]: { $nin: [null, ''] }
});

const agruparPorCampo = (campo) => MovimientoFinanciero.aggregate([
    {
        $group: {
            _id: `$${campo}`,
            cantidad: { $sum: 1 }
        }
    },
    { $sort: { cantidad: -1, _id: 1 } }
]);

const main = async () => {
    await mongoose.connect(uri, { dbName });

    const catalogosActivos = await CatalogoFinanciero
        .find({ tipo: 'categoria', activo: true })
        .select('nombre -_id')
        .lean();
    const categoriasActivas = new Set(catalogosActivos.map((item) => limpiar(item.nombre)));

    const [
        total,
        soloCategoria,
        soloCategoriaNormalizada,
        sinCategorias,
        ambasIguales,
        ambasDiferentes,
        categoriasUsadas,
        categoriasNormalizadasUsadas
    ] = await Promise.all([
        MovimientoFinanciero.countDocuments(),
        MovimientoFinanciero.countDocuments({
            ...valorPresente('categoria'),
            ...valorVacio('categoriaNormalizada')
        }),
        MovimientoFinanciero.countDocuments({
            ...valorPresente('categoriaNormalizada'),
            ...valorVacio('categoria')
        }),
        MovimientoFinanciero.countDocuments({
            $and: [valorVacio('categoria'), valorVacio('categoriaNormalizada')]
        }),
        MovimientoFinanciero.countDocuments({
            ...valorPresente('categoria'),
            ...valorPresente('categoriaNormalizada'),
            $expr: { $eq: ['$categoria', '$categoriaNormalizada'] }
        }),
        MovimientoFinanciero.countDocuments({
            ...valorPresente('categoria'),
            ...valorPresente('categoriaNormalizada'),
            $expr: { $ne: ['$categoria', '$categoriaNormalizada'] }
        }),
        agruparPorCampo('categoria'),
        agruparPorCampo('categoriaNormalizada')
    ]);

    const categoriasFueraCatalogoActivo = categoriasUsadas
        .filter((item) => limpiar(item._id) && !categoriasActivas.has(limpiar(item._id)));

    const muestrasDiferentes = await MovimientoFinanciero.find({
        ...valorPresente('categoria'),
        ...valorPresente('categoriaNormalizada'),
        $expr: { $ne: ['$categoria', '$categoriaNormalizada'] }
    })
        .select('fecha tipoMovimiento categoria categoriaNormalizada descripcion proveedor monto')
        .sort({ fecha: -1 })
        .limit(20)
        .lean();

    const muestrasSoloCategoria = await MovimientoFinanciero.find({
        ...valorPresente('categoria'),
        ...valorVacio('categoriaNormalizada')
    })
        .select('fecha tipoMovimiento categoria categoriaNormalizada descripcion proveedor monto')
        .sort({ fecha: -1 })
        .limit(20)
        .lean();

    console.log(JSON.stringify({
        baseDatos: dbName,
        resumen: {
            total,
            soloCategoria,
            soloCategoriaNormalizada,
            sinCategorias,
            ambasIguales,
            ambasDiferentes
        },
        categoriasUsadas,
        categoriasNormalizadasUsadas,
        categoriasFueraCatalogoActivo,
        muestrasSoloCategoria,
        muestrasDiferentes
    }, null, 2));

    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
