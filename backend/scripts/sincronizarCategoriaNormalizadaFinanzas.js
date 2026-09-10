require('dotenv').config({ path: 'backend/.env' });

const mongoose = require('mongoose');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const main = async () => {
    await mongoose.connect(uri, { dbName });

    const filtro = {
        categoria: { $exists: true, $nin: [null, ''] },
        $or: [
            { categoriaNormalizada: { $exists: false } },
            { categoriaNormalizada: null },
            { categoriaNormalizada: '' },
            { $expr: { $ne: ['$categoriaNormalizada', '$categoria'] } }
        ]
    };

    const pendientes = await MovimientoFinanciero.countDocuments(filtro);
    const resultado = await MovimientoFinanciero.updateMany(
        filtro,
        [
            {
                $set: {
                    categoriaNormalizada: '$categoria'
                }
            }
        ]
    );

    console.log(JSON.stringify({
        baseDatos: dbName,
        pendientes,
        matched: resultado.matchedCount,
        modified: resultado.modifiedCount
    }, null, 2));

    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
