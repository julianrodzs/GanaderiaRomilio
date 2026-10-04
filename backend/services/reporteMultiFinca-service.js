const { Types } = require('mongoose');
const Animal = require('../models/Animal');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const MetaConsolidacion = require('../models/MetaConsolidacion');
const TrasladoFinca = require('../models/TrasladoFinca');
const HistorialFincaAnimal = require('../models/HistorialFincaAnimal');

const periodoReporte = ({ fechaInicio, fechaFin } = {}) => {
    const hoy = new Date();
    const inicio = fechaInicio ? new Date(fechaInicio) : new Date(Date.UTC(hoy.getUTCFullYear(), 0, 1));
    const fin = fechaFin ? new Date(fechaFin) : hoy;
    inicio.setUTCHours(0, 0, 0, 0);
    fin.setUTCHours(23, 59, 59, 999);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || inicio > fin) {
        const error = new Error('El período del reporte multi-finca no es válido.');
        error.status = 400;
        throw error;
    }
    return { inicio, fin };
};

const filtroEspecie = (especie) => {
    if (especie === 'Porcino') return { especie: 'Porcino' };
    if (especie === 'Bovino') return { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] };
    return {};
};

const porFinca = (items = []) => new Map(items.map((item) => [String(item._id), item]));
const numero = (valor) => Number(valor || 0);
const resolverFincaHistorica = ({ fincaId }, historias = [], fechaReferencia) => {
    const fecha = new Date(fechaReferencia);
    const vigentes = historias.filter((item) => new Date(item.fecha) <= fecha);
    return String(vigentes.at(-1)?.fincaDestino || fincaId || '');
};
const obtenerDestetesConFincaHistorica = async ({ inicio, fin, especie }) => {
    const animales = await Animal.find({
        ...filtroEspecie(especie),
        fechaDestete: { $gte: inicio, $lte: fin }
    })
        .setOptions({ omitirAislamientoFinca: true })
        .select('_id fincaId fechaDestete pesoDestete')
        .lean();
    const historias = animales.length
        ? await HistorialFincaAnimal.find({ animal: { $in: animales.map((animal) => animal._id) } }).sort({ fecha: 1 }).lean()
        : [];
    const porAnimal = historias.reduce((mapa, item) => {
        const clave = String(item.animal);
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push(item);
        return mapa;
    }, new Map());

    return animales.map((animal) => {
        return {
            ...animal,
            fincaHistoricaId: resolverFincaHistorica(
                animal,
                porAnimal.get(String(animal._id)) || [],
                animal.fechaDestete
            )
        };
    });
};

const obtenerDestetesPorFinca = async ({ inicio, fin, especie, ids }) => {
    const animales = await obtenerDestetesConFincaHistorica({ inicio, fin, especie });
    const permitidas = new Set(ids.map(String));
    const grupos = new Map();
    animales.forEach((animal) => {
        const fincaId = animal.fincaHistoricaId;
        if (!permitidas.has(fincaId)) return;
        if (!grupos.has(fincaId)) grupos.set(fincaId, { _id: fincaId, cantidad: 0, conPeso: 0, pesoTotal: 0 });
        const grupo = grupos.get(fincaId);
        grupo.cantidad += 1;
        if (numero(animal.pesoDestete) > 0) {
            grupo.conPeso += 1;
            grupo.pesoTotal += numero(animal.pesoDestete);
        }
    });
    return [...grupos.values()];
};

const obtenerDetalleDestetesPorFinca = async ({ inicio, fin, especie, fincaId }) => {
    const animales = await obtenerDestetesConFincaHistorica({ inicio, fin, especie });
    return animales
        .filter((animal) => animal.fincaHistoricaId === String(fincaId))
        .map(({ fincaHistoricaId, ...animal }) => animal);
};
const normalizarFinanzasPorFinca = (items = []) => {
    const mapa = new Map();
    items.forEach((item) => {
        const agrupadoPorMoneda = item?._id && typeof item._id === 'object' && item._id.fincaId;
        const fincaId = String(agrupadoPorMoneda ? item._id.fincaId : item._id);
        const moneda = agrupadoPorMoneda ? item._id.moneda || 'CRC' : 'CRC';
        if (!mapa.has(fincaId)) mapa.set(fincaId, { _id: fincaId, monedas: {} });
        mapa.get(fincaId).monedas[moneda] = {
            ingresos: numero(item.ingresos),
            egresos: numero(item.egresos),
            transferenciasEntrantes: numero(item.transferenciasEntrantes),
            transferenciasSalientes: numero(item.transferenciasSalientes),
            gastosCompartidos: numero(item.gastosCompartidos)
        };
    });
    mapa.forEach((item) => Object.assign(item, item.monedas.CRC || {}));
    return [...mapa.values()];
};

