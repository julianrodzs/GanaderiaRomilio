const Animal = require('../models/Animal');
const HistorialFincaAnimal = require('../models/HistorialFincaAnimal');
const Pesaje = require('../models/Pesaje');

const DIA_MS = 24 * 60 * 60 * 1000;
const idTexto = (valor) => String(valor?._id || valor || '');
const fechaValida = (valor) => {
    if (!valor) return null;
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const fechaIngresoAnimal = (animal = {}) => fechaValida(animal.fechaCompra)
    || fechaValida(animal.fechaNacimiento)
    || fechaValida(animal.createdAt);

const fechaSalidaAnimal = (animal = {}) => {
    const candidatas = [animal.fechaVenta, animal.fechaMuerte, animal.fechaDescarte]
        .map(fechaValida)
        .filter(Boolean)
        .sort((a, b) => a - b);
    return candidatas[0] || null;
};

const agruparHistorias = (historias = []) => historias.reduce((mapa, historia) => {
    const clave = idTexto(historia.animal);
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(historia);
    mapa.get(clave).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    return mapa;
}, new Map());

const fincaAnimalAFecha = (animal, historias = [], fechaReferencia) => {
    const fecha = fechaValida(fechaReferencia);
    if (!fecha) return '';
    const vigentes = historias.filter((item) => fechaValida(item.fecha) <= fecha);
    return idTexto(vigentes.at(-1)?.fincaDestino || animal.fincaId);
};

const animalPresenteAFecha = ({ animal, historias = [], fincaId, fecha }) => {
    const corte = fechaValida(fecha);
    const ingreso = fechaIngresoAnimal(animal);
    const salida = fechaSalidaAnimal(animal);
    if (!corte || !ingreso || ingreso > corte || (salida && salida <= corte)) return false;
    return !fincaId || fincaAnimalAFecha(animal, historias, corte) === idTexto(fincaId);
};

const crearIntervalosFinca = ({ animal, historias = [], fincaId }) => {
    const ingreso = fechaIngresoAnimal(animal);
    const salida = fechaSalidaAnimal(animal) || new Date(8640000000000000);
    if (!ingreso || ingreso >= salida) return [];
    const cambios = historias
        .map((item) => ({ fecha: fechaValida(item.fecha), destino: idTexto(item.fincaDestino) }))
        .filter((item) => item.fecha && item.fecha < salida)
        .sort((a, b) => a.fecha - b.fecha);
    let fincaActual = cambios.length
        ? idTexto(cambios[0].fecha > ingreso ? historias.find((item) => fechaValida(item.fecha)?.getTime() === cambios[0].fecha.getTime())?.fincaOrigen : cambios[0].destino)
        : idTexto(animal.fincaId);
    if (!fincaActual) fincaActual = idTexto(animal.fincaId);
    let cursor = ingreso;
    const intervalos = [];
    cambios.forEach((cambio) => {
        if (cambio.fecha <= ingreso) {
            fincaActual = cambio.destino;
            return;
        }
        if (fincaActual === idTexto(fincaId) && cursor < cambio.fecha) intervalos.push({ inicio: cursor, finExclusivo: cambio.fecha });
        cursor = cambio.fecha;
        fincaActual = cambio.destino;
    });
    if (fincaActual === idTexto(fincaId) && cursor < salida) intervalos.push({ inicio: cursor, finExclusivo: salida });
    return intervalos;
};

const construirPoblacionAFecha = ({ animales = [], historias = [], fincaId, fecha }) => {
    const porAnimal = agruparHistorias(historias);
    return animales.filter((animal) => animalPresenteAFecha({
        animal,
        historias: porAnimal.get(idTexto(animal)) || [],
        fincaId,
        fecha
    }));
};

const calcularAnimalesDia = ({ animales = [], historias = [], fincaId, fechaInicio, fechaFin }) => {
    const inicio = fechaValida(fechaInicio);
    const fin = fechaValida(fechaFin);
    if (!inicio || !fin || inicio > fin) throw new Error('El período para calcular animales-día no es válido.');
    const finExclusivo = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), fin.getUTCDate() + 1));
    const porAnimal = agruparHistorias(historias);
    let animalesDia = 0;
    const animalesConPresencia = new Set();
    animales.forEach((animal) => {
        crearIntervalosFinca({ animal, historias: porAnimal.get(idTexto(animal)) || [], fincaId }).forEach((intervalo) => {
            const desde = new Date(Math.max(inicio.getTime(), intervalo.inicio.getTime()));
            const hasta = new Date(Math.min(finExclusivo.getTime(), intervalo.finExclusivo.getTime()));
            if (desde >= hasta) return;
            animalesDia += (hasta - desde) / DIA_MS;
            animalesConPresencia.add(idTexto(animal));
        });
    });
    const diasPeriodo = Math.max(1, Math.round((finExclusivo - inicio) / DIA_MS));
    return {
        animalesDia,
        diasPeriodo,
        promedio: animalesDia / diasPeriodo,
        totalUnicos: animalesConPresencia.size
    };
};

