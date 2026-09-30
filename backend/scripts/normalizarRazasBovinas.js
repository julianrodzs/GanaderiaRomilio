const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Animal = require('../models/Animal');
const { prepararDatosRaciales } = require('../services/raza-service');

const aplicar = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const main = async () => {
    await mongoose.connect(uri, { dbName });
    const animales = await Animal.collection.find({
        $and: [
            { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] },
            { $or: [{ raza: { $type: 'string', $ne: '' } }, { descripcionRacial: { $type: 'string', $ne: '' } }] }
        ]
    }).toArray();

    const resumen = { total: animales.length, normalizados: 0, ambiguos: 0, noReconocidos: 0, yaEstructurados: 0 };
    const ejemplos = [];
    const porValorOriginal = new Map();

    for (const animal of animales) {
        if (animal.razaPrincipal && animal.grupoRacial) {
            resumen.yaEstructurados += 1;
            continue;
        }
        const original = animal.descripcionRacial || animal.raza || 'Sin descripción';
        porValorOriginal.set(original, (porValorOriginal.get(original) || 0) + 1);
        const normalizado = prepararDatosRaciales({
            especie: animal.especie || 'Bovino',
            raza: animal.raza,
            descripcionRacial: animal.descripcionRacial
        }, animal);
        resumen.normalizados += 1;
        if (normalizado.gradoRacial === 'Cruce no definido') resumen.ambiguos += 1;
        if (normalizado.razaPrincipal === 'Otra') resumen.noReconocidos += 1;

        const $set = {
            razaPrincipal: normalizado.razaPrincipal,
            grupoRacial: normalizado.grupoRacial,
            gradoRacial: normalizado.gradoRacial,
            descripcionRacial: normalizado.descripcionRacial || animal.raza
        };
        ['razaSecundaria', 'variedadRacial', 'composicionRacial'].forEach((campo) => {
            if (normalizado[campo]) $set[campo] = normalizado[campo];
        });
        if (aplicar) await Animal.collection.updateOne({ _id: animal._id }, { $set });
        if (ejemplos.length < 20) ejemplos.push({
            id: animal._id,
            original: animal.raza,
            razaPrincipal: $set.razaPrincipal,
            grupoRacial: $set.grupoRacial,
            gradoRacial: $set.gradoRacial
        });
    }

    console.log(JSON.stringify({
        modo: aplicar ? 'aplicado' : 'simulacion',
        nota: 'El campo histórico raza no se modifica.',
        ...resumen,
        valoresOriginales: [...porValorOriginal.entries()]
            .map(([valor, total]) => ({ valor, total }))
            .sort((a, b) => b.total - a.total),
        ejemplos
    }, null, 2));
    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
