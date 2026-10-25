const EventoCamada = require('../models/EventoCamada');

const upsertEventoCamada = async (datosEvento, opciones = {}) => {
    if (!datosEvento?.camada || !datosEvento?.tipoEvento || !datosEvento?.fecha || !datosEvento?.titulo) {
        return null;
    }

    if (datosEvento.referenciaId) {
        return EventoCamada.findOneAndUpdate(
            {
                camada: datosEvento.camada,
                moduloOrigen: datosEvento.moduloOrigen || 'Manual',
                referenciaId: datosEvento.referenciaId,
                tipoEvento: datosEvento.tipoEvento
            },
            datosEvento,
            { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true, ...(opciones.session ? { session: opciones.session } : {}) }
        );
    }

    if (opciones.session) {
        const creados = await EventoCamada.create([datosEvento], { session: opciones.session, ordered: true });
        return creados[0];
    }
    return EventoCamada.create(datosEvento);
};

const eliminarEventosCamadaPorReferencia = ({ moduloOrigen, referenciaId, session }) => {
    if (!moduloOrigen || !referenciaId) return Promise.resolve({ deletedCount: 0 });
    return EventoCamada.deleteMany({ moduloOrigen, referenciaId }, session ? { session } : {});
};

module.exports = {
    upsertEventoCamada,
    eliminarEventosCamadaPorReferencia
};
