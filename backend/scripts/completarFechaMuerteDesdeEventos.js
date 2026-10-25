require('dotenv').config();

const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const EventoAnimal = require('../models/EventoAnimal');

const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';
const aplicar = process.argv.includes('--apply');

const prepararMigracion = ({ animales = [], eventos = [] }) => {
    const porAnimal = eventos.reduce((mapa, evento) => {
        const clave = String(evento.animal);
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push(evento);
        return mapa;
    }, new Map());
    const operaciones = [];
    const sinFuente = [];
    animales.forEach((animal) => {
        const fuentes = (porAnimal.get(String(animal._id)) || [])
            .filter((evento) => evento.tipoEvento === 'Muerte' && evento.fecha)
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        if (!fuentes.length) {
            sinFuente.push({ animalId: animal._id, diio: animal.diio || animal.identificadorFinca || '--' });
            return;
        }
        operaciones.push({
            updateOne: {
                filter: { _id: animal._id, fechaMuerte: { $exists: false } },
                update: { $set: { fechaMuerte: fuentes[0].fecha } }
            }
        });
    });
    return { operaciones, sinFuente };
};

const ejecutar = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME });
    const animales = await Animal.collection.find({
        estado: 'Muerto',
        $or: [{ fechaMuerte: { $exists: false } }, { fechaMuerte: null }]
    }, { projection: { diio: 1, identificadorFinca: 1 } }).toArray();
    const eventos = animales.length ? await EventoAnimal.collection.find({
        animal: { $in: animales.map((animal) => animal._id) },
        tipoEvento: 'Muerte',
        fecha: { $type: 'date' }
    }, { projection: { animal: 1, tipoEvento: 1, fecha: 1 } }).toArray() : [];
    const resultado = prepararMigracion({ animales, eventos });
    if (aplicar && resultado.operaciones.length) {
        await Animal.collection.bulkWrite(resultado.operaciones, { ordered: false });
    }
    console.log(JSON.stringify({
        modo: aplicar ? 'APLICADO' : 'DRY_RUN',
        animalesRevisados: animales.length,
        fechasRecuperables: resultado.operaciones.length,
        sinFuenteConfiable: resultado.sinFuente
    }, null, 2));
};

if (require.main === module) {
    ejecutar()
        .catch((error) => { console.error('Falló la migración de fechaMuerte:', error); process.exitCode = 1; })
        .finally(() => mongoose.disconnect());
}

module.exports = { prepararMigracion };
