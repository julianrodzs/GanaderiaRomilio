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
        especie: 'Porcino',
        $or: [
            { raza: { $type: 'string', $ne: '' } },
            { descripcionRacial: { $type: 'string', $ne: '' } },
            { razaPrincipal: { $type: 'string', $ne: '' } }
        ]
    }).toArray();
    const resumen = {
        revisados: animales.length,
        porNormalizar: 0,
        normalizados: 0,
        ambiguos: 0,
        noReconocidos: 0,
        yaEstructurados: 0
    };
    const operaciones = [];
    const ejemplos = [];

    animales.forEach((animal) => {
        if (animal.razaPrincipal && animal.grupoRacial) {
            resumen.yaEstructurados += 1;
            return;
        }
        resumen.porNormalizar += 1;
        const normalizado = prepararDatosRaciales({
            especie: 'Porcino',
            raza: animal.raza,
            descripcionRacial: animal.descripcionRacial,
            razaPrincipal: animal.razaPrincipal,
            razaSecundaria: animal.razaSecundaria,
            gradoRacial: animal.gradoRacial
        }, animal);
        if (normalizado.gradoRacial === 'Cruce no definido') resumen.ambiguos += 1;
        if (normalizado.razaPrincipal === 'Otra') resumen.noReconocidos += 1;

        const $set = {
            razaPrincipal: normalizado.razaPrincipal,
            grupoRacial: normalizado.grupoRacial,
            gradoRacial: normalizado.gradoRacial,
            descripcionRacial: normalizado.descripcionRacial || animal.raza
        };
        ['razaSecundaria', 'variedadRacial', 'composicionRacial', 'fraccionRazaPrincipal', 'fraccionRazaSecundaria']
            .forEach((campo) => {
                if (normalizado[campo]) $set[campo] = normalizado[campo];
            });
        operaciones.push({ updateOne: { filter: { _id: animal._id }, update: { $set } } });
        if (ejemplos.length < 25) ejemplos.push({
            id: animal._id,
            diio: animal.diio || animal.identificadorFinca,
            valorAnterior: animal.descripcionRacial || animal.raza,
            razaPrincipal: $set.razaPrincipal,
            grupoRacial: $set.grupoRacial,
            gradoRacial: $set.gradoRacial
        });
    });

    if (aplicar && operaciones.length) {
        const resultado = await Animal.collection.bulkWrite(operaciones, { ordered: false });
        resumen.normalizados = resultado.modifiedCount;
    } else if (!aplicar) {
        resumen.normalizados = operaciones.length;
    }

    console.log(JSON.stringify({
        modo: aplicar ? 'aplicado' : 'simulacion',
        nota: 'No se modifica el campo histórico raza ni se crean eventos productivos.',
        ...resumen,
        ejemplos
    }, null, 2));
    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
