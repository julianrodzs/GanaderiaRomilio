const CorteForraje = require('../models/CorteForraje');

const MS_DIA = 86400000;
const redondear = (valor, decimales = 2) => Number.isFinite(valor) ? Number(valor.toFixed(decimales)) : null;
const idDe = (valor) => String(valor?._id || valor || 'SIN_DEFINIR');
const kgHaCorte = (corte) => corte.areaCortadaHa > 0
    ? corte.cantidadForrajeVerdeKg / corte.areaCortadaHa
    : null;

const estadisticaIntervalos = (cortes) => {
    const intervalos = [];
    const porBanco = new Map();
    cortes.forEach((corte) => {
        const clave = idDe(corte.potrero);
        if (!porBanco.has(clave)) porBanco.set(clave, []);
        porBanco.get(clave).push(corte);
    });
    porBanco.forEach((elementos) => {
        const fechas = elementos.sort((a, b) => new Date(a.fechaCorte) - new Date(b.fechaCorte));
        for (let indice = 1; indice < fechas.length; indice += 1) {
            intervalos.push((new Date(fechas[indice].fechaCorte) - new Date(fechas[indice - 1].fechaCorte)) / MS_DIA);
        }
    });
    if (!intervalos.length) return { promedio: null, minimo: null, maximo: null };
    return {
        promedio: redondear(intervalos.reduce((suma, valor) => suma + valor, 0) / intervalos.length, 1),
        minimo: Math.min(...intervalos),
        maximo: Math.max(...intervalos)
    };
};

const construirSerieIntervalos = (cortes) => {
    const porBanco = new Map();
    cortes.forEach((corte) => {
        const clave = idDe(corte.potrero);
        if (!porBanco.has(clave)) porBanco.set(clave, []);
        porBanco.get(clave).push(corte);
    });
    const serie = [];
    porBanco.forEach((elementos) => {
        const ordenados = elementos.sort((a, b) => new Date(a.fechaCorte) - new Date(b.fechaCorte));
        for (let indice = 1; indice < ordenados.length; indice += 1) {
            serie.push({
                bancoId: idDe(ordenados[indice].potrero),
                banco: ordenados[indice].potrero?.nombre || 'Sin definir',
                fecha: ordenados[indice].fechaCorte,
                dias: Math.round((new Date(ordenados[indice].fechaCorte) - new Date(ordenados[indice - 1].fechaCorte)) / MS_DIA)
            });
        }
    });
    return serie.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
};

const resumirGrupo = (cortes, { clave, nombre }) => {
    const bancos = new Map();
    cortes.forEach((corte) => {
        if (corte.potrero) bancos.set(idDe(corte.potrero), Number(corte.potrero.area) || 0);
    });
    const rendimientos = cortes.map(kgHaCorte).filter(Number.isFinite);
    const cantidadForrajeVerdeKg = cortes.reduce((suma, item) => suma + (item.cantidadForrajeVerdeKg || 0), 0);
    const cortesConMateriaSeca = cortes.filter((item) => item.cantidadMateriaSecaKg != null);
    const areaTotalHa = [...bancos.values()].reduce((suma, valor) => suma + valor, 0);
    const intervalos = estadisticaIntervalos(cortes);
    const objetivos = [...new Set(cortes.map((item) => item.potrero?.intervaloCorteObjetivoDias).filter((item) => Number(item) > 0))];
    const objetivo = objetivos.length === 1 ? objetivos[0] : null;
    return {
        clave,
        nombre,
        bancos: bancos.size,
        areaTotalHa: redondear(areaTotalHa),
        cortes: cortes.length,
        cantidadForrajeVerdeKg: redondear(cantidadForrajeVerdeKg),
        cantidadMateriaSecaKg: cortesConMateriaSeca.length
            ? redondear(cortesConMateriaSeca.reduce((suma, item) => suma + item.cantidadMateriaSecaKg, 0))
            : null,
        produccionPeriodoKgHa: areaTotalHa > 0 ? redondear(cantidadForrajeVerdeKg / areaTotalHa) : null,
        promedioKgHaCorte: rendimientos.length
            ? redondear(rendimientos.reduce((suma, valor) => suma + valor, 0) / rendimientos.length)
            : null,
        diasPromedioEntreCortes: intervalos.promedio,
        diasMinimoEntreCortes: intervalos.minimo,
        diasMaximoEntreCortes: intervalos.maximo,
        intervaloCorteObjetivoDias: objetivo,
        diferenciaIntervaloDias: objetivo != null && intervalos.promedio != null
            ? redondear(intervalos.promedio - objetivo, 1)
            : null
    };
};

