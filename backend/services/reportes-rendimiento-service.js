const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { crearMapaMonedas, esMovimientoInversionOperativa, normalizarMoneda } = require('./finanzas-calculos-service');

// Suma en el mismo orden y con el mismo predicado legado, sin retener el historico.
const sumarInversionHistorica = async () => {
    const totales = crearMapaMonedas();
    const cursor = MovimientoFinanciero.find({ naturaleza: 'Egreso' })
        .select('naturaleza tipoMovimiento referenciaModelo categoria moneda monto')
        .lean().cursor({ batchSize: 100 });
    try {
        for await (const movimiento of cursor) if (esMovimientoInversionOperativa(movimiento)) {
            totales[normalizarMoneda(movimiento.moneda)] += Number(movimiento.monto || 0);
        }
    } finally { await cursor.close(); }
    return totales;
};

module.exports = { sumarInversionHistorica };
