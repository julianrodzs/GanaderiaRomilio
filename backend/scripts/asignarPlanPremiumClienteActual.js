require('dotenv').config();

const mongoose = require('mongoose');
const Organizacion = require('../models/Organizacion');

const aplicar = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';
const SLUG = process.env.ORGANIZACION_INICIAL_SLUG || 'ganaderia-romilio';

const ejecutar = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 10_000 });
    const organizacion = await Organizacion.findOne({ slug: SLUG }).lean();
    if (!organizacion) throw new Error(`No existe la organización ${SLUG}. Ejecuta primero la migración SaaS.`);

    const anterior = organizacion.plan?.codigo || 'ESENCIAL';
    console.log(JSON.stringify({ organizacion: organizacion.nombre, slug: SLUG, planActual: anterior, planObjetivo: 'PREMIUM', aplicar }, null, 2));

    if (aplicar && anterior !== 'PREMIUM') {
        await Organizacion.updateOne({ _id: organizacion._id }, {
            $set: {
                'plan.codigo': 'PREMIUM',
                'plan.estado': 'Activo',
                'plan.especiePlan': null,
                'plan.fechaAsignacion': new Date()
            }
        });
        console.log('Plan Premium asignado correctamente.');
    } else if (!aplicar) {
        console.log('Vista previa. Usa --apply para confirmar.');
    } else {
        console.log('La organización ya tiene el plan Premium.');
    }
};

ejecutar()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
