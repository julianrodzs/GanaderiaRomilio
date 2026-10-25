const MONEDAS_FINANCIERAS = Object.freeze(['CRC', 'USD']);

const normalizarMoneda = (moneda) => (MONEDAS_FINANCIERAS.includes(moneda) ? moneda : 'CRC');

const crearMapaMonedas = (crearValor = () => 0) => Object.fromEntries(
    MONEDAS_FINANCIERAS.map((moneda) => [moneda, crearValor(moneda)])
);

const sumarMovimientosPorMoneda = (movimientos = [], predicado = () => true) => {
    const totales = crearMapaMonedas();
    movimientos.filter(predicado).forEach((movimiento) => {
        const moneda = normalizarMoneda(movimiento.moneda);
        totales[moneda] += Number(movimiento.monto || 0);
    });
    return totales;
};

const construirContratoSustentabilidad = ({ gastos = {}, ventas = {}, compras = {}, animalesPromedio = 0, movimientosPeriodo = 0 } = {}) => ({
    movimientosPeriodo: Number(movimientosPeriodo || 0),
    monedas: crearMapaMonedas((moneda) => ({
        montoVentasAnimales: redondearMoneda(ventas[moneda]),
        montoComprasAnimales: redondearMoneda(compras[moneda]),
        gastosOperativosPeriodo: redondearMoneda(gastos[moneda]),
        costoPorAnimalPeriodo: animalesPromedio > 0 ? redondearMoneda(gastos[moneda] / animalesPromedio) : 0,
        balancePeriodo: redondearMoneda(numeroSeguro(ventas[moneda]) - numeroSeguro(compras[moneda]) - numeroSeguro(gastos[moneda]))
    }))
});

function numeroSeguro(valor) {
    return Number(valor || 0);
}

const tieneNumero = (valor) => valor !== null
    && valor !== undefined
    && valor !== ''
    && Number.isFinite(Number(valor));

const calcularTotalCompraAnimal = (animal = {}) => {
    if (!animal.fechaCompra) return 0;
    if (tieneNumero(animal.montoCompra)) return Number(animal.montoCompra);
    if (tieneNumero(animal.pesoCompra) && tieneNumero(animal.precioCompraPorKg)) {
        return Number(animal.pesoCompra) * Number(animal.precioCompraPorKg);
    }
    return 0;
};

const CATEGORIAS_INVERSION_OPERATIVA = new Set([
    'Infraestructura',
    'Maquinaria',
    'Inversiones / Infraestructura'
]);
const CATEGORIAS_COMPRA_HATO = new Set(['Ganado', 'Compra de animales', 'Compras de animales']);

const esMovimientoInversionOperativa = (movimiento = {}) => movimiento.naturaleza === 'Egreso'
    && movimiento.tipoMovimiento !== 'Compra de animales'
    && movimiento.referenciaModelo !== 'CompraAnimal'
    && !CATEGORIAS_COMPRA_HATO.has(movimiento.categoria)
    && (movimiento.tipoMovimiento === 'Inversion' || CATEGORIAS_INVERSION_OPERATIVA.has(movimiento.categoria));

const distribuirMontoEquitativo = (total, cantidad, decimales = 2) => {
    if (!Number.isInteger(cantidad) || cantidad <= 0) return [];
    const factor = 10 ** decimales;
    const unidades = Math.round(Number(total || 0) * factor);
    const signo = unidades < 0 ? -1 : 1;
    const absolutas = Math.abs(unidades);
    const base = Math.floor(absolutas / cantidad);
    const residuo = absolutas % cantidad;

    return Array.from({ length: cantidad }, (_, indice) => (
        signo * (base + (indice < residuo ? 1 : 0)) / factor
    ));
};

const idTexto = (valor) => String(valor?._id || valor || '');
const redondearMoneda = (valor) => Number(Number(valor || 0).toFixed(2));

