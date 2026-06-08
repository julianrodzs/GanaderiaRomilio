const EventoAnimal = require('../models/EventoAnimal');

const crearFiltroEvento = ({ animal, moduloOrigen, referenciaId, tipoEvento }) => {
    if (!referenciaId) return null;

    return {
        animal,
        moduloOrigen,
        referenciaId,
        tipoEvento
    };
};

const upsertEventoAnimal = async (datosEvento) => {
    if (!datosEvento?.animal || !datosEvento?.tipoEvento || !datosEvento?.fecha || !datosEvento?.titulo) {
        return null;
    }

    const filtro = crearFiltroEvento(datosEvento);

    if (!filtro) {
        return EventoAnimal.create(datosEvento);
    }

    return EventoAnimal.findOneAndUpdate(
        filtro,
        { $set: datosEvento },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

const eliminarEventosPorReferencia = async ({ moduloOrigen, referenciaId }) => {
    if (!moduloOrigen || !referenciaId) return;
    await EventoAnimal.deleteMany({ moduloOrigen, referenciaId });
};

module.exports = {
    eliminarEventosPorReferencia,
    upsertEventoAnimal
};
