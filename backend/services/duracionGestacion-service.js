const Finca = require('../models/Finca');

const sumarDiasUtc = (fecha, dias) => {
    const resultado = new Date(fecha);
    resultado.setUTCDate(resultado.getUTCDate() + Number(dias));
    return resultado;
};

const obtenerDuracionGestacionBovina = async ({ fincaId, session } = {}) => {
    const finca = await Finca.findById(fincaId)
        .select('configuracionReproductiva')
        .session(session || null);
    const dias = Number(finca?.configuracionReproductiva?.diasGestacionBovinaGeneral);
    return Number.isFinite(dias) && dias > 0 ? dias : 283;
};

const calcularFechaProbablePartoBovino = async ({ fechaServicio, fincaId, session }) => {
    const dias = await obtenerDuracionGestacionBovina({ fincaId, session });
    return { diasGestacion: dias, fechaProbableParto: sumarDiasUtc(fechaServicio, dias) };
};

module.exports = {
    calcularFechaProbablePartoBovino,
    obtenerDuracionGestacionBovina,
    sumarDiasUtc
};
