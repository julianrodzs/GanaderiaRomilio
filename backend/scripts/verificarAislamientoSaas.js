require('dotenv').config();

const mongoose = require('mongoose');
const { ejecutarConOrganizacion } = require('../context/organizacion-context');
const AlertaCorreo = require('../models/AlertaCorreo');
const Animal = require('../models/Animal');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const Camada = require('../models/Camada');
const CatalogoFinanciero = require('../models/CatalogoFinanciero');
const { Membresia } = require('../models/Membresia');
const Notificacion = require('../models/Notificacion');
const Organizacion = require('../models/Organizacion');
const Potrero = require('../models/Potrero');

const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';
const SLUG = process.env.ORGANIZACION_INICIAL_SLUG || 'ganaderia-romilio';

const main = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 5000, autoIndex: false });
    try {
        const organizacion = await Organizacion.findOne({ slug: SLUG });
        if (!organizacion) throw new Error('No existe la organización inicial');

        const organizacionAjena = new mongoose.Types.ObjectId();
        const modelosConIndicesUnicos = [
            AlertaCorreo,
            Animal,
            AplicacionSanitaria,
            Camada,
            CatalogoFinanciero,
            Notificacion,
            Potrero
        ];
        const primerAnimal = await Animal.collection.findOne({ organizacionId: organizacion._id });
        const [
            animalesRaw,
            animalesOrganizacion,
            animalesAjenos,
            animalesSinContexto,
            agregadoOrganizacion,
            animalAjenoPorId,
            membresias
        ] = await Promise.all([
            Animal.collection.countDocuments({ organizacionId: organizacion._id }),
            ejecutarConOrganizacion(organizacion._id, () => Animal.countDocuments({})),
            ejecutarConOrganizacion(organizacionAjena, () => Animal.countDocuments({})),
            Animal.countDocuments({}),
            ejecutarConOrganizacion(organizacion._id, () => Animal.aggregate([{ $count: 'total' }])),
            ejecutarConOrganizacion(organizacionAjena, () => Animal.findById(primerAnimal?._id)),
            Membresia.countDocuments({ organizacionId: organizacion._id, estado: 'Activo' })
        ]);

        const indicesUnicosSinOrganizacion = [];
        for (const Modelo of modelosConIndicesUnicos) {
            const indices = await Modelo.collection.indexes();
            indices
                .filter((indice) => indice.unique && indice.name !== '_id_')
                .filter((indice) => !Object.hasOwn(indice.key, 'organizacionId'))
                .forEach((indice) => indicesUnicosSinOrganizacion.push({
                    coleccion: Modelo.collection.collectionName,
                    indice: indice.name
                }));
        }

        const resultado = {
            organizacion: organizacion.nombre,
            animalesRaw,
            animalesOrganizacion,
            animalesAjenos,
            animalesSinContexto,
            animalesAgregacion: agregadoOrganizacion[0]?.total || 0,
            accesoAjenoPorId: Boolean(animalAjenoPorId),
            membresiasActivas: membresias,
            indicesUnicosSinOrganizacion,
            aislamientoCorrecto: animalesRaw === animalesOrganizacion
                && animalesRaw === (agregadoOrganizacion[0]?.total || 0)
                && animalesAjenos === 0
                && animalesSinContexto === 0
                && !animalAjenoPorId
                && indicesUnicosSinOrganizacion.length === 0
        };

        console.log(JSON.stringify(resultado, null, 2));
        if (!resultado.aislamientoCorrecto) process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

main().catch((error) => {
    console.error('Error verificando aislamiento SaaS:', error);
    process.exitCode = 1;
});