const consultarBaseHistorica = async ({ organizacionId, especie, filtros = {} } = {}) => {
    const filtro = { ...filtros };
    if (organizacionId) filtro.organizacionId = organizacionId;
    if (especie === 'Porcino') filtro.especie = 'Porcino';
    if (especie === 'Bovino') filtro.$or = [{ especie: 'Bovino' }, { especie: { $exists: false } }];
    const animales = await Animal.find(filtro).setOptions({ omitirAislamientoFinca: true }).lean();
    const historias = animales.length
        ? await HistorialFincaAnimal.find({ animal: { $in: animales.map((animal) => animal._id) } })
            .setOptions({ omitirAislamientoFinca: true }).sort({ fecha: 1 }).lean()
        : [];
    return { animales, historias };
};

const obtenerPoblacionAFecha = async (opciones) => {
    const poblaciones = await obtenerPoblacionHistoricaPorFincas({
        ...opciones,
        fincaIds: [opciones.fincaId]
    });
    return poblaciones.get(idTexto(opciones.fincaId)) || [];
};

const obtenerPoblacionHistoricaPorFincas = async ({ organizacionId, fincaIds = [], especie, fecha }) => {
    const ids = [...new Set(fincaIds.map(idTexto).filter(Boolean))];
    const resultado = new Map(ids.map((id) => [id, []]));
    if (!ids.length) return resultado;

    const base = await consultarBaseHistorica({ organizacionId, especie });
    const porAnimal = agruparHistorias(base.historias);
    const corte = fechaValida(fecha);
    const presentes = base.animales.filter((animal) => animalPresenteAFecha({
        animal,
        historias: porAnimal.get(idTexto(animal)) || [],
        fecha: corte
    }));
    const pesajes = presentes.length && corte
        ? await Pesaje.find({ animal: { $in: presentes.map((animal) => animal._id) }, fecha: { $lte: corte } })
            .setOptions({ omitirAislamientoFinca: true })
            .sort({ fecha: -1, createdAt: -1 })
            .select('animal fecha peso')
            .lean()
        : [];
    const pesoPorAnimal = new Map();
    pesajes.forEach((pesaje) => {
        const id = idTexto(pesaje.animal);
        if (!pesoPorAnimal.has(id)) pesoPorAnimal.set(id, pesaje);
    });

    presentes.forEach((animal) => {
        const fincaId = fincaAnimalAFecha(animal, porAnimal.get(idTexto(animal)) || [], corte);
        if (!resultado.has(fincaId)) return;
        const pesaje = pesoPorAnimal.get(idTexto(animal));
        resultado.get(fincaId).push({
            ...animal,
            pesoAlCorte: pesaje?.peso ?? null,
            fechaPesoAlCorte: pesaje?.fecha ?? null
        });
    });
    return resultado;
};

const obtenerAnimalesDiaPeriodo = async (opciones) => {
    const base = await consultarBaseHistorica(opciones);
    return calcularAnimalesDia({
        ...base,
        fincaId: opciones.fincaId,
        fechaInicio: opciones.fechaInicio,
        fechaFin: opciones.fechaFin
    });
};

const CAMPOS_HECHO_PERMITIDOS = new Set(['fechaNacimiento', 'fechaCompra', 'fechaVenta', 'fechaMuerte', 'fechaDestete']);
const obtenerAnimalesConHechoPeriodo = async ({ campo, fechaInicio, fechaFin, fincaId, ...opciones }) => {
    if (!CAMPOS_HECHO_PERMITIDOS.has(campo)) throw new Error('El campo histórico solicitado no está permitido.');
    const inicio = fechaValida(fechaInicio);
    const fin = fechaValida(fechaFin);
    if (!inicio || !fin || inicio > fin) throw new Error('El período histórico no es válido.');
    const base = await consultarBaseHistorica({
        ...opciones,
        filtros: { ...(opciones.filtros || {}), [campo]: { $gte: inicio, $lte: fin } }
    });
    const porAnimal = agruparHistorias(base.historias);
    return base.animales.filter((animal) => animalPresenteAFecha({
        animal,
        historias: porAnimal.get(idTexto(animal)) || [],
        fincaId,
        fecha: campo === 'fechaVenta' || campo === 'fechaMuerte'
            ? new Date(new Date(animal[campo]).getTime() - 1)
            : animal[campo]
    }));
};

module.exports = {
    animalPresenteAFecha,
    calcularAnimalesDia,
    construirPoblacionAFecha,
    fechaIngresoAnimal,
    fechaSalidaAnimal,
    fincaAnimalAFecha,
    obtenerAnimalesDiaPeriodo,
    obtenerAnimalesConHechoPeriodo,
    obtenerPoblacionHistoricaPorFincas,
    obtenerPoblacionAFecha
};
