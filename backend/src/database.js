const mongoose = require('mongoose');

//cadena de conexion a la base de datos
const URI = process.env.MONGODB_URI
    ? process.env.MONGODB_URI
    : 'mongodb://localhost/databasetest';

mongoose.connect(URI)
    .then(() => {
        console.log('La base de datos ha sido conectada:', URI);
    })
    .catch(err => {
        console.error('Error conectando a la base de datos:', err);
    });

const connection = mongoose.connection;

connection.once('open', () => {
    console.log('la base de datos ha sido conectada: ', URI);
});