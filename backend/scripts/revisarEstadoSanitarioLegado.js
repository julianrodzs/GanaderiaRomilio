const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Animal = require('../models/Animal');
const EventoAnimal = require('../models/EventoAnimal');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');

const aplicarActivos = process.argv.includes('--apply-activos');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';

const main = async () => {
    await mongoose.connect(uri, { dbName });

    const animales = await Animal.find({ estado: 'En tratamiento' })
        .select('_id diio identificadorFinca nombre estado estadoSanitario')
        .lean();
    const ids = animales.map((animal) => animal._id);
    const tratamientos = ids.length
        ? await TratamientoSanitario.find({ estado: 'Activo', animales: { $in: ids } })
            .select('_id animales producto')
            .lean()
        : [];
    const tratamientoPorAnimal = new Map();
    tratamientos.forEach((tratamiento) => {
        tratamiento.animales.forEach((animalId) => {
            tratamientoPorAnimal.set(animalId.toString(), tratamiento);
        });
    });

    const conTratamientoActivo = animales.filter((animal) => tratamientoPorAnimal.has(animal._id.toString()));
    const requierenRevision = animales.filter((animal) => !tratamientoPorAnimal.has(animal._id.toString()));

    if (aplicarActivos) {
        for (const animal of conTratamientoActivo) {
            const tratamiento = tratamientoPorAnimal.get(animal._id.toString());
            await Animal.collection.updateOne(
                { _id: animal._id, estado: 'En tratamiento' },
                { $set: { estado: 'Activo', estadoSanitario: 'Enfermo' } }
            );
            await EventoAnimal.create({
                animal: animal._id,
                tipoEvento: 'Observacion',
                fecha: new Date(),
                titulo: 'Estado sanitario migrado',
                descripcion: 'El estado anterior En tratamiento se separó en estado Activo y estado sanitario Enfermo.',
                moduloOrigen: 'Sanidad',
                referenciaId: tratamiento._id,
                metadata: {
                    tipoCambio: 'Migración de estado sanitario',
                    estadoGeneralAnterior: 'En tratamiento',
                    estadoGeneralNuevo: 'Activo',
                    estadoSanitarioNuevo: 'Enfermo',
                    tratamientoId: tratamiento._id
                }
            });
        }
    }

    console.log(JSON.stringify({
        modo: aplicarActivos ? 'aplicar solo casos con tratamiento activo' : 'simulacion',
        baseDatos: dbName,
        encontrados: animales.length,
        migrablesConTratamientoActivo: conTratamientoActivo.map((animal) => ({
            id: animal._id,
            identificador: animal.diio || animal.identificadorFinca || animal.nombre,
            tratamiento: tratamientoPorAnimal.get(animal._id.toString())?.producto
        })),
        requierenRevisionManual: requierenRevision.map((animal) => ({
            id: animal._id,
            identificador: animal.diio || animal.identificadorFinca || animal.nombre,
            motivo: 'No tiene tratamiento activo; decidir entre Sano, En observación, Enfermo o Recuperación.'
        }))
    }, null, 2));

    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
