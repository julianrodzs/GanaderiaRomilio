const Potrero = require('../models/Potrero');
const RotacionPotrero = require('../models/RotacionPotrero');

const MS_DIA = 24 * 60 * 60 * 1000;
const ESTADOS_REALES = ['Activa', 'Finalizada'];

const diaUTC = (valor) => {
    if (!valor) return null;
    if (typeof valor === 'string') {
        const coincidencia = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (coincidencia) return new Date(Date.UTC(Number(coincidencia[1]), Number(coincidencia[2]) - 1, Number(coincidencia[3])));
    }
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return null;
    return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
};

const sumarDias = (valor, cantidad) => new Date(valor.getTime() + cantidad * MS_DIA);
const diasEntre = (inicio, fin) => Math.max(0, Math.round((fin - inicio) / MS_DIA));
const maxFecha = (a, b) => (a > b ? a : b);
const minFecha = (a, b) => (a < b ? a : b);
const redondear = (valor, decimales = 1) => Number(valor.toFixed(decimales));
const fechaTexto = (valor) => (valor ? valor.toISOString().slice(0, 10) : null);

const resolverPeriodo = ({ fechaInicio, fechaFin } = {}) => {
    const hoy = diaUTC(new Date());
    const inicioDefault = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    const finDefault = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0));
    const inicio = fechaInicio ? diaUTC(fechaInicio) : inicioDefault;
    const fin = fechaFin ? diaUTC(fechaFin) : finDefault;

    if (!inicio || !fin) throw new Error('El período contiene una fecha inválida.');
    if (inicio > fin) throw new Error('La fecha inicial no puede ser posterior a la fecha final.');
    if (diasEntre(inicio, fin) > 3660) throw new Error('El período máximo permitido es de 10 años.');

    return { fechaInicio: inicio, fechaFin: fin };
};

const calcularDiasRotacion = (rotacion, periodo, hoy = diaUTC(new Date())) => {
    if (!ESTADOS_REALES.includes(rotacion.estado)) return 0;
    const entrada = diaUTC(rotacion.fechaEntrada);
    if (!entrada) return 0;

    let salida = rotacion.estado === 'Activa' ? hoy : diaUTC(rotacion.fechaSalida);
    if (!salida || salida < entrada) return 0;
    if (salida.getTime() === entrada.getTime()) salida = sumarDias(entrada, 1);

    const inicioPeriodo = diaUTC(periodo.fechaInicio);
    const finPeriodoExclusivo = sumarDias(diaUTC(periodo.fechaFin), 1);
    const inicioTramo = maxFecha(entrada, inicioPeriodo);
    const finTramo = minFecha(salida, finPeriodoExclusivo);
    return Math.max(0, diasEntre(inicioTramo, finTramo));
};

const calcularDescansos = (rotaciones, periodo, hoy = diaUTC(new Date())) => {
    const reales = rotaciones
        .filter((item) => ESTADOS_REALES.includes(item.estado) && diaUTC(item.fechaEntrada))
        .sort((a, b) => diaUTC(a.fechaEntrada) - diaUTC(b.fechaEntrada));
    const descansosHistoricos = [];

    for (let indice = 1; indice < reales.length; indice += 1) {
        const salidaAnterior = diaUTC(reales[indice - 1].fechaSalida);
        const entradaActual = diaUTC(reales[indice].fechaEntrada);
        if (!salidaAnterior || entradaActual < salidaAnterior) continue;
        descansosHistoricos.push({
            fechaSalida: salidaAnterior,
            fechaEntrada: entradaActual,
            dias: diasEntre(salidaAnterior, entradaActual)
        });
    }

    const inicio = diaUTC(periodo.fechaInicio);
    const fin = diaUTC(periodo.fechaFin);
    const descansosPeriodo = descansosHistoricos.filter((item) => item.fechaEntrada >= inicio && item.fechaEntrada <= fin);
    const valores = descansosPeriodo.map((item) => item.dias);
    const ultimoHistorico = descansosHistoricos.at(-1) || null;
    const activa = reales.find((item) => item.estado === 'Activa' && diaUTC(item.fechaEntrada) <= hoy);
    const ultimaSalida = reales
        .filter((item) => item.estado === 'Finalizada' && diaUTC(item.fechaSalida) && diaUTC(item.fechaSalida) <= hoy)
        .sort((a, b) => diaUTC(b.fechaSalida) - diaUTC(a.fechaSalida))[0];

    return {
        descansoPromedio: valores.length ? redondear(valores.reduce((total, valor) => total + valor, 0) / valores.length) : null,
        descansoMinimo: valores.length ? Math.min(...valores) : null,
        descansoMaximo: valores.length ? Math.max(...valores) : null,
        ultimoDescanso: ultimoHistorico?.dias ?? null,
        descansoActual: !activa && ultimaSalida ? diasEntre(diaUTC(ultimaSalida.fechaSalida), hoy) : null
    };
};

const calcularResumen = (potrero, rotaciones, periodo, hoy = diaUTC(new Date())) => {
    const diasDelPeriodo = diasEntre(diaUTC(periodo.fechaInicio), sumarDias(diaUTC(periodo.fechaFin), 1));
    const tramos = rotaciones
        .filter((item) => ESTADOS_REALES.includes(item.estado))
        .map((rotacion) => ({ rotacion, dias: calcularDiasRotacion(rotacion, periodo, hoy) }))
        .filter((item) => item.dias > 0);
    const diasOcupados = tramos.reduce((total, item) => total + item.dias, 0);
    const animalDias = tramos.reduce((total, item) => total + (Number(item.rotacion.numeroAnimales) || 0) * item.dias, 0);
    const area = Number(potrero.area);
    const descansos = calcularDescansos(rotaciones, periodo, hoy);

    return {
        diasOcupados,
        porcentajeOcupacion: diasDelPeriodo ? redondear((diasOcupados / diasDelPeriodo) * 100) : 0,
        numeroRotaciones: tramos.length,
        promedioDiasRotacion: tramos.length ? redondear(diasOcupados / tramos.length) : null,
        animalesPromedio: diasOcupados ? redondear(animalDias / diasOcupados) : null,
        animalDias: redondear(animalDias),
        animalDiasPorHectarea: Number.isFinite(area) && area > 0 ? redondear(animalDias / area) : null,
        ...descansos,
        tramos
    };
};