const construirComparativoMultiFinca = ({
    fincas,
    inventario = [],
    finanzas = [],
    partos = [],
    destetes = [],
    aplicaciones = [],
    tratamientos = [],
    traslados = [],
    evolucionMensual = [],
    metas = []
}) => {
    const mapas = {
        inventario: porFinca(inventario),
        finanzas: porFinca(normalizarFinanzasPorFinca(finanzas)),
        partos: porFinca(partos),
        destetes: porFinca(destetes),
        aplicaciones: porFinca(aplicaciones),
        tratamientos: porFinca(tratamientos)
    };

    const trasladosPorFinca = traslados.reduce((mapa, traslado) => {
        const cantidad = Array.isArray(traslado.animales) ? traslado.animales.length : numero(traslado.cantidad);
        const origen = String(traslado.fincaOrigen || '');
        const destino = String(traslado.fincaDestino || '');
        if (!mapa.has(origen)) mapa.set(origen, { entradas: 0, salidas: 0 });
        if (!mapa.has(destino)) mapa.set(destino, { entradas: 0, salidas: 0 });
        mapa.get(origen).salidas += cantidad;
        mapa.get(destino).entradas += cantidad;
        return mapa;
    }, new Map());

    const detalle = fincas.map((finca) => {
        const id = String(finca._id);
        const inv = mapas.inventario.get(id) || {};
        const fin = mapas.finanzas.get(id) || {};
        const des = mapas.destetes.get(id) || {};
        const movimientosFinca = trasladosPorFinca.get(id) || {};
        return {
            finca: { _id: finca._id, codigo: finca.codigo, nombre: finca.nombre },
            inventario: {
                activos: numero(inv.activos),
                bovinos: numero(inv.bovinos),
                porcinos: numero(inv.porcinos),
                animalesConPeso: numero(inv.animalesConPeso),
                pesoTotal: numero(inv.pesoTotal),
                pesoPromedio: numero(inv.animalesConPeso) ? numero(inv.pesoTotal) / numero(inv.animalesConPeso) : null
            },
            finanzas: {
                ingresos: numero(fin.ingresos),
                egresos: numero(fin.egresos),
                balance: numero(fin.ingresos) - numero(fin.egresos),
                transferenciasEntrantes: numero(fin.transferenciasEntrantes),
                transferenciasSalientes: numero(fin.transferenciasSalientes),
                transferenciaInternaNeta: numero(fin.transferenciasEntrantes) - numero(fin.transferenciasSalientes),
                gastosCompartidos: numero(fin.gastosCompartidos),
                monedas: fin.monedas || {}
            },
            reproduccion: {
                partos: numero(mapas.partos.get(id)?.cantidad),
                destetes: numero(des.cantidad),
                pesoDestetePromedio: numero(des.conPeso) ? numero(des.pesoTotal) / numero(des.conPeso) : null
            },
            sanidad: {
                aplicaciones: numero(mapas.aplicaciones.get(id)?.cantidad),
                tratamientosActivos: numero(mapas.tratamientos.get(id)?.cantidad)
            },
            traslados: {
                entradas: numero(movimientosFinca.entradas),
                salidas: numero(movimientosFinca.salidas)
            }
        };
    });

    const consolidado = detalle.reduce((total, item) => ({
        fincas: total.fincas + 1,
        animalesActivos: total.animalesActivos + item.inventario.activos,
        bovinos: total.bovinos + item.inventario.bovinos,
        porcinos: total.porcinos + item.inventario.porcinos,
        animalesConPeso: total.animalesConPeso + item.inventario.animalesConPeso,
        pesoTotal: total.pesoTotal + item.inventario.pesoTotal,
        ingresos: total.ingresos + item.finanzas.ingresos,
        egresos: total.egresos + item.finanzas.egresos,
        transferenciasInternas: total.transferenciasInternas + item.finanzas.transferenciasEntrantes,
        gastosCompartidos: total.gastosCompartidos + item.finanzas.gastosCompartidos,
        partos: total.partos + item.reproduccion.partos,
        destetes: total.destetes + item.reproduccion.destetes,
        aplicaciones: total.aplicaciones + item.sanidad.aplicaciones,
        tratamientosActivos: total.tratamientosActivos + item.sanidad.tratamientosActivos,
        traslados: total.traslados + item.traslados.entradas
    }), {
        fincas: 0, animalesActivos: 0, bovinos: 0, porcinos: 0, animalesConPeso: 0, pesoTotal: 0,
        ingresos: 0, egresos: 0, transferenciasInternas: 0, gastosCompartidos: 0,
        partos: 0, destetes: 0, aplicaciones: 0, tratamientosActivos: 0, traslados: 0
    });

    consolidado.pesoPromedio = consolidado.animalesConPeso
        ? consolidado.pesoTotal / consolidado.animalesConPeso
        : null;
    consolidado.balance = consolidado.ingresos - consolidado.egresos;
    consolidado.monedas = detalle.reduce((totales, item) => {
        Object.entries(item.finanzas.monedas || {}).forEach(([moneda, valores]) => {
            if (!totales[moneda]) totales[moneda] = { ingresos: 0, egresos: 0, balance: 0, transferenciasInternas: 0, gastosCompartidos: 0 };
            totales[moneda].ingresos += numero(valores.ingresos);
            totales[moneda].egresos += numero(valores.egresos);
            totales[moneda].transferenciasInternas += numero(valores.transferenciasEntrantes);
            totales[moneda].gastosCompartidos += numero(valores.gastosCompartidos);
            totales[moneda].balance = totales[moneda].ingresos - totales[moneda].egresos;
        });
        return totales;
    }, {});
    delete consolidado.pesoTotal;

    const detalleConParticipacion = detalle.map((item) => ({
        ...item,
        participacion: {
            inventarioPct: consolidado.animalesActivos ? item.inventario.activos * 100 / consolidado.animalesActivos : 0,
            ingresosPct: consolidado.ingresos ? item.finanzas.ingresos * 100 / consolidado.ingresos : 0,
            egresosPct: consolidado.egresos ? item.finanzas.egresos * 100 / consolidado.egresos : 0
        }
    }));

    return { consolidado, fincas: detalleConParticipacion, evolucionMensual, metas };
};

