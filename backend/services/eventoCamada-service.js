const EventoCamada = require('../models/EventoCamada');

const upsertEventoCamada = async (datosEvento) => {
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
            { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
        );
    }

    return EventoCamada.create(datosEvento);
};

const eliminarEventosCamadaPorReferencia = ({ moduloOrigen, referenciaId }) => {
    if (!moduloOrigen || !referenciaId) return Promise.resolve({ deletedCount: 0 });
    return EventoCamada.deleteMany({ moduloOrigen, referenciaId });
};

module.exports = {
    upsertEventoCamada,
    eliminarEventosCamadaPorReferencia
};