const calcularRendimientoMensual = (potrero, rotaciones, periodo, hoy = diaUTC(new Date())) => {
    const meses = [];
    let cursor = new Date(Date.UTC(periodo.fechaInicio.getUTCFullYear(), periodo.fechaInicio.getUTCMonth(), 1));
    const ultimoMes = new Date(Date.UTC(periodo.fechaFin.getUTCFullYear(), periodo.fechaFin.getUTCMonth(), 1));

    while (cursor <= ultimoMes) {
        const inicioMes = maxFecha(cursor, periodo.fechaInicio);
        const finMesNatural = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
        const finMes = minFecha(finMesNatural, periodo.fechaFin);
        const resumen = calcularResumen(potrero, rotaciones, { fechaInicio: inicioMes, fechaFin: finMes }, hoy);
        meses.push({
            mes: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
            diasOcupados: resumen.diasOcupados,
            porcentajeOcupacion: resumen.porcentajeOcupacion,
            numeroRotaciones: resumen.numeroRotaciones,
            animalDias: resumen.animalDias,
            animalDiasPorHectarea: resumen.animalDiasPorHectarea,
            descansoPromedio: resumen.descansoPromedio
        });
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return meses;
};

const calcularRendimientoPotrero = (potrero, rotaciones, periodo, opciones = {}) => {
    const hoy = opciones.hoy ? diaUTC(opciones.hoy) : diaUTC(new Date());
    const resumen = calcularResumen(potrero, rotaciones, periodo, hoy);
    const ultima = [...resumen.tramos].sort((a, b) => diaUTC(b.rotacion.fechaEntrada) - diaUTC(a.rotacion.fechaEntrada))[0];
    const area = Number(potrero.area);
    const proyectadas = rotaciones.filter((item) => item.estado === 'Planificada'
        && diaUTC(item.fechaEntrada) <= periodo.fechaFin
        && (!item.fechaSalida || diaUTC(item.fechaSalida) >= periodo.fechaInicio));
    const { tramos, ...rendimiento } = resumen;

    return {
        potrero: { id: potrero._id, codigo: potrero.codigo, nombre: potrero.nombre, area: potrero.area, estado: potrero.estado },
        periodo: { fechaInicio: fechaTexto(periodo.fechaInicio), fechaFin: fechaTexto(periodo.fechaFin) },
        rendimiento,
        ultimaRotacion: ultima ? {
            id: ultima.rotacion._id,
            fechaEntrada: ultima.rotacion.fechaEntrada,
            fechaSalida: ultima.rotacion.fechaSalida,
            estado: ultima.rotacion.estado,
            numeroAnimales: ultima.rotacion.numeroAnimales || 0,
            diasOcupado: ultima.dias,
            animalDias: redondear((Number(ultima.rotacion.numeroAnimales) || 0) * ultima.dias),
            animalDiasPorHectarea: area > 0 ? redondear(((Number(ultima.rotacion.numeroAnimales) || 0) * ultima.dias) / area) : null
        } : null,
        usoProyectado: { numeroRotaciones: proyectadas.length },
        mensual: opciones.incluirMensual === false ? undefined : calcularRendimientoMensual(potrero, rotaciones, periodo, hoy)
    };
};

const obtenerRendimientoPotrero = async (potreroId, filtros = {}) => {
    const periodo = resolverPeriodo(filtros);
    const [potrero, rotaciones] = await Promise.all([
        Potrero.findById(potreroId).lean(),
        RotacionPotrero.find({ potrero: potreroId }).lean()
    ]);
    if (!potrero) return null;
    return calcularRendimientoPotrero(potrero, rotaciones, periodo);
};

const calcularComparativoPotreros = async (filtros = {}) => {
    const periodo = resolverPeriodo(filtros);
    const [potreros, rotaciones] = await Promise.all([
        Potrero.find().sort({ codigo: 1 }).lean(),
        RotacionPotrero.find().lean()
    ]);
    const porPotrero = rotaciones.reduce((grupos, rotacion) => {
        const clave = String(rotacion.potrero);
        if (!grupos[clave]) grupos[clave] = [];
        grupos[clave].push(rotacion);
        return grupos;
    }, {});

    return {
        periodo: { fechaInicio: fechaTexto(periodo.fechaInicio), fechaFin: fechaTexto(periodo.fechaFin) },
        potreros: potreros.map((potrero) => {
            const calculado = calcularRendimientoPotrero(potrero, porPotrero[String(potrero._id)] || [], periodo, { incluirMensual: false });
            return { ...calculado.potrero, ...calculado.rendimiento, usoProyectado: calculado.usoProyectado.numeroRotaciones };
        })
    };
};

module.exports = {
    calcularAnimalDias: (numeroAnimales, dias) => (Number(numeroAnimales) || 0) * (Number(dias) || 0),
    calcularAnimalDiasPorHectarea: (animalDias, area) => (Number(area) > 0 ? redondear(Number(animalDias) / Number(area)) : null),
    calcularComparativoPotreros,
    calcularDescansos,
    calcularDiasRotacion,
    calcularRendimientoMensual,
    calcularRendimientoPotrero,
    obtenerRendimientoPotrero,
    resolverPeriodo
};
