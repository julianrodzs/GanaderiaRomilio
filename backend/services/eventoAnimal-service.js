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

const crearFiltroIdempotente = (datosEvento) => {
    if (datosEvento.claveIdempotencia) {
        return { animal: datosEvento.animal, claveIdempotencia: datosEvento.claveIdempotencia };
    }
    return crearFiltroEvento(datosEvento);
};

const upsertEventoAnimal = async (datosEvento, opciones = {}) => {
    if (!datosEvento?.animal || !datosEvento?.tipoEvento || !datosEvento?.fecha || !datosEvento?.titulo) {
        return null;
    }

    const evento = { ...datosEvento };
    const claveIdempotencia = typeof evento.claveIdempotencia === 'string'
        ? evento.claveIdempotencia.trim()
        : '';
    if (claveIdempotencia) evento.claveIdempotencia = claveIdempotencia;
    else delete evento.claveIdempotencia;

    const filtro = crearFiltroIdempotente(evento);

    if (!filtro) {
        const creados = await EventoAnimal.create(
            [evento],
            opciones.session ? { session: opciones.session, ordered: true } : {}
        );
        return creados[0];
    }

    return EventoAnimal.findOneAndUpdate(
        filtro,
        { $set: evento },
        { upsert: true, new: true, setDefaultsOnInsert: true, ...(opciones.session ? { session: opciones.session } : {}) }
    );
};

const eliminarEventosPorReferencia = async ({ moduloOrigen, referenciaId, session }) => {
    if (!moduloOrigen || !referenciaId) return;
    await EventoAnimal.deleteMany({ moduloOrigen, referenciaId }, session ? { session } : {});
};

module.exports = {
    eliminarEventosPorReferencia,
    upsertEventoAnimal
};
