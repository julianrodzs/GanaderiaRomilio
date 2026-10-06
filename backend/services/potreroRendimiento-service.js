const Potrero = require('../models/Potrero');
const RotacionPotrero = require('../models/RotacionPotrero');
const HistorialCoberturaPotrero = require('../models/HistorialCoberturaPotrero');

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

const obtenerTramoRotacion = (rotacion, periodo, hoy = diaUTC(new Date())) => {
    if (!ESTADOS_REALES.includes(rotacion.estado)) return null;
    const entrada = diaUTC(rotacion.fechaEntrada);
    if (!entrada) return null;

    let salida = rotacion.estado === 'Activa' ? hoy : diaUTC(rotacion.fechaSalida);
    if (!salida || salida < entrada) return null;
    if (salida.getTime() === entrada.getTime()) salida = sumarDias(entrada, 1);

    const inicioPeriodo = diaUTC(periodo.fechaInicio);
    const finPeriodoExclusivo = sumarDias(diaUTC(periodo.fechaFin), 1);
    const inicioTramo = maxFecha(entrada, inicioPeriodo);
    const finTramo = minFecha(salida, finPeriodoExclusivo);
    if (finTramo <= inicioTramo) return null;
    return { fechaInicio: inicioTramo, fechaFinExclusiva: finTramo, dias: diasEntre(inicioTramo, finTramo) };
};

const calcularDiasRotacion = (rotacion, periodo, hoy = diaUTC(new Date())) => obtenerTramoRotacion(rotacion, periodo, hoy)?.dias || 0;

const calcularIntervalosDescanso = (rotaciones) => {
    const reales = rotaciones
        .filter((item) => ESTADOS_REALES.includes(item.estado) && diaUTC(item.fechaEntrada))
        .sort((a, b) => diaUTC(a.fechaEntrada) - diaUTC(b.fechaEntrada));
    const intervalos = [];
    for (let indice = 1; indice < reales.length; indice += 1) {
        const salidaAnterior = diaUTC(reales[indice - 1].fechaSalida);
        const entradaActual = diaUTC(reales[indice].fechaEntrada);
        if (!salidaAnterior || entradaActual < salidaAnterior) continue;
        intervalos.push({ fechaSalida: salidaAnterior, fechaEntrada: entradaActual, dias: diasEntre(salidaAnterior, entradaActual) });
    }
    return intervalos;
};