const asignarEconomiaPorCamada = ({ camadaIds = [], movimientos = [] } = {}) => {
    const ids = camadaIds.map(idTexto);
    const idsValidos = new Set(ids);
    const directosPorCamada = new Map(ids.map((id) => [id, []]));
    const indirectos = [];
    const directosFueraCohorte = [];

    movimientos.forEach((movimiento) => {
        const referencia = idTexto(movimiento.referenciaId);
        if (idsValidos.has(referencia)) directosPorCamada.get(referencia).push(movimiento);
        else if (movimiento.referenciaModelo === 'Camada') directosFueraCohorte.push(movimiento);
        else indirectos.push(movimiento);
    });

    const resumenMonedas = crearMapaMonedas((moneda) => {
        const porMoneda = movimientos.filter((item) => normalizarMoneda(item.moneda) === moneda && !directosFueraCohorte.includes(item));
        const indirectosMoneda = indirectos.filter((item) => normalizarMoneda(item.moneda) === moneda);
        const fueraCohorte = directosFueraCohorte.filter((item) => normalizarMoneda(item.moneda) === moneda);
        const ingresos = porMoneda.filter((item) => item.naturaleza === 'Ingreso').reduce((total, item) => total + Number(item.monto || 0), 0);
        const egresos = porMoneda.filter((item) => item.naturaleza === 'Egreso').reduce((total, item) => total + Number(item.monto || 0), 0);
        const ingresosIndirectos = indirectosMoneda.filter((item) => item.naturaleza === 'Ingreso').reduce((total, item) => total + Number(item.monto || 0), 0);
        const egresosIndirectos = indirectosMoneda.filter((item) => item.naturaleza === 'Egreso').reduce((total, item) => total + Number(item.monto || 0), 0);
        return {
            ingresosPorcinos: redondearMoneda(ingresos),
            egresosPorcinos: redondearMoneda(egresos),
            balancePorcino: redondearMoneda(ingresos - egresos),
            ingresosDirectos: redondearMoneda(ingresos - ingresosIndirectos),
            egresosDirectos: redondearMoneda(egresos - egresosIndirectos),
            ingresosIndirectos: redondearMoneda(ingresosIndirectos),
            egresosIndirectos: redondearMoneda(egresosIndirectos),
            ingresosDirectosFueraCohorte: redondearMoneda(fueraCohorte.filter((item) => item.naturaleza === 'Ingreso').reduce((total, item) => total + Number(item.monto || 0), 0)),
            egresosDirectosFueraCohorte: redondearMoneda(fueraCohorte.filter((item) => item.naturaleza === 'Egreso').reduce((total, item) => total + Number(item.monto || 0), 0))
        };
    });

    const distribuciones = crearMapaMonedas((moneda) => ({
        ingresos: distribuirMontoEquitativo(resumenMonedas[moneda].ingresosIndirectos, ids.length),
        egresos: distribuirMontoEquitativo(resumenMonedas[moneda].egresosIndirectos, ids.length)
    }));
    const asignaciones = Object.fromEntries(ids.map((id, indice) => {
        const directos = directosPorCamada.get(id) || [];
        const monedas = crearMapaMonedas((moneda) => {
            const ingresosDirectos = directos
                .filter((item) => normalizarMoneda(item.moneda) === moneda && item.naturaleza === 'Ingreso')
                .reduce((total, item) => total + Number(item.monto || 0), 0);
            const egresosDirectos = directos
                .filter((item) => normalizarMoneda(item.moneda) === moneda && item.naturaleza === 'Egreso')
                .reduce((total, item) => total + Number(item.monto || 0), 0);
            const ingresoIndirectoAsignado = distribuciones[moneda].ingresos[indice] || 0;
            const egresoIndirectoAsignado = distribuciones[moneda].egresos[indice] || 0;
            return {
                ingresosDirectos: redondearMoneda(ingresosDirectos),
                egresosDirectos: redondearMoneda(egresosDirectos),
                ingresoIndirectoAsignado: redondearMoneda(ingresoIndirectoAsignado),
                egresoIndirectoAsignado: redondearMoneda(egresoIndirectoAsignado),
                ingresoAsignado: redondearMoneda(ingresosDirectos + ingresoIndirectoAsignado),
                costoAsignado: redondearMoneda(egresosDirectos + egresoIndirectoAsignado)
            };
        });
        return [id, { monedas, movimientosDirectos: directos.length }];
    }));

    return {
        asignaciones,
        resumenMonedas,
        cobertura: {
            camadasIncluidas: ids.length,
            movimientosDirectosIncluidos: [...directosPorCamada.values()].reduce((total, items) => total + items.length, 0),
            movimientosIndirectosDistribuidos: indirectos.length,
            movimientosDirectosFueraCohorte: directosFueraCohorte.length,
            criterioIndirectos: 'Movimientos porcinos del período sin referencia directa a otra entidad o camada.'
        }
    };
};

module.exports = {
    MONEDAS_FINANCIERAS,
    asignarEconomiaPorCamada,
    calcularTotalCompraAnimal,
    construirContratoSustentabilidad,
    crearMapaMonedas,
    distribuirMontoEquitativo,
    esMovimientoInversionOperativa,
    normalizarMoneda,
    sumarMovimientosPorMoneda
};
