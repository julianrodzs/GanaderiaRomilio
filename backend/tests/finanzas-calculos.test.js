const test = require('node:test');
const assert = require('node:assert/strict');
const {
    asignarEconomiaPorCamada,
    calcularTotalCompraAnimal,
    distribuirMontoEquitativo,
    esMovimientoInversionOperativa,
    sumarMovimientosPorMoneda
} = require('../services/finanzas-calculos-service');
const { sanitizarMovimientoManual } = require('../services/movimientoFinanciero-dto');

test('los totales financieros conservan CRC y USD como magnitudes separadas', () => {
    const movimientos = [
        { moneda: 'CRC', monto: 1250000, naturaleza: 'Ingreso' },
        { moneda: 'USD', monto: 850, naturaleza: 'Ingreso' },
        { moneda: 'CRC', monto: 250000, naturaleza: 'Egreso' },
        { moneda: 'USD', monto: 50, naturaleza: 'Egreso' }
    ];

    assert.deepEqual(sumarMovimientosPorMoneda(movimientos), { CRC: 1500000, USD: 900 });
    assert.deepEqual(
        sumarMovimientosPorMoneda(movimientos, (item) => item.naturaleza === 'Ingreso'),
        { CRC: 1250000, USD: 850 }
    );
});

test('el costo final de compra respeta descuento, recargo y costo cero explícito', () => {
    assert.equal(calcularTotalCompraAnimal({
        fechaCompra: new Date(), montoCompra: 80000, pesoCompra: 100, precioCompraPorKg: 1000
    }), 80000);
    assert.equal(calcularTotalCompraAnimal({
        fechaCompra: new Date(), montoCompra: 120000, pesoCompra: 100, precioCompraPorKg: 1000
    }), 120000);
    assert.equal(calcularTotalCompraAnimal({
        fechaCompra: new Date(), montoCompra: 0, pesoCompra: 100, precioCompraPorKg: 1000
    }), 0);
    assert.equal(calcularTotalCompraAnimal({
        fechaCompra: new Date(), pesoCompra: 100, precioCompraPorKg: 1000
    }), 100000);
});

test('la inversión operativa histórica excluye compras modernas y heredadas del hato', () => {
    assert.equal(esMovimientoInversionOperativa({
        naturaleza: 'Egreso', tipoMovimiento: 'Inversion', categoria: 'Infraestructura'
    }), true);
    assert.equal(esMovimientoInversionOperativa({
        naturaleza: 'Egreso', tipoMovimiento: 'Inversion', categoria: 'Ganado'
    }), false);
    assert.equal(esMovimientoInversionOperativa({
        naturaleza: 'Egreso', tipoMovimiento: 'Compra de animales', categoria: 'Ganado'
    }), false);
    assert.equal(esMovimientoInversionOperativa({
        naturaleza: 'Egreso', tipoMovimiento: 'Inversion', categoria: 'Infraestructura', referenciaModelo: 'CompraAnimal'
    }), false);
});

test('el prorrateo monetario conserva exactamente el total hasta el último centavo', () => {
    const partes = distribuirMontoEquitativo(100, 3);
    assert.deepEqual(partes, [33.34, 33.33, 33.33]);
    assert.equal(partes.reduce((total, parte) => total + parte, 0), 100);
});

test('economía de camadas conserva costos directos e indirectos por moneda', () => {
    const { asignaciones, resumenMonedas } = asignarEconomiaPorCamada({
        camadaIds: ['camada-a', 'camada-b', 'camada-c'],
        movimientos: [
            { referenciaId: 'camada-a', moneda: 'CRC', naturaleza: 'Egreso', monto: 100 },
            { moneda: 'CRC', naturaleza: 'Egreso', monto: 50 },
            { referenciaId: 'camada-b', moneda: 'USD', naturaleza: 'Ingreso', monto: 30 },
            { moneda: 'USD', naturaleza: 'Egreso', monto: 10 }
        ]
    });

    assert.equal(asignaciones['camada-a'].monedas.CRC.egresosDirectos, 100);
    assert.equal(asignaciones['camada-b'].monedas.CRC.egresosDirectos, 0);
    assert.equal(resumenMonedas.CRC.egresosPorcinos, 150);
    assert.equal(resumenMonedas.USD.ingresosPorcinos, 30);

    const egresosCrcAsignados = Object.values(asignaciones)
        .reduce((total, asignacion) => total + asignacion.monedas.CRC.costoAsignado, 0);
    const egresosUsdAsignados = Object.values(asignaciones)
        .reduce((total, asignacion) => total + asignacion.monedas.USD.costoAsignado, 0);
    const ingresosUsdAsignados = Object.values(asignaciones)
        .reduce((total, asignacion) => total + asignacion.monedas.USD.ingresoAsignado, 0);

    assert.equal(Number(egresosCrcAsignados.toFixed(2)), 150);
    assert.equal(Number(egresosUsdAsignados.toFixed(2)), 10);
    assert.equal(Number(ingresosUsdAsignados.toFixed(2)), 30);
});

test('planilla e inversión se guardan como egresos estándar sin campos artificiales', () => {
    const planilla = sanitizarMovimientoManual({
        tipoMovimiento: 'Planilla',
        naturaleza: 'Ingreso',
        monto: 50000,
        cantidadPersonas: 4,
        cantidadDias: 2,
        horasTrabajadas: 16
    });
    const inversion = sanitizarMovimientoManual({
        tipoMovimiento: 'Inversion',
        monto: 200000,
        vidaUtilMeses: 120,
        depreciacionMensual: 1666.67,
        valorResidual: 0
    });

    assert.deepEqual(planilla, {
        tipoMovimiento: 'Planilla',
        naturaleza: 'Egreso',
        monto: 50000,
        categoria: 'Mano de Obra / Jornales'
    });
    assert.deepEqual(inversion, {
        tipoMovimiento: 'Inversion',
        monto: 200000,
        naturaleza: 'Egreso',
        categoria: 'Inversiones / Infraestructura'
    });
});
