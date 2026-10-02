require('dotenv').config();

const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const { obtenerCategoriaAnimal } = require('../services/categoriaAnimal-service');

const aplicar = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const ejecutar = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 10_000 });
    const animales = await Animal.collection.find({ especie: { $in: ['Bovino', 'Porcino'] } }).toArray();
    const resumen = { revisados: animales.length, actualizables: 0, sinFechaValida: 0, porEspecie: { Bovino: 0, Porcino: 0 }, categorias: {} };
    const operaciones = [];
    const muestra = [];
    const fechaReferencia = new Date();

    animales.forEach((animal) => {
        const categoria = obtenerCategoriaAnimal(animal, fechaReferencia);
        if (!categoria) { resumen.sinFechaValida += 1; return; }
        if (categoria === animal.categoria) return;
        resumen.actualizables += 1;
        resumen.porEspecie[animal.especie] += 1;
        resumen.categorias[`${animal.categoria || 'Sin categoría'} -> ${categoria}`] = (resumen.categorias[`${animal.categoria || 'Sin categoría'} -> ${categoria}`] || 0) + 1;
        operaciones.push({ updateOne: { filter: { _id: animal._id }, update: { $set: { categoria, updatedAt: fechaReferencia } } } });
        if (muestra.length < 20) muestra.push({ diio: animal.diio || animal.identificadorFinca, especie: animal.especie, sexo: animal.sexo, fechaNacimiento: animal.fechaNacimiento, anterior: animal.categoria, nueva: categoria });
    });

    if (aplicar && operaciones.length) await Animal.collection.bulkWrite(operaciones, { ordered: false });
    console.log(JSON.stringify({ modo: aplicar ? 'APLICADO' : 'REVISION', fechaReferencia, resumen, muestra }, null, 2));
};

ejecutar().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
