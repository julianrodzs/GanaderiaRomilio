const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const conectarDB = require('../database');
const { validarConfiguracionArranque } = require('../config/env');

const rutaModelos = path.join(__dirname, '..', 'models');

const cargarModelos = () => {
    const archivos = fs.readdirSync(rutaModelos)
        .filter((archivo) => archivo.endsWith('.js'))
        .sort();
    archivos.forEach((archivo) => require(path.join(rutaModelos, archivo)));
    return archivos;
};

const claveIndice = (key) => JSON.stringify(Object.entries(key || {}));
const opcionesCriticas = (indice) => ({
    unique: indice.unique === true,
    sparse: indice.sparse === true,
    partialFilterExpression: indice.partialFilterExpression || null,
    expireAfterSeconds: indice.expireAfterSeconds ?? null
});

const limpiarIndiceEventoObsoleto = async (modelo = mongoose.models.EventoAnimal) => {
    if (!modelo) throw new Error('EventoAnimal no fue cargado.');
    await modelo.createCollection();
    const claveEsperada = claveIndice({ organizacionId: 1, fincaId: 1, claveIdempotencia: 1 });
    const indices = await modelo.collection.indexes();
    for (const indice of indices) {
        if (claveIndice(indice.key) !== claveEsperada) continue;
        const filtroCorrecto = indice.partialFilterExpression?.claveIdempotencia?.$type === 'string';
        if (indice.sparse === true || !filtroCorrecto) {
            console.log(`Eliminando índice obsoleto ${indice.name} de EventoAnimal...`);
            await modelo.collection.dropIndex(indice.name);
        }
    }
    await modelo.collection.updateMany(
        { $or: [{ claveIdempotencia: null }, { claveIdempotencia: /^\s*$/ }] },
        { $unset: { claveIdempotencia: '' } }
    );
};

const verificarModelo = async (modelo) => {
    const fisicos = await modelo.collection.indexes();
    const porClave = new Map(fisicos.map((indice) => [claveIndice(indice.key), indice]));
    const faltantes = [];
    for (const [key, opciones] of modelo.schema.indexes()) {
        const fisico = porClave.get(claveIndice(key));
        if (!fisico) {
            faltantes.push({ key, motivo: 'ausente' });
            continue;
        }
        const esperado = opcionesCriticas(opciones);
        const real = opcionesCriticas(fisico);
        if (JSON.stringify(esperado) !== JSON.stringify(real)) {
            faltantes.push({ key, motivo: 'opciones', esperado, real });
        }
    }
    if (faltantes.length) {
        const error = new Error(`Índices inválidos en ${modelo.modelName}: ${JSON.stringify(faltantes)}`);
        error.code = 'INDEX_VERIFICATION_FAILED';
        throw error;
    }
    return fisicos.length;
};

const main = async () => {
    require('dotenv').config();
    validarConfiguracionArranque();
    process.env.MONGODB_AUTO_INDEX = 'false';
    mongoose.set('autoIndex', false);
    const archivos = cargarModelos();
    if (archivos.length !== 65) {
        throw new Error(`Se esperaban 65 archivos de modelos y se encontraron ${archivos.length}.`);
    }
    await conectarDB();
    await limpiarIndiceEventoObsoleto();

    const modelos = Object.values(mongoose.models).sort((a, b) => a.modelName.localeCompare(b.modelName));
    const resultado = [];
    for (const modelo of modelos) {
        const eliminados = await modelo.syncIndexes();
        const total = await verificarModelo(modelo);
        resultado.push({ modelo: modelo.modelName, total, eliminados });
        console.log(`${modelo.modelName}: ${total} índices verificados.`);
    }
    console.log(`Sincronización completa: ${modelos.length} modelos registrados desde ${archivos.length} archivos.`);
    return resultado;
};

if (require.main === module) {
    main()
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        })
        .finally(() => mongoose.disconnect());
}

module.exports = { cargarModelos, limpiarIndiceEventoObsoleto, opcionesCriticas, verificarModelo };