const agrupar = (cortes, claveFn, nombreFn) => {
    const grupos = new Map();
    cortes.forEach((corte) => {
        const clave = String(claveFn(corte) || 'SIN_DEFINIR');
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(corte);
    });
    return [...grupos.entries()]
        .map(([clave, elementos]) => resumirGrupo(elementos, { clave, nombre: nombreFn(elementos[0]) || 'Sin definir' }))
        .sort((a, b) => b.cantidadForrajeVerdeKg - a.cantidadForrajeVerdeKg);
};

const resumirRendimientoForrajes = (cortes) => {
    const general = resumirGrupo(cortes, { clave: 'TOTAL', nombre: 'Total' });
    return {
        descripcion: 'Rendimiento observado en esta finca. Los resultados pueden variar por suelo, clima, fertilización, edad de corte y manejo.',
        resumen: {
            totalBancos: general.bancos,
            areaTotalHa: general.areaTotalHa,
            totalCortes: general.cortes,
            forrajeVerdeTotalKg: general.cantidadForrajeVerdeKg,
            materiaSecaTotalKg: general.cantidadMateriaSecaKg,
            produccionForrajeVerdeKgHa: general.produccionPeriodoKgHa,
            promedioKgHaCorte: general.promedioKgHaCorte,
            diasPromedioEntreCortes: general.diasPromedioEntreCortes,
            diasMinimoEntreCortes: general.diasMinimoEntreCortes,
            diasMaximoEntreCortes: general.diasMaximoEntreCortes
        },
        produccionPorForraje: agrupar(cortes, (item) => idDe(item.forraje), (item) => item.forrajeNombre),
        produccionPorBanco: agrupar(cortes, (item) => idDe(item.potrero), (item) => item.potrero?.nombre),
        produccionPorMes: agrupar(cortes, (item) => new Date(item.fechaCorte).toISOString().slice(0, 7), (item) => new Date(item.fechaCorte).toISOString().slice(0, 7)),
        destinos: agrupar(cortes, (item) => item.destino?.tipo, (item) => item.destino?.tipo?.replaceAll('_', ' ')),
        intervalos: construirSerieIntervalos(cortes)
    };
};

const obtenerRendimientoForrajes = async (filtros = {}) => {
    const consulta = {};
    if (filtros.areaId) consulta.potrero = filtros.areaId;
    if (filtros.forrajeId) consulta.forraje = filtros.forrajeId;
    if (filtros.fechaInicio || filtros.fechaFin) {
        consulta.fechaCorte = {};
        if (filtros.fechaInicio) consulta.fechaCorte.$gte = new Date(`${filtros.fechaInicio}T00:00:00.000Z`);
        if (filtros.fechaFin) consulta.fechaCorte.$lte = new Date(`${filtros.fechaFin}T23:59:59.999Z`);
    }
    const cortes = await CorteForraje.find(consulta)
        .populate('potrero', 'codigo nombre area intervaloCorteObjetivoDias')
        .populate('forraje')
        .lean();
    return resumirRendimientoForrajes(cortes);
};

module.exports = {
    agrupar,
    construirSerieIntervalos,
    estadisticaIntervalos,
    kgHaCorte,
    obtenerRendimientoForrajes,
    resumirGrupo,
    resumirRendimientoForrajes
};
