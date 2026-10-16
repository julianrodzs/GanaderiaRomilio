const REFERENCIAS_AUTOMATICAS = new Set([
    'CompraAnimal', 'VentaAnimal', 'TransferenciaInterna', 'GastoCompartido'
]);

const esMovimientoFinancieroAutomatico = (movimiento = {}) => (
    REFERENCIAS_AUTOMATICAS.has(movimiento.referenciaModelo)
    || movimiento.alcanceFinanciero === 'TRANSFERENCIA_INTERNA'
    || movimiento.alcanceFinanciero === 'GASTO_COMPARTIDO'
    || Boolean(movimiento.grupoConsolidacion)
);

const describirOrigenMovimiento = (movimiento = {}) => {
    if (movimiento.referenciaModelo === 'CompraAnimal') return 'Compra de animales';
    if (movimiento.referenciaModelo === 'VentaAnimal') return 'Venta de animales';
    if (movimiento.alcanceFinanciero === 'TRANSFERENCIA_INTERNA') return 'Transferencia multi-finca';
    if (movimiento.alcanceFinanciero === 'GASTO_COMPARTIDO') return 'Gasto compartido multi-finca';
    return 'Registro manual';
};

const presentarMovimientoFinanciero = (movimiento) => {
    if (!movimiento) return movimiento;
    const datos = typeof movimiento.toObject === 'function' ? movimiento.toObject() : { ...movimiento };
    return {
        ...datos,
        soloLectura: esMovimientoFinancieroAutomatico(datos),
        origenMovimiento: describirOrigenMovimiento(datos)
    };
};

const errorMovimientoAutomatico = (movimiento) => Object.assign(
    new Error(`Este movimiento fue generado por ${describirOrigenMovimiento(movimiento)}. Modifíquelo desde su módulo de origen.`),
    { status: 400, code: 'FINANCIAL_AUTOMATIC_MOVEMENT_READ_ONLY' }
);

module.exports = {
    REFERENCIAS_AUTOMATICAS,
    describirOrigenMovimiento,
    errorMovimientoAutomatico,
    esMovimientoFinancieroAutomatico,
    presentarMovimientoFinanciero
};
