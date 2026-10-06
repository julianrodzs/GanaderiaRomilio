const ConfiguracionProductiva = require('../models/ConfiguracionProductiva');

const CAMPOS_CONFIGURABLES = [
    'porcinos.gmdFase1KgDia',
    'porcinos.gmdFase2KgDia',
    'porcinos.gmdFase3KgDia',
    'porcinos.gmdDesarrolloKgDia',
    'porcinos.gmdEngordeKgDia',
    'porcinos.pesoObjetivoEngordeKg',
    'porcinosCria.nacidosVivosObjetivoCamada',
    'porcinosCria.destetadosObjetivoCamada',
    'porcinosCria.supervivenciaPredesteteObjetivoPct',
    'bovinosEngorde.gmdObjetivoKgDia',
    'bovinosEngorde.pesoObjetivoKg',
    'diasPesajeReciente'
];

const obtenerConfiguracionProductiva = () => ConfiguracionProductiva.findOneAndUpdate(
    { clave: 'principal' },
    { $setOnInsert: { clave: 'principal' } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
);

const leerRuta = (objeto, ruta) => ruta.split('.').reduce((actual, campo) => actual?.[campo], objeto);

const actualizarConfiguracionProductiva = async (datos, usuarioId) => {
    const cambios = {};
    CAMPOS_CONFIGURABLES.forEach((ruta) => {
        const valor = leerRuta(datos, ruta);
        if (valor === undefined) return;
        const numero = Number(valor);
        if (!Number.isFinite(numero) || numero <= 0) {
            const error = new Error(`El valor de ${ruta} debe ser mayor que cero.`);
            error.status = 400;
            throw error;
        }
        cambios[ruta] = numero;
    });
    if (Object.keys(cambios).length === 0) {
        const error = new Error('No se recibieron metas productivas válidas para actualizar.');
        error.status = 400;
        throw error;
    }
    cambios.actualizadoPor = usuarioId;
    return ConfiguracionProductiva.findOneAndUpdate(
        { clave: 'principal' },
        { $set: cambios, $setOnInsert: { clave: 'principal' } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
};

module.exports = {
    CAMPOS_CONFIGURABLES,
    actualizarConfiguracionProductiva,
    obtenerConfiguracionProductiva
};
