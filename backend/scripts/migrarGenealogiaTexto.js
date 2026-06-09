require('dotenv').config();

const mongoose = require('mongoose');
const conectarDB = require('../database');
const Animal = require('../models/Animal');

const migrar = async () => {
    await conectarDB();

    const animales = await Animal.find({
        $or: [
            { padreDiio: { $exists: true, $nin: [null, ''] }, padre: { $exists: false } },
            { madreDiio: { $exists: true, $nin: [null, ''] }, madre: { $exists: false } }
        ]
    });

    let actualizados = 0;

    for (const animal of animales) {
        let cambio = false;

        if (!animal.padre && !animal.padreExternoNombre && animal.padreDiio) {
            animal.padreExternoNombre = animal.padreDiio;
            cambio = true;
        }

        if (!animal.madre && !animal.madreExternaNombre && animal.madreDiio) {
            animal.madreExternaNombre = animal.madreDiio;
            cambio = true;
        }

        if (cambio) {
            if (!animal.origenGenealogico || animal.origenGenealogico === 'Desconocido') {
                animal.origenGenealogico = 'Externo';
            }
            await animal.save();
            actualizados += 1;
        }
    }

    console.log(`Migracion genealogica completada. Animales actualizados: ${actualizados}`);
    await mongoose.disconnect();
};

migrar().catch(async (error) => {
    console.error('Error migrando genealogia:', error.message);
    await mongoose.disconnect();
    process.exit(1);
});
