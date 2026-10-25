const mongoose = require('mongoose');

const obtenerUri = () => process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const obtenerDbName = () => process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';
const autoIndexHabilitado = () => process.env.MONGODB_AUTO_INDEX
    ? process.env.MONGODB_AUTO_INDEX === 'true'
    : process.env.NODE_ENV !== 'production';

const verificarSoporteTransacciones = async () => {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') {
        const error = new Error('MongoDB debe ejecutarse como replica set o clúster sharded para soportar transacciones.');
        error.code = 'MONGODB_TRANSACTIONS_REQUIRED';
        throw error;
    }
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await mongoose.connection.db.collection('__startup_transaction_check').findOne({}, { session });
        });
    } finally {
        await session.endSession();
    }
};

const conectarDB = async () => {
    try {
        require('./config/env').validarConfiguracionArranque();
        await mongoose.connect(obtenerUri(), {
            dbName: obtenerDbName(),
            serverSelectionTimeoutMS: 5000,
            autoIndex: autoIndexHabilitado()
        });

        if (process.env.NODE_ENV === 'production' || process.env.MONGODB_REQUIRE_TRANSACTIONS === 'true') {
            await verificarSoporteTransacciones();
        }

        console.log('La base de datos ha sido conectada:', mongoose.connection.db.databaseName);
    } catch (error) {
        console.error('Error conectando a la base de datos:', error.message);
        throw error;
    }
};

module.exports = conectarDB;
module.exports.autoIndexHabilitado = autoIndexHabilitado;
module.exports.verificarSoporteTransacciones = verificarSoporteTransacciones;
