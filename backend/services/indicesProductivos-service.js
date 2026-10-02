const MS_DIA = 24 * 60 * 60 * 1000;
const ETAPAS_PORCINAS = ['Fase 1', 'Fase 2', 'Fase 3', 'Desarrollo', 'Engorde'];

const CLASIFICACION_ICP = Object.freeze([
    { minimo: 105, etiqueta: 'Por encima del objetivo' },
    { minimo: 95, etiqueta: 'En objetivo' },
    { minimo: 80, etiqueta: 'Bajo objetivo' },
    { minimo: -Infinity, etiqueta: 'Requiere revisión' }
]);

const CLASIFICACION_IEE = Object.freeze([
    { minimo: 95, etiqueta: 'Excelente desempeño' },
    { minimo: 85, etiqueta: 'Buen desempeño' },
    { minimo: 70, etiqueta: 'Desempeño medio' },
    { minimo: -Infinity, etiqueta: 'Requiere revisión' }
]);

const redondear = (valor, decimales = 2) => {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return null;
    return Number(Number(valor).toFixed(decimales));
};

const normalizarTexto = (valor) => String(valor || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const idTexto = (valor) => String(valor?._id || valor || '');

const fechaValida = (valor) => {
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const diasEntre = (inicio, fin) => {
    const fechaInicio = fechaValida(inicio);
    const fechaFin = fechaValida(fin);
    if (!fechaInicio || !fechaFin) return null;
    return (fechaFin.getTime() - fechaInicio.getTime()) / MS_DIA;
};

const pesajesValidosOrdenados = (pesajes = []) => pesajes
    .filter((pesaje) => fechaValida(pesaje.fecha) && Number.isFinite(Number(pesaje.peso)) && Number(pesaje.peso) > 0)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

const calcularGmd = (pesajes = []) => {
    const ordenados = pesajesValidosOrdenados(pesajes);
    if (ordenados.length < 2) return null;
    const inicial = ordenados[0];
    const final = ordenados[ordenados.length - 1];
    const dias = diasEntre(inicial.fecha, final.fecha);
    if (!dias || dias <= 0) return null;
    const gananciaKg = Number(final.peso) - Number(inicial.peso);
    return {
        pesoInicial: Number(inicial.peso),
        pesoFinal: Number(final.peso),
        fechaInicial: inicial.fecha,
        fechaFinal: final.fecha,
        dias,
        gananciaKg,
        gmdReal: gananciaKg / dias,
        cantidadPesajes: ordenados.length
    };
};

const normalizarEtapa = (valor) => {
    const texto = normalizarTexto(valor);
    return ETAPAS_PORCINAS.find((etapa) => normalizarTexto(etapa) === texto) || null;
};

const determinarEtapaPorcina = (animal, pesajeInicial, pesajeFinal) => (
    normalizarEtapa(pesajeInicial?.etapaProductiva)
    || normalizarEtapa(pesajeFinal?.etapaProductiva)
    || normalizarEtapa(animal?.etapaProductiva)
    || normalizarEtapa(animal?.categoria)
);

const obtenerMetaGmdPorcina = (etapa, configuracion = {}) => {
    const metas = configuracion.porcinos || configuracion;
    const campos = {
        'Fase 1': 'gmdFase1KgDia',
        'Fase 2': 'gmdFase2KgDia',
        'Fase 3': 'gmdFase3KgDia',
        Desarrollo: 'gmdDesarrolloKgDia',
        Engorde: 'gmdEngordeKgDia'
    };
    const valor = Number(metas?.[campos[etapa]]);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
};

const calcularCumplimientoGmd = (gmdReal, gmdObjetivo) => (
    Number.isFinite(gmdReal) && Number.isFinite(gmdObjetivo) && gmdObjetivo > 0
        ? (gmdReal / gmdObjetivo) * 100
        : null
);

const crearIntervalos = (animal, pesajes) => {
    const ordenados = pesajesValidosOrdenados(pesajes);
    const intervalos = [];
    for (let indice = 1; indice < ordenados.length; indice += 1) {
        const inicial = ordenados[indice - 1];
        const final = ordenados[indice];
        const dias = diasEntre(inicial.fecha, final.fecha);
        if (!dias || dias <= 0) continue;
        intervalos.push({
            animalId: idTexto(animal),
            etapa: determinarEtapaPorcina(animal, inicial, final),
            dias,
            gananciaKg: Number(final.peso) - Number(inicial.peso),
            pesoInicial: Number(inicial.peso),
            pesoFinal: Number(final.peso),
            fechaInicial: inicial.fecha,
            fechaFinal: final.fecha
        });
    }
    return intervalos;
};

const clasificar = (valor, reglas) => {
    if (valor === null || valor === undefined) return null;
    return reglas.find((regla) => valor >= regla.minimo)?.etiqueta || reglas[reglas.length - 1].etiqueta;
};

const calcularIcpPorcino = ({ animales = [], pesajes = [], configuracion = {} } = {}) => {
    const activos = animales.filter((animal) => (animal.especie || 'Bovino') === 'Porcino' && animal.estado === 'Activo');
    const pesajesPorAnimal = new Map();
    pesajes.forEach((pesaje) => {
        const id = idTexto(pesaje.animal);
        if (!pesajesPorAnimal.has(id)) pesajesPorAnimal.set(id, []);
        pesajesPorAnimal.get(id).push(pesaje);
    });

    const animalesConDosPesajes = new Set();
    const animalesEvaluados = new Set();
    const animalesSinMeta = new Set();
    const intervalosEvaluados = [];
    const grupos = new Map();

    activos.forEach((animal) => {
        const intervalos = crearIntervalos(animal, pesajesPorAnimal.get(idTexto(animal)) || []);
        if (intervalos.length > 0) animalesConDosPesajes.add(idTexto(animal));
        let aporto = false;
        intervalos.forEach((intervalo) => {
            const meta = obtenerMetaGmdPorcina(intervalo.etapa, configuracion);
            if (!meta) return;
            aporto = true;
            const gmdReal = intervalo.gananciaKg / intervalo.dias;
            const cumplimiento = calcularCumplimientoGmd(gmdReal, meta);
            const evaluado = { ...intervalo, meta, gmdReal, cumplimiento };
            intervalosEvaluados.push(evaluado);
            if (!grupos.has(intervalo.etapa)) {
                grupos.set(intervalo.etapa, { etapa: intervalo.etapa, animales: new Set(), dias: 0, gananciaKg: 0, metaDias: 0, cumplimientoDias: 0 });
            }
            const grupo = grupos.get(intervalo.etapa);
            grupo.animales.add(intervalo.animalId);
            grupo.dias += intervalo.dias;
            grupo.gananciaKg += intervalo.gananciaKg;
            grupo.metaDias += meta * intervalo.dias;
            grupo.cumplimientoDias += cumplimiento * intervalo.dias;
        });
        if (aporto) animalesEvaluados.add(idTexto(animal));
        else if (intervalos.length > 0) animalesSinMeta.add(idTexto(animal));
    });

    const animalDiasEvaluados = intervalosEvaluados.reduce((total, item) => total + item.dias, 0);
    const gananciaKgTotal = intervalosEvaluados.reduce((total, item) => total + item.gananciaKg, 0);
    const metaKgTotal = intervalosEvaluados.reduce((total, item) => total + (item.meta * item.dias), 0);
    const icp = animalDiasEvaluados > 0
        ? intervalosEvaluados.reduce((total, item) => total + (item.cumplimiento * item.dias), 0) / animalDiasEvaluados
        : null;

    return {
        icp: redondear(icp, 1),
        clasificacion: clasificar(icp, CLASIFICACION_ICP),
        resumen: {
            porcinosActivos: activos.length,
            porcinosEvaluados: animalesEvaluados.size,
            porcinosSinDatosSuficientes: activos.length - animalesConDosPesajes.size,
            porcinosSinMetaProductiva: animalesSinMeta.size,
            animalDiasEvaluados: redondear(animalDiasEvaluados, 1),
            gananciaKgTotal: redondear(gananciaKgTotal, 2),
            gmdRealPonderada: animalDiasEvaluados > 0 ? redondear(gananciaKgTotal / animalDiasEvaluados, 3) : null,
            gmdObjetivoPonderada: animalDiasEvaluados > 0 ? redondear(metaKgTotal / animalDiasEvaluados, 3) : null
        },
        porEtapa: [...grupos.values()].map((grupo) => ({
            etapa: grupo.etapa,
            animales: grupo.animales.size,
            animalDias: redondear(grupo.dias, 1),
            gananciaKg: redondear(grupo.gananciaKg, 2),
            gmdReal: grupo.dias > 0 ? redondear(grupo.gananciaKg / grupo.dias, 3) : null,
            gmdObjetivo: grupo.dias > 0 ? redondear(grupo.metaDias / grupo.dias, 3) : null,
            cumplimiento: grupo.dias > 0 ? redondear(grupo.cumplimientoDias / grupo.dias, 1) : null
        })).sort((a, b) => ETAPAS_PORCINAS.indexOf(a.etapa) - ETAPAS_PORCINAS.indexOf(b.etapa)),
        datosInsuficientes: icp === null,
        mensaje: icp === null ? 'No existen suficientes pesajes con etapa y meta productiva para calcular el índice de crecimiento porcino.' : null
    };
};

const esAnimalEngorde = (animal) => normalizarTexto(animal?.objetivoProductivo) === 'engorde';

const estuvoActivoEnPeriodo = (animal, fechaInicio, fechaFin) => {
    const ingreso = fechaValida(animal.fechaCompra || animal.createdAt || animal.fechaNacimiento);
    const salida = fechaValida(animal.fechaMuerte || animal.fechaVenta);
    if (ingreso && ingreso > fechaFin) return false;
    if (salida && salida < fechaInicio) return false;
    return true;
};

const calcularEficienciaTiempo = ({ gmd, pesoObjetivo, gmdObjetivo, finalizado = false }) => {
    if (!gmd || !Number.isFinite(Number(pesoObjetivo)) || pesoObjetivo <= 0 || !Number.isFinite(Number(gmdObjetivo)) || gmdObjetivo <= 0) return null;
    const kgObjetivo = Math.max(Number(pesoObjetivo) - gmd.pesoInicial, 0);
    if (kgObjetivo === 0) return 100;
    const diasObjetivo = kgObjetivo / Number(gmdObjetivo);
    let diasEstimados;
    if (finalizado || gmd.pesoFinal >= pesoObjetivo) {
        diasEstimados = gmd.dias;
    } else if (gmd.gmdReal > 0) {
        const kgRestante = Math.max(Number(pesoObjetivo) - gmd.pesoFinal, 0);
        diasEstimados = gmd.dias + (kgRestante / gmd.gmdReal);
    } else {
        return null;
    }
    return diasEstimados > 0 ? (diasObjetivo / diasEstimados) * 100 : null;
};

const calcularSupervivenciaEngorde = (animales, fechaInicio, fechaFin) => {
    const iniciales = animales.filter((animal) => estuvoActivoEnPeriodo(animal, fechaInicio, fechaFin));
    const muertesConFecha = iniciales.filter((animal) => {
        const fecha = fechaValida(animal.fechaMuerte);
        return animal.estado === 'Muerto' && fecha && fecha >= fechaInicio && fecha <= fechaFin;
    });
    const muertesSinFecha = iniciales.filter((animal) => animal.estado === 'Muerto' && !fechaValida(animal.fechaMuerte));
    return {
        animalesEngordeIniciales: iniciales.length,
        muertesEngorde: muertesConFecha.length,
        muertesSinFechaConfiable: muertesSinFecha.length,
        supervivencia: iniciales.length > 0 ? ((iniciales.length - muertesConFecha.length) / iniciales.length) * 100 : null
    };
};

const calcularIeeDesdeComponentes = (componentes) => {
    const pesos = { cumplimientoGmd: 0.60, eficienciaTiempo: 0.25, supervivencia: 0.15 };
    const disponibles = Object.entries(pesos).filter(([campo]) => Number.isFinite(componentes[campo]));
    const pesoDisponible = disponibles.reduce((total, [, peso]) => total + peso, 0);
    if (!pesoDisponible) return { iee: null, componentesDisponibles: [] };
    const valor = disponibles.reduce((total, [campo, peso]) => total + (Math.min(componentes[campo], 100) * peso), 0) / pesoDisponible;
    return { iee: valor, componentesDisponibles: disponibles.map(([campo]) => campo) };
};

const obtenerUltimoPesaje = (pesajes, fechaFin) => pesajesValidosOrdenados(pesajes)
    .filter((pesaje) => new Date(pesaje.fecha) <= fechaFin)
    .at(-1) || null;

const calcularIeeEspecie = ({ especie, animales = [], pesajes = [], configuracion = {}, fechaInicio, fechaFin } = {}) => {
    const meta = especie === 'Porcino'
        ? { gmd: Number(configuracion.porcinos?.gmdEngordeKgDia), peso: Number(configuracion.porcinos?.pesoObjetivoEngordeKg) }
        : { gmd: Number(configuracion.bovinosEngorde?.gmdObjetivoKgDia), peso: Number(configuracion.bovinosEngorde?.pesoObjetivoKg) };
    const animalesEngorde = animales.filter((animal) => (animal.especie || 'Bovino') === especie && esAnimalEngorde(animal) && estuvoActivoEnPeriodo(animal, fechaInicio, fechaFin));
    const pesajesPorAnimal = new Map();
    pesajes.forEach((pesaje) => {
        const id = idTexto(pesaje.animal);
        if (!pesajesPorAnimal.has(id)) pesajesPorAnimal.set(id, []);
        pesajesPorAnimal.get(id).push(pesaje);
    });

    const evaluados = [];
    const pesosActuales = [];
    const eficienciasTiempo = [];
    const fechaReciente = new Date(fechaFin.getTime() - (Number(configuracion.diasPesajeReciente || 60) * MS_DIA));
    let sinPesajesRecientes = 0;
    let alcanzaronObjetivo = 0;

    animalesEngorde.forEach((animal) => {
        const todos = pesajesPorAnimal.get(idTexto(animal)) || [];
        const periodo = todos.filter((pesaje) => {
            const fecha = fechaValida(pesaje.fecha);
            return fecha && fecha >= fechaInicio && fecha <= fechaFin;
        });
        const gmd = calcularGmd(periodo);
        const ultimo = obtenerUltimoPesaje(todos, fechaFin);
        if (ultimo) pesosActuales.push(Number(ultimo.peso));
        if (animal.estado === 'Activo' && (!ultimo || new Date(ultimo.fecha) < fechaReciente)) sinPesajesRecientes += 1;
        if (ultimo && Number.isFinite(meta.peso) && Number(ultimo.peso) >= meta.peso) alcanzaronObjetivo += 1;
        if (!gmd) return;
        const eficienciaTiempo = calcularEficienciaTiempo({
            gmd,
            pesoObjetivo: meta.peso,
            gmdObjetivo: meta.gmd,
            finalizado: ['Vendido', 'Muerto'].includes(animal.estado)
        });
        if (Number.isFinite(eficienciaTiempo)) eficienciasTiempo.push({ valor: eficienciaTiempo, dias: gmd.dias });
        evaluados.push({ animal, gmd, eficienciaTiempo });
    });

    const animalDias = evaluados.reduce((total, item) => total + item.gmd.dias, 0);
    const gananciaKgTotal = evaluados.reduce((total, item) => total + item.gmd.gananciaKg, 0);
    const gmdReal = animalDias > 0 ? gananciaKgTotal / animalDias : null;
    const cumplimientoGmd = calcularCumplimientoGmd(gmdReal, meta.gmd);
    const diasTiempo = eficienciasTiempo.reduce((total, item) => total + item.dias, 0);
    const eficienciaTiempo = diasTiempo > 0
        ? eficienciasTiempo.reduce((total, item) => total + (item.valor * item.dias), 0) / diasTiempo
        : null;
    const supervivencia = calcularSupervivenciaEngorde(animalesEngorde, fechaInicio, fechaFin);
    const componentes = { cumplimientoGmd, eficienciaTiempo, supervivencia: supervivencia.supervivencia };
    const resultadoCalculado = calcularIeeDesdeComponentes(componentes);
    const resultadoIee = Number.isFinite(cumplimientoGmd)
        ? resultadoCalculado
        : { iee: null, componentesDisponibles: resultadoCalculado.componentesDisponibles };
    const pesoPromedioActual = pesosActuales.length ? pesosActuales.reduce((a, b) => a + b, 0) / pesosActuales.length : null;
    const kgPromedioRestantes = pesoPromedioActual !== null && Number.isFinite(meta.peso)
        ? Math.max(meta.peso - pesoPromedioActual, 0)
        : null;
    const diasEstimadosRestantes = kgPromedioRestantes !== null && gmdReal > 0 ? kgPromedioRestantes / gmdReal : null;

    return {
        iee: redondear(resultadoIee.iee, 1),
        clasificacion: clasificar(resultadoIee.iee, CLASIFICACION_IEE),
        animalesEvaluados: evaluados.length,
        animalesActualmenteEngorde: animalesEngorde.filter((animal) => animal.estado === 'Activo').length,
        animalDias: redondear(animalDias, 1),
        gananciaKgTotal: redondear(gananciaKgTotal, 2),
        gmdReal: redondear(gmdReal, 3),
        gmdObjetivo: Number.isFinite(meta.gmd) && meta.gmd > 0 ? redondear(meta.gmd, 3) : null,
        cumplimientoGmd: redondear(cumplimientoGmd, 1),
        pesoPromedioActual: redondear(pesoPromedioActual, 2),
        pesoObjetivo: Number.isFinite(meta.peso) && meta.peso > 0 ? redondear(meta.peso, 2) : null,
        eficienciaTiempo: redondear(eficienciaTiempo, 1),
        supervivencia: redondear(supervivencia.supervivencia, 1),
        animalesEngordeIniciales: supervivencia.animalesEngordeIniciales,
        muertesEngorde: supervivencia.muertesEngorde,
        muertesSinFechaConfiable: supervivencia.muertesSinFechaConfiable,
        diasPromedioEngorde: evaluados.length ? redondear(animalDias / evaluados.length, 1) : null,
        kgPromedioRestantes: redondear(kgPromedioRestantes, 2),
        diasEstimadosRestantes: redondear(diasEstimadosRestantes, 0),
        animalesPesoObjetivo: alcanzaronObjetivo,
        animalesSinPesajesRecientes: sinPesajesRecientes,
        componentesDisponibles: resultadoIee.componentesDisponibles,
        datosInsuficientes: resultadoIee.iee === null
    };
};

const ponderarEspecies = (resultados, campo) => {
    const disponibles = resultados.filter((item) => Number.isFinite(item?.[campo]));
    if (disponibles.length === 0) return null;
    if (disponibles.length === 1) return disponibles[0][campo];
    const dias = disponibles.reduce((total, item) => total + Number(item.animalDias || 0), 0);
    if (dias <= 0) return null;
    return disponibles.reduce((total, item) => total + (item[campo] * Number(item.animalDias || 0)), 0) / dias;
};

const calcularIeeGeneral = ({ animales = [], pesajes = [], configuracion = {}, fechaInicio, fechaFin, especie = 'Todos' } = {}) => {
    const especies = especie === 'Bovino' || especie === 'Porcino' ? [especie] : ['Bovino', 'Porcino'];
    const resultados = Object.fromEntries(especies.map((nombre) => [nombre, calcularIeeEspecie({
        especie: nombre,
        animales,
        pesajes,
        configuracion,
        fechaInicio,
        fechaFin
    })]));
    const lista = Object.values(resultados);
    const ieeGeneral = ponderarEspecies(lista, 'iee');
    const componentes = {
        cumplimientoGmd: ponderarEspecies(lista, 'cumplimientoGmd'),
        eficienciaTiempo: ponderarEspecies(lista, 'eficienciaTiempo'),
        supervivencia: ponderarEspecies(lista, 'supervivencia')
    };
    return {
        ieeGeneral: redondear(ieeGeneral, 1),
        clasificacion: clasificar(ieeGeneral, CLASIFICACION_IEE),
        componentes: Object.fromEntries(Object.entries(componentes).map(([campo, valor]) => [campo, redondear(valor, 1)])),
        bovinos: resultados.Bovino || null,
        porcinos: resultados.Porcino || null,
        datosInsuficientes: ieeGeneral === null,
        mensaje: ieeGeneral === null ? 'No existe información suficiente para calcular el índice de eficiencia de engorde.' : null,
        preparadoPara: ['conversionAlimenticia', 'eficienciaEconomica']
    };
};

const obtenerProyeccionPesoObjetivo = ({ pesoActual, pesoObjetivo, gmdReal }) => {
    if (![pesoActual, pesoObjetivo, gmdReal].every(Number.isFinite) || gmdReal <= 0) return null;
    const kgRestantes = Math.max(pesoObjetivo - pesoActual, 0);
    return {
        kgRestantes: redondear(kgRestantes, 2),
        diasEstimados: redondear(kgRestantes / gmdReal, 0)
    };
};

module.exports = {
    CLASIFICACION_ICP,
    CLASIFICACION_IEE,
    ETAPAS_PORCINAS,
    calcularCumplimientoGmd,
    calcularEficienciaTiempo,
    calcularGmd,
    calcularGmdEngordePorEspecie: calcularIeeEspecie,
    calcularIcpPorcino,
    calcularIeeEspecie,
    calcularIeeGeneral,
    calcularSupervivenciaEngorde,
    determinarEtapaPorcina,
    esAnimalEngorde,
    obtenerMetaGmdPorcina,
    obtenerProyeccionPesoObjetivo
};
