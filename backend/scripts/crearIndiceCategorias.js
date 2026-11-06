const mongoose = require('mongoose');
const conectarDB = require('../database');
const Animal = require('../models/Animal');

const main = async () => {
    require('dotenv').config();
    if (!process.env.MONGODB_URI) throw new Error('Defina MONGODB_URI explicitamente antes de crear el indice.');
    process.env.MONGODB_AUTO_INDEX = 'false';
    await conectarDB();
    const [clave, opciones] = Animal.schema.indexes().find(([, opciones]) => opciones.name === 'agenda_categoria_activa');
    const nombre = await Animal.collection.createIndex(clave, opciones);
    console.log(`Indice ${nombre} creado/verificado. No se modificaron animales ni se eliminaron otros indices.`);
};

if (require.main === module) main().catch((error) => {
    console.error(error.message); process.exitCode = 1;
}).finally(() => mongoose.disconnect());

module.exports = { main };