const obtenerReporteMultiFinca = async ({ fincas, fechaInicio, fechaFin, especie = 'Todos' }) => {
    const { inicio, fin } = periodoReporte({ fechaInicio, fechaFin });
    const ids = fincas.map((finca) => new Types.ObjectId(finca._id));
    const matchFinca = { fincaId: { $in: ids } };
    const matchEspecie = filtroEspecie(especie);
    const opciones = { omitirAislamientoFinca: true };

    const [inventario, finanzas, partos, destetes, aplicaciones, tratamientos, traslados, evolucionMensual, metas] = await Promise.all([
        Animal.aggregate([
            { $match: { ...matchFinca, ...matchEspecie, estado: 'Activo' } },
            { $group: {
                _id: '$fincaId',
                activos: { $sum: 1 },
                bovinos: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$especie', 'Bovino'] }, 'Bovino'] }, 1, 0] } },
                porcinos: { $sum: { $cond: [{ $eq: ['$especie', 'Porcino'] }, 1, 0] } },
                animalesConPeso: { $sum: { $cond: [{ $gt: ['$pesoActual', 0] }, 1, 0] } },
                pesoTotal: { $sum: { $cond: [{ $gt: ['$pesoActual', 0] }, '$pesoActual', 0] } }
            } }
        ]).option(opciones),
        MovimientoFinanciero.aggregate([
            { $match: { ...matchFinca, fecha: { $gte: inicio, $lte: fin } } },
            { $group: {
                _id: { fincaId: '$fincaId', moneda: { $ifNull: ['$moneda', 'CRC'] } },
                ingresos: { $sum: { $cond: [{ $and: [{ $eq: ['$naturaleza', 'Ingreso'] }, { $ne: ['$excluirConsolidacion', true] }] }, '$monto', 0] } },
                egresos: { $sum: { $cond: [{ $and: [{ $eq: ['$naturaleza', 'Egreso'] }, { $ne: ['$excluirConsolidacion', true] }] }, '$monto', 0] } },
                transferenciasEntrantes: { $sum: { $cond: [{ $and: [{ $eq: ['$alcanceFinanciero', 'TRANSFERENCIA_INTERNA'] }, { $eq: ['$naturaleza', 'Ingreso'] }] }, '$monto', 0] } },
                transferenciasSalientes: { $sum: { $cond: [{ $and: [{ $eq: ['$alcanceFinanciero', 'TRANSFERENCIA_INTERNA'] }, { $eq: ['$naturaleza', 'Egreso'] }] }, '$monto', 0] } },
                gastosCompartidos: { $sum: { $cond: [{ $eq: ['$alcanceFinanciero', 'GASTO_COMPARTIDO'] }, '$monto', 0] } }
            } }
        ]).option(opciones),
        RegistroReproductivo.aggregate([
            { $match: { ...matchFinca, ...matchEspecie, fechaPartoReal: { $gte: inicio, $lte: fin } } },
            { $group: { _id: '$fincaId', cantidad: { $sum: 1 } } }
        ]).option(opciones),
        obtenerDestetesPorFinca({ inicio, fin, especie, ids }),
        AplicacionSanitaria.aggregate([
            { $match: { ...matchFinca, ...matchEspecie, fechaAplicacion: { $gte: inicio, $lte: fin } } },
            { $group: { _id: '$fincaId', cantidad: { $sum: 1 } } }
        ]).option(opciones),
        TratamientoSanitario.aggregate([
            { $match: { ...matchFinca, ...matchEspecie, estado: 'Activo' } },
            { $group: { _id: '$fincaId', cantidad: { $sum: 1 } } }
        ]).option(opciones),
        TrasladoFinca.find({
            fecha: { $gte: inicio, $lte: fin },
            $or: [{ fincaOrigen: { $in: ids } }, { fincaDestino: { $in: ids } }]
        }).select('fincaOrigen fincaDestino animales').lean(),
        MovimientoFinanciero.aggregate([
            { $match: { ...matchFinca, fecha: { $gte: inicio, $lte: fin }, excluirConsolidacion: { $ne: true } } },
            { $group: {
                _id: { fincaId: '$fincaId', moneda: { $ifNull: ['$moneda', 'CRC'] }, anio: { $year: '$fecha' }, mes: { $month: '$fecha' } },
                ingresos: { $sum: { $cond: [{ $eq: ['$naturaleza', 'Ingreso'] }, '$monto', 0] } },
                egresos: { $sum: { $cond: [{ $eq: ['$naturaleza', 'Egreso'] }, '$monto', 0] } }
            } },
            { $sort: { '_id.anio': 1, '_id.mes': 1 } }
        ]).option(opciones),
        MetaConsolidacion.find({
            fechaInicio: { $lte: fin },
            fechaFin: { $gte: inicio },
            $or: [{ alcance: 'ORGANIZACION' }, { alcance: 'FINCA', finca: { $in: ids } }]
        }).populate('finca', 'codigo nombre').lean()
    ]);

    const evolucion = evolucionMensual.map((item) => ({
        fincaId: item._id.fincaId,
        moneda: item._id.moneda,
        anio: item._id.anio,
        mes: item._id.mes,
        ingresos: numero(item.ingresos),
        egresos: numero(item.egresos),
        balance: numero(item.ingresos) - numero(item.egresos)
    }));

    return {
        filtros: { fechaInicio: inicio, fechaFin: fin, especie },
        ...construirComparativoMultiFinca({
            fincas, inventario, finanzas, partos, destetes, aplicaciones, tratamientos,
            traslados, evolucionMensual: evolucion, metas
        })
    };
};

module.exports = {
    construirComparativoMultiFinca,
    filtroEspecie,
    obtenerDetalleDestetesPorFinca,
    obtenerDestetesPorFinca,
    obtenerReporteMultiFinca,
    periodoReporte,
    resolverFincaHistorica
};
