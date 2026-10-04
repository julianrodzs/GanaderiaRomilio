require('dotenv').config();

const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const HistorialFincaAnimal = require('../models/HistorialFincaAnimal');

const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';
const aplicar = process.argv.includes('--apply');

const prepararOperaciones = (animales, animalesConHistoria = new Set()) => animales
    .filter((animal) => animal.organizacionId && animal.fincaId && !animalesConHistoria.has(String(animal._id)))
    .map((animal) => ({
        updateOne: {
            filter: { organizacionId: animal.organizacionId, animal: animal._id, tipo: 'Ingreso inicial' },
            update: {
                $setOnInsert: {
                    organizacionId: animal.organizacionId,
                    animal: animal._id,
                    tipo: 'Ingreso inicial',
                    fincaDestino: animal.fincaId,
                    fecha: animal.createdAt || new Date(),
                    motivo: 'Pertenencia inicial registrada durante la preparación multi-finca',
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            },
            upsert: true
        }
    }));

const ejecutar = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME });
    const [animales, animalesConHistoria] = await Promise.all([
        Animal.collection.find({}, { projection: { organizacionId: 1, fincaId: 1, especie: 1, diio: 1, identificadorFinca: 1, createdAt: 1 } }).toArray(),
        HistorialFincaAnimal.collection.distinct('animal')
    ]);
    const operaciones = prepararOperaciones(animales, new Set(animalesConHistoria.map(String)));
    if (aplicar && operaciones.length) await HistorialFincaAnimal.collection.bulkWrite(operaciones, { ordered: false });
    console.log(JSON.stringify({
        modo: aplicar ? 'APLICADO' : 'DRY_RUN',
        animalesRevisados: animales.length,
        conHistoriaExistente: animalesConHistoria.length,
        historiasInicialesPendientes: operaciones.length,
        animalesOmitidosSinContexto: animales.filter((animal) => !animal.organizacionId || !animal.fincaId).length
    }, null, 2));
};

if (require.main === module) {
    ejecutar()
        .catch((error) => { console.error('Falló la inicialización del historial multi-finca:', error); process.exitCode = 1; })
        .finally(() => mongoose.disconnect());
}

module.exports = { prepararOperaciones };
