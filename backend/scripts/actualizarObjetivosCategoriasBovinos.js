require('dotenv').config();

const mongoose = require('mongoose');
const Animal = require('../models/Animal');
const Finca = require('../models/Finca');
const Organizacion = require('../models/Organizacion');
const { obtenerCategoriaBovinaPorEdad } = require('../services/categoriaAnimal-service');

const aplicar = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI || 'mongodb://localhost/dataganado';
const DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'dataganado';
const SLUG = process.env.ORGANIZACION_INICIAL_SLUG || 'ganaderia-romilio';

const distinto = (actual, siguiente) => String(actual || '') !== String(siguiente || '');

const prepararCambio = (animal, fechaReferencia) => {
    if (animal.sexo === 'Macho' && animal.estado !== 'Activo') {
        return { omitido: 'Macho no activo', cambios: null };
    }

    const categoriaCalculada = obtenerCategoriaBovinaPorEdad(animal, fechaReferencia);
    const cambios = {};

    if (categoriaCalculada && distinto(animal.categoria, categoriaCalculada)) {
        cambios.categoria = categoriaCalculada;
    }
    if (animal.sexo === 'Hembra' && distinto(animal.objetivoProductivo, 'REPRODUCCION')) {
        cambios.objetivoProductivo = 'REPRODUCCION';
    }

    const esToro = categoriaCalculada === 'Toro'
        || (!categoriaCalculada && animal.categoria === 'Toro');
    if (animal.sexo === 'Macho' && animal.estado === 'Activo' && esToro
        && distinto(animal.objetivoProductivo, 'REPRODUCCION')) {
        cambios.objetivoProductivo = 'REPRODUCCION';
    }

    return {
        omitido: categoriaCalculada ? null : 'Sin fecha de nacimiento válida para categoría',
        cambios: Object.keys(cambios).length ? cambios : null,
        categoriaCalculada
    };
};

const ejecutar = async () => {
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 10_000 });
    const organizacion = await Organizacion.findOne({ slug: SLUG }).lean();
    if (!organizacion) throw new Error(`No existe la organización ${SLUG}.`);

    const finca = organizacion.fincaPrincipal
        ? await Finca.collection.findOne({ _id: organizacion.fincaPrincipal, organizacionId: organizacion._id })
        : await Finca.collection.findOne({ organizacionId: organizacion._id, codigo: 'PRINCIPAL' });
    if (!finca) throw new Error('La organización no tiene una finca principal configurada.');

    const animales = await Animal.collection.find({
        organizacionId: organizacion._id,
        fincaId: finca._id,
        $or: [
            { especie: 'Bovino' },
            { especie: { $exists: false } },
            { especie: null }
        ]
    }).toArray();
    const fechaReferencia = new Date();
    const resumen = {
        bovinosRevisados: animales.length,
        hembras: 0,
        hembrasObjetivoReproduccion: 0,
        torosActivosObjetivoReproduccion: 0,
        categoriasActualizadas: 0,
        machosNoActivosOmitidos: 0,
        sinFechaNacimientoValida: 0,
        documentosConCambios: 0
    };
    const operaciones = [];
    const muestra = [];

    animales.forEach((animal) => {
        if (animal.sexo === 'Hembra') resumen.hembras += 1;
        const resultado = prepararCambio(animal, fechaReferencia);
        if (resultado.omitido === 'Macho no activo') resumen.machosNoActivosOmitidos += 1;
        if (resultado.omitido === 'Sin fecha de nacimiento válida para categoría') resumen.sinFechaNacimientoValida += 1;
        if (!resultado.cambios) return;

        if (resultado.cambios.objetivoProductivo === 'REPRODUCCION' && animal.sexo === 'Hembra') resumen.hembrasObjetivoReproduccion += 1;
        if (resultado.cambios.objetivoProductivo === 'REPRODUCCION' && animal.sexo === 'Macho') resumen.torosActivosObjetivoReproduccion += 1;
        if (resultado.cambios.categoria) resumen.categoriasActualizadas += 1;
        resumen.documentosConCambios += 1;

        operaciones.push({
            updateOne: {
                filter: { _id: animal._id, organizacionId: organizacion._id, fincaId: finca._id },
                update: { $set: { ...resultado.cambios, updatedAt: fechaReferencia } }
            }
        });
        if (muestra.length < 12) {
            muestra.push({
                diio: animal.diio || animal.identificadorFinca,
                sexo: animal.sexo,
                estado: animal.estado,
                antes: { categoria: animal.categoria, objetivoProductivo: animal.objetivoProductivo },
                despues: { ...resultado.cambios }
            });
        }
    });

    if (aplicar && operaciones.length) {
        await Animal.collection.bulkWrite(operaciones, { ordered: true });
    }

    console.log(JSON.stringify({
        modo: aplicar ? 'APLICADO' : 'REVISION',
        organizacion: organizacion.nombre,
        finca: finca.nombre,
        fechaReferencia,
        reglas: {
            hembrasBovinas: 'Objetivo REPRODUCCION',
            torosActivos: 'Objetivo REPRODUCCION',
            categoriaEdad: '<12 Ternero; 12-23 Novillo/Novilla; >=24 Toro/Vaca',
            machosNoActivos: 'Sin cambios'
        },
        resumen,
        muestra
    }, null, 2));
};

ejecutar()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());

module.exports = { prepararCambio };
