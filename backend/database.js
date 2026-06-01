const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI
    ? process.env.MONGODB_URI
    : 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const conectarDB = async () => {
    try {
        await mongoose.connect(URI, {
            dbName: DB_NAME,
            serverSelectionTimeoutMS: 5000
        });

        console.log('La base de datos ha sido conectada:', mongoose.connection.db.databaseName);
    } catch (error) {
        console.error('Error conectando a la base de datos:', error.message);
        throw error;
    }
};

module.exports = conectarDB;