const calcularDescansos = (rotaciones, periodo, hoy = diaUTC(new Date())) => {
    const reales = rotaciones
        .filter((item) => ESTADOS_REALES.includes(item.estado) && diaUTC(item.fechaEntrada))
        .sort((a, b) => diaUTC(a.fechaEntrada) - diaUTC(b.fechaEntrada));
    const descansosHistoricos = calcularIntervalosDescanso(rotaciones);

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
    const animalesPromedio = diasOcupados ? animalDias / diasOcupados : null;

    return {
        diasOcupados,
        porcentajeOcupacion: diasDelPeriodo ? redondear((diasOcupados / diasDelPeriodo) * 100) : 0,
        numeroRotaciones: tramos.length,
        promedioDiasRotacion: tramos.length ? redondear(diasOcupados / tramos.length) : null,
        animalesPromedio: animalesPromedio !== null ? redondear(animalesPromedio) : null,
        densidadAnimalesPorHectarea: Number.isFinite(area) && area > 0 && animalesPromedio !== null
            ? redondear(animalesPromedio / area)
            : null,
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
            densidadAnimalesPorHectarea: resumen.densidadAnimalesPorHectarea,
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

    const objetivo = Number.isFinite(Number(potrero.diasDescansoObjetivo)) ? Number(potrero.diasDescansoObjetivo) : null;
    const descansoReferencia = rendimiento.descansoActual ?? rendimiento.descansoPromedio;
    return {
        potrero: {
            id: potrero._id,
            codigo: potrero.codigo,
            nombre: potrero.nombre,
            area: potrero.area,
            estado: potrero.estado,
            coberturaActual: potrero.pastoPrincipal || null,
            pastosSecundarios: potrero.pastosSecundarios || [],
            leguminosasAsociadas: potrero.leguminosasAsociadas || [],
            diasDescansoObjetivo: objetivo,
            observacionCobertura: potrero.observacionCobertura || null,
            descripcionCobertura: potrero.descripcionCobertura || null
        },
        periodo: { fechaInicio: fechaTexto(periodo.fechaInicio), fechaFin: fechaTexto(periodo.fechaFin) },
        rendimiento: {
            ...rendimiento,
            descansoObjetivo: objetivo,
            diferenciaDescansoObjetivo: objetivo !== null && descansoReferencia !== null ? redondear(descansoReferencia - objetivo) : null,
            diasParaObjetivo: objetivo !== null && descansoReferencia !== null ? Math.max(0, redondear(objetivo - descansoReferencia)) : null
        },
        ultimaRotacion: ultima ? {
            id: ultima.rotacion._id,
            fechaEntrada: ultima.rotacion.fechaEntrada,
            fechaSalida: ultima.rotacion.fechaSalida,
            estado: ultima.rotacion.estado,
            numeroAnimales: ultima.rotacion.numeroAnimales || 0,
            diasOcupado: ultima.dias,
            animalDias: redondear((Number(ultima.rotacion.numeroAnimales) || 0) * ultima.dias),
            animalDiasPorHectarea: area > 0 ? redondear(((Number(ultima.rotacion.numeroAnimales) || 0) * ultima.dias) / area) : null,
            densidadAnimalesPorHectarea: area > 0 ? redondear((Number(ultima.rotacion.numeroAnimales) || 0) / area) : null
        } : null,
        usoProyectado: { numeroRotaciones: proyectadas.length },
        mensual: opciones.incluirMensual === false ? undefined : calcularRendimientoMensual(potrero, rotaciones, periodo, hoy)
    };
};

const obtenerRendimientoPotrero = async (potreroId, filtros = {}) => {
    const periodo = resolverPeriodo(filtros);
    const [potrero, rotaciones] = await Promise.all([
        Potrero.findById(potreroId).populate('pastoPrincipal').populate('pastosSecundarios').populate('leguminosasAsociadas').lean(),
        RotacionPotrero.find({ potrero: potreroId }).lean()
    ]);
    if (!potrero) return null;
    return calcularRendimientoPotrero(potrero, rotaciones, periodo);
};

const calcularComparativoPotreros = async (filtros = {}) => {
    const periodo = resolverPeriodo(filtros);
    const [potreros, rotaciones] = await Promise.all([
        Potrero.find().populate('pastoPrincipal').populate('pastosSecundarios').populate('leguminosasAsociadas').sort({ codigo: 1 }).lean(),
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

const obtenerId = (valor) => String(valor?._id || valor || '');
const obtenerNombreCobertura = (cobertura) => cobertura?.pastoPrincipal?.nombre
    || cobertura?.descripcionCobertura
    || 'Sin cobertura registrada';

const claveIdentidadCobertura = (cobertura) => {
    const pastoId = obtenerId(cobertura?.pastoPrincipal);
    if (pastoId) return `pasto:${pastoId}`;
    const descripcion = String(cobertura?.descripcionCobertura || '').trim().toLowerCase();
    return descripcion ? `descripcion:${descripcion}` : 'sin-cobertura';
};

const prepararHistorialParaCalculo = (historial = [], potrero = null) => {
    const ordenado = [...historial]
        .map((item) => ({ ...item }))
        .sort((a, b) => diaUTC(a.fechaInicio) - diaUTC(b.fechaInicio));
    if (!ordenado.length) return ordenado;

    const claveInicial = claveIdentidadCobertura(ordenado[0]);
    const fechasEstablecimiento = [];
    for (const item of ordenado) {
        if (claveIdentidadCobertura(item) !== claveInicial) break;
        const fecha = diaUTC(item.fechaEstablecimientoPasto);
        if (fecha) fechasEstablecimiento.push(fecha);
    }

    const todasMismaCobertura = ordenado.every((item) => claveIdentidadCobertura(item) === claveInicial);
    if (todasMismaCobertura && claveIdentidadCobertura(potrero) === claveInicial) {
        const fechaActual = diaUTC(potrero?.fechaEstablecimientoPasto);
        if (fechaActual) fechasEstablecimiento.push(fechaActual);
    }

    const inicioRegistrado = diaUTC(ordenado[0].fechaInicio);
    const inicioEfectivo = fechasEstablecimiento
        .filter((fecha) => fecha < inicioRegistrado)
        .sort((a, b) => a - b)[0];
    if (inicioEfectivo) {
        ordenado[0].fechaInicioRegistrada = ordenado[0].fechaInicio;
        ordenado[0].fechaInicio = inicioEfectivo;
        ordenado[0].origenFechaInicio = 'Fecha de establecimiento';
    }
    return ordenado;
};

const crearCoberturaActualCompatibilidad = (potrero) => {
    if (!potrero?.pastoPrincipal && !potrero?.descripcionCobertura) return null;
    return {
        pastoPrincipal: potrero.pastoPrincipal || null,
        pastosSecundarios: potrero.pastosSecundarios || [],
        leguminosasAsociadas: potrero.leguminosasAsociadas || [],
        descripcionCobertura: potrero.descripcionCobertura || null,
        fechaEstablecimientoPasto: potrero.fechaEstablecimientoPasto || null,
        diasDescansoObjetivo: potrero.diasDescansoObjetivo,
        origenCompatibilidad: 'Cobertura actual sin historial'
    };
};

const dividirTramoPorCoberturas = (tramo, historial = [], coberturaCompatibilidad = null) => {
    if (!historial.length && coberturaCompatibilidad) {
        return [{
            cobertura: coberturaCompatibilidad,
            fechaInicio: tramo.fechaInicio,
            fechaFinExclusiva: tramo.fechaFinExclusiva,
            dias: tramo.dias
        }];
    }
    const ordenado = [...historial].sort((a, b) => diaUTC(a.fechaInicio) - diaUTC(b.fechaInicio));
    const segmentos = [];
    let cursor = tramo.fechaInicio;
    while (cursor < tramo.fechaFinExclusiva) {
        const cobertura = ordenado.find((item) => {
            const inicio = diaUTC(item.fechaInicio);
            const finExclusivo = item.fechaFin ? sumarDias(diaUTC(item.fechaFin), 1) : tramo.fechaFinExclusiva;
            return inicio <= cursor && finExclusivo > cursor;
        });
        const siguienteInicio = ordenado
            .map((item) => diaUTC(item.fechaInicio))
            .filter((fecha) => fecha > cursor)
            .sort((a, b) => a - b)[0];
        const finCobertura = cobertura?.fechaFin ? sumarDias(diaUTC(cobertura.fechaFin), 1) : tramo.fechaFinExclusiva;
        const finSegmento = minFecha(tramo.fechaFinExclusiva, cobertura ? finCobertura : (siguienteInicio || tramo.fechaFinExclusiva));
        if (finSegmento <= cursor) break;
        segmentos.push({ cobertura: cobertura || null, fechaInicio: cursor, fechaFinExclusiva: finSegmento, dias: diasEntre(cursor, finSegmento) });
        cursor = finSegmento;
    }
    return segmentos;
};

const claveCobertura = (cobertura, agruparPor) => {
    if (!cobertura) return { clave: 'sin-cobertura', nombre: 'Sin cobertura registrada', especieBase: null, catalogoPastoId: null };
    const pasto = cobertura.pastoPrincipal;
    if (!pasto) {
        const nombre = cobertura.descripcionCobertura ? `Pendiente de catalogar: ${cobertura.descripcionCobertura}` : 'Sin cobertura registrada';
        return { clave: `descripcion:${nombre}`, nombre, especieBase: null, catalogoPastoId: null };
    }
    if (agruparPor === 'especieBase') {
        const especieBase = pasto.especieBase || pasto.nombre;
        return { clave: `especie:${especieBase}`, nombre: especieBase, especieBase, catalogoPastoId: null };
    }
    return { clave: `pasto:${obtenerId(pasto)}`, nombre: pasto.nombre, especieBase: pasto.especieBase || null, catalogoPastoId: obtenerId(pasto) };
};

const crearAcumulador = (datosClave) => ({
    ...datosClave,
    segmentos: [],
    rotaciones: new Set(),
    potreros: new Map(),
    descansos: [],
    objetivoDiasPonderados: 0,
    objetivoPeso: 0,
    coberturasCompatibilidad: new Set()
});

const calcularRendimientoPorPastoConDatos = ({ potreros = [], rotaciones = [], historiales = [] }, filtros = {}) => {
    const periodo = resolverPeriodo(filtros);
    const agruparPor = filtros.agruparPor === 'especieBase' ? 'especieBase' : 'pasto';
    const potreroPorId = new Map(potreros.map((item) => [obtenerId(item), item]));
    const historialPorPotrero = historiales.reduce((grupos, item) => {
        const clave = obtenerId(item.potrero);
        if (!grupos[clave]) grupos[clave] = [];
        grupos[clave].push(item);
        return grupos;
    }, {});
    const historialCalculoPorPotrero = Object.fromEntries(
        Object.entries(historialPorPotrero).map(([potreroId, items]) => [
            potreroId,
            prepararHistorialParaCalculo(items, potreroPorId.get(potreroId))
        ])
    );
    const rotacionesPorPotrero = rotaciones.reduce((grupos, item) => {
        const clave = obtenerId(item.potrero);
        if (!grupos[clave]) grupos[clave] = [];
        grupos[clave].push(item);
        return grupos;
    }, {});
    const grupos = new Map();
    const hoy = filtros.hoy ? diaUTC(filtros.hoy) : diaUTC(new Date());

    rotaciones.forEach((rotacion, indice) => {
        const tramo = obtenerTramoRotacion(rotacion, periodo, hoy);
        if (!tramo) return;
        const potreroId = obtenerId(rotacion.potrero);
        const potrero = potreroPorId.get(potreroId);
        if (!potrero) return;
        const historial = historialCalculoPorPotrero[potreroId] || [];
        const coberturaCompatibilidad = historial.length ? null : crearCoberturaActualCompatibilidad(potrero);
        dividirTramoPorCoberturas(tramo, historial, coberturaCompatibilidad).forEach((segmento) => {
            const datosClave = claveCobertura(segmento.cobertura, agruparPor);
            if (!grupos.has(datosClave.clave)) grupos.set(datosClave.clave, crearAcumulador(datosClave));
            const grupo = grupos.get(datosClave.clave);
            const numeroAnimales = Number(rotacion.numeroAnimales) || 0;
            const animalDias = numeroAnimales * segmento.dias;
            const areaPotrero = Number(potrero.area);
            const densidadDias = areaPotrero > 0 ? (numeroAnimales / areaPotrero) * segmento.dias : null;
            const rotacionId = obtenerId(rotacion._id) || `${potreroId}:${rotacion.fechaEntrada}:${indice}`;
            grupo.segmentos.push({ potreroId, dias: segmento.dias, animalDias, densidadDias });
            grupo.rotaciones.add(rotacionId);
            if (segmento.cobertura?.origenCompatibilidad) grupo.coberturasCompatibilidad.add(potreroId);
            if (!grupo.potreros.has(potreroId)) grupo.potreros.set(potreroId, { potrero, diasOcupados: 0, animalDias: 0, rotaciones: new Set() });
            const resumenPotrero = grupo.potreros.get(potreroId);
            resumenPotrero.diasOcupados += segmento.dias;
            resumenPotrero.animalDias += animalDias;
            resumenPotrero.rotaciones.add(rotacionId);
            const objetivo = Number(segmento.cobertura?.diasDescansoObjetivo);
            if (Number.isFinite(objetivo)) {
                grupo.objetivoDiasPonderados += objetivo * segmento.dias;
                grupo.objetivoPeso += segmento.dias;
            }
        });
    });

    Object.entries(rotacionesPorPotrero).forEach(([potreroId, items]) => {
        calcularIntervalosDescanso(items)
            .filter((item) => item.fechaEntrada >= periodo.fechaInicio && item.fechaEntrada <= periodo.fechaFin)
            .forEach((descanso) => {
                const fechaReferencia = new Date(descanso.fechaEntrada.getTime() - MS_DIA);
                const historial = historialCalculoPorPotrero[potreroId] || [];
                const cobertura = historial.find((item) => {
                    const inicio = diaUTC(item.fechaInicio);
                    const fin = item.fechaFin ? diaUTC(item.fechaFin) : null;
                    return inicio <= fechaReferencia && (!fin || fin >= fechaReferencia);
                }) || (historial.length ? null : crearCoberturaActualCompatibilidad(potreroPorId.get(potreroId)));
                const datosClave = claveCobertura(cobertura, agruparPor);
                if (!grupos.has(datosClave.clave)) grupos.set(datosClave.clave, crearAcumulador(datosClave));
                const grupo = grupos.get(datosClave.clave);
                grupo.descansos.push(descanso.dias);
                const objetivo = Number(cobertura?.diasDescansoObjetivo);
                if (Number.isFinite(objetivo)) {
                    grupo.objetivoDiasPonderados += objetivo * Math.max(descanso.dias, 1);
                    grupo.objetivoPeso += Math.max(descanso.dias, 1);
                }
            });
    });

    const diasPeriodo = diasEntre(periodo.fechaInicio, sumarDias(periodo.fechaFin, 1));
    const resultados = [...grupos.values()].map((grupo) => {
        const diasOcupados = grupo.segmentos.reduce((total, item) => total + item.dias, 0);
        const animalDias = grupo.segmentos.reduce((total, item) => total + item.animalDias, 0);
        const segmentosConArea = grupo.segmentos.filter((item) => item.densidadDias !== null);
        const diasConArea = segmentosConArea.reduce((total, item) => total + item.dias, 0);
        const densidadDias = segmentosConArea.reduce((total, item) => total + item.densidadDias, 0);
        const potrerosGrupo = [...grupo.potreros.values()];
        const area = potrerosGrupo.reduce((total, item) => total + (Number(item.potrero.area) || 0), 0);
        const descansoPromedio = grupo.descansos.length
            ? redondear(grupo.descansos.reduce((total, valor) => total + valor, 0) / grupo.descansos.length)
            : null;
        const descansoObjetivo = grupo.objetivoPeso ? redondear(grupo.objetivoDiasPonderados / grupo.objetivoPeso) : null;
        return {
            clave: grupo.clave,
            nombre: grupo.nombre,
            especieBase: grupo.especieBase,
            catalogoPastoId: grupo.catalogoPastoId,
            cantidadPotreros: potrerosGrupo.length,
            areaHectareas: redondear(area),
            diasOcupados,
            porcentajeOcupacionPromedio: potrerosGrupo.length && diasPeriodo ? redondear((diasOcupados / (potrerosGrupo.length * diasPeriodo)) * 100) : 0,
            numeroRotaciones: grupo.rotaciones.size,
            animalesPromedio: diasOcupados ? redondear(animalDias / diasOcupados) : null,
            densidadAnimalesPorHectarea: diasConArea ? redondear(densidadDias / diasConArea) : null,
            animalDias: redondear(animalDias),
            animalDiasPorHectarea: area > 0 ? redondear(animalDias / area) : null,
            potrerosConCoberturaActualSinHistorial: grupo.coberturasCompatibilidad.size,
            descansoPromedio,
            descansoMinimo: grupo.descansos.length ? Math.min(...grupo.descansos) : null,
            descansoMaximo: grupo.descansos.length ? Math.max(...grupo.descansos) : null,
            descansoObjetivo,
            diferenciaDescansoObjetivo: descansoPromedio !== null && descansoObjetivo !== null ? redondear(descansoPromedio - descansoObjetivo) : null,
            potreros: potrerosGrupo.map((item) => ({
                id: item.potrero._id,
                codigo: item.potrero.codigo,
                nombre: item.potrero.nombre,
                area: item.potrero.area,
                diasOcupados: item.diasOcupados,
                numeroRotaciones: item.rotaciones.size,
                densidadAnimalesPorHectarea: Number(item.potrero.area) > 0 && item.diasOcupados > 0
                    ? redondear((item.animalDias / item.diasOcupados) / Number(item.potrero.area))
                    : null,
                animalDias: redondear(item.animalDias),
                animalDiasPorHectarea: Number(item.potrero.area) > 0 ? redondear(item.animalDias / Number(item.potrero.area)) : null
            }))
        };
    }).sort((a, b) => b.animalDias - a.animalDias);

    return {
        periodo: { fechaInicio: fechaTexto(periodo.fechaInicio), fechaFin: fechaTexto(periodo.fechaFin) },
        agrupacion: agruparPor,
        grupos: resultados,
        nota: 'Los resultados describen el desempeño observado durante el período; no prueban causalidad del tipo de pasto.'
    };
};

const calcularRendimientoPorPasto = async (filtros = {}) => {
    const [potreros, rotaciones, historiales] = await Promise.all([
        Potrero.find()
            .populate('pastoPrincipal')
            .populate('pastosSecundarios')
            .populate('leguminosasAsociadas')
            .sort({ codigo: 1 })
            .lean(),
        RotacionPotrero.find().lean(),
        HistorialCoberturaPotrero.find()
            .populate('pastoPrincipal')
            .populate('pastosSecundarios')
            .populate('leguminosasAsociadas')
            .sort({ fechaInicio: 1 })
            .lean()
    ]);
    return calcularRendimientoPorPastoConDatos({ potreros, rotaciones, historiales }, filtros);
};

module.exports = {
    calcularAnimalDias: (numeroAnimales, dias) => (Number(numeroAnimales) || 0) * (Number(dias) || 0),
    calcularAnimalDiasPorHectarea: (animalDias, area) => (Number(area) > 0 ? redondear(Number(animalDias) / Number(area)) : null),
    calcularComparativoPotreros,
    calcularDescansos,
    calcularDiasRotacion,
    calcularIntervalosDescanso,
    calcularRendimientoPorPasto,
    calcularRendimientoPorPastoConDatos,
    calcularRendimientoMensual,
    calcularRendimientoPotrero,
    obtenerRendimientoPotrero,
    obtenerTramoRotacion,
    dividirTramoPorCoberturas,
    prepararHistorialParaCalculo,
    resolverPeriodo
};
