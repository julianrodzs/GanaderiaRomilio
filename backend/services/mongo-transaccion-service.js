const mongoose = require('mongoose');

const ejecutarEnTransaccion = async (operacion, opciones = {}) => {
    const session = await mongoose.startSession();
    let resultado;
    try {
        await session.withTransaction(async () => {
            resultado = await operacion(session);
        }, opciones);
        return resultado;
    } finally {
        await session.endSession();
    }
};

module.exports = { ejecutarEnTransaccion };
