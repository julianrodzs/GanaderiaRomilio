const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI
    ? process.env.MONGODB_URI
    : 'mongodb://localhost/dataganado';

const conectarDB = async () => {
    try {
        await mongoose.connect(URI, {
            serverSelectionTimeoutMS: 5000
        });

        console.log('La base de datos ha sido conectada:', URI);
    } catch (error) {
        console.error('Error conectando a la base de datos:', error.message);
        throw error;
    }
};

module.exports = conectarDB;
