const Animal = require('../models/Animal');
const Camada = require('../models/Camada');

const MS_DIA = 24 * 60 * 60 * 1000;
const FACTORES_PORCINOS_21_DIAS = Object.freeze({
    14: 1.30,
    15: 1.25,
    16: 1.20,
    17: 1.15,
    18: 1.11,
    19: 1.07,
    20: 1.03,
    21: 1.00,
    22: 0.97,
    23: 0.94,
    24: 0.91,
    25: 0.88,
    26: 0.86,
    27: 0.84,
    28: 0.82
});

const numeroPositivo = (valor) => {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero > 0 ? numero : null;
};

const redondear = (valor, decimales = 2) => {
    if (!Number.isFinite(valor)) return null;
    return Number(valor.toFixed(decimales));
};

const porcentaje = (parte, total) => (total > 0 ? redondear((parte / total) * 100) : 0);

const diasEntre = (inicio, fin) => {
    const desde = new Date(inicio);
    const hasta = new Date(fin);
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return null;
    const dias = Math.round((hasta.getTime() - desde.getTime()) / MS_DIA);
    return dias > 0 ? dias : null;
};

const estadisticas = (valores = []) => {
    const validos = valores.filter((valor) => Number.isFinite(valor)).sort((a, b) => a - b);
    if (!validos.length) {
        return { cantidad: 0, promedio: null, mediana: null, minimo: null, maximo: null };
    }
    const mitad = Math.floor(validos.length / 2);
    const mediana = validos.length % 2
        ? validos[mitad]
        : (validos[mitad - 1] + validos[mitad]) / 2;
    return {
        cantidad: validos.length,
        promedio: redondear(validos.reduce((total, valor) => total + valor, 0) / validos.length),
        mediana: redondear(mediana),
        minimo: redondear(validos[0]),
        maximo: redondear(validos[validos.length - 1])
    };
};

const identificadorAnimal = (animal = {}) => animal.diio || animal.identificadorFinca || '--';

const resumirBovinos = (animales = []) => {
    const detalle = animales.map((animal) => ({
        animalId: animal._id,
        identificador: identificadorAnimal(animal),
        nombre: animal.nombre,
        sexo: animal.sexo,
        fechaNacimiento: animal.fechaNacimiento,
        fechaDestete: animal.fechaDestete,
        edadDesteteDias: diasEntre(animal.fechaNacimiento, animal.fechaDestete),
        pesoNacimiento: numeroPositivo(animal.pesoNacimiento),
        pesoDestete: numeroPositivo(animal.pesoDestete),
        madre: animal.madre ? {
            animalId: animal.madre._id,
            identificador: identificadorAnimal(animal.madre),
            nombre: animal.madre.nombre
        } : null
    }));
    const conPeso = detalle.filter((item) => item.pesoDestete !== null);
    const porSexo = ['Hembra', 'Macho'].map((sexo) => {
        const grupo = detalle.filter((item) => item.sexo === sexo);
        return {
            sexo,
            totalDestetados: grupo.length,
            coberturaPeso: porcentaje(grupo.filter((item) => item.pesoDestete !== null).length, grupo.length),
            ...estadisticas(grupo.map((item) => item.pesoDestete).filter((valor) => valor !== null))
        };
    }).filter((grupo) => grupo.totalDestetados > 0);

    return {
        totalDestetados: detalle.length,
        conPeso: conPeso.length,
        coberturaPeso: porcentaje(conPeso.length, detalle.length),
        pesos: estadisticas(conPeso.map((item) => item.pesoDestete)),
        porSexo,
        detalle
    };
};

const pesosCamada = (camada = {}) => {
    const destetados = numeroPositivo(camada.destetados);
    const totalInformado = numeroPositivo(camada.pesoTotalDestete);
    const promedioInformado = numeroPositivo(camada.pesoPromedioDestete);
    const pesoTotal = totalInformado || (promedioInformado && destetados ? promedioInformado * destetados : null);
    const pesoPromedio = pesoTotal && destetados ? pesoTotal / destetados : promedioInformado;
    return {
        destetados: destetados || 0,
        pesoTotal: redondear(pesoTotal),
        pesoPromedio: redondear(pesoPromedio)
    };
};

const resumirPorcinos = (camadas = []) => {
    const detalle = camadas.map((camada) => {
        const pesos = pesosCamada(camada);
        return {
            camadaId: camada._id,
            codigoCamada: camada.codigoCamada,
            fechaNacimiento: camada.fechaNacimiento,
            fechaDestete: camada.fechaDesteteReal,
            edadDesteteDias: diasEntre(camada.fechaNacimiento, camada.fechaDesteteReal),
            nacidosVivos: Number(camada.nacidosVivos || 0),
            ...pesos,
            pesoPromedioNacimiento: numeroPositivo(camada.pesoPromedioNacimiento),
            madre: camada.madre ? {
                animalId: camada.madre._id,
                identificador: identificadorAnimal(camada.madre),
                nombre: camada.madre.nombre
            } : null
        };
    });
    const conPeso = detalle.filter((item) => item.pesoPromedio !== null);
    const criasConPeso = conPeso.reduce((total, item) => total + item.destetados, 0);
    const pesoTotalConocido = conPeso.reduce((total, item) => total + (item.pesoTotal || 0), 0);
    const totalDestetados = detalle.reduce((total, item) => total + item.destetados, 0);

    return {
        totalCamadas: detalle.length,
        camadasConPeso: conPeso.length,
        coberturaCamadas: porcentaje(conPeso.length, detalle.length),
        totalDestetados,
        criasConPeso,
        coberturaCrias: porcentaje(criasConPeso, totalDestetados),
        pesoPromedioPonderado: criasConPeso ? redondear(pesoTotalConocido / criasConPeso) : null,
        pesosPromedioCamada: estadisticas(conPeso.map((item) => item.pesoPromedio)),
        pesosTotalesCamada: estadisticas(conPeso.map((item) => item.pesoTotal).filter((valor) => valor !== null)),
        detalle
    };
};

const agruparPromedios = (items, obtenerClave, campo) => {
    const grupos = new Map();
    items.forEach((item) => {
        const clave = obtenerClave(item);
        const valor = item[campo];
        if (!clave || !Number.isFinite(valor)) return;
        const grupo = grupos.get(clave.id) || { ...clave, valores: [] };
        grupo.valores.push(valor);
        grupos.set(clave.id, grupo);
    });
    return [...grupos.values()].map(({ valores, ...grupo }) => ({
        ...grupo,
        registros: valores.length,
        promedio: estadisticas(valores).promedio
    })).sort((a, b) => (b.promedio || 0) - (a.promedio || 0));
};

const analizarBovinos = (resumen) => {
    const evaluados = resumen.detalle.map((item) => {
        const datosCompletos = item.pesoNacimiento !== null
            && item.pesoDestete !== null
            && item.edadDesteteDias !== null;
        const edadValida = datosCompletos && item.edadDesteteDias >= 160 && item.edadDesteteDias <= 250;
        const gmdPredestete = datosCompletos
            ? redondear((item.pesoDestete - item.pesoNacimiento) / item.edadDesteteDias, 3)
            : null;
        const pesoEquivalente205 = edadValida
            ? redondear(((item.pesoDestete - item.pesoNacimiento) / item.edadDesteteDias) * 205 + item.pesoNacimiento)
            : null;
        return { ...item, datosCompletos, edadValida, gmdPredestete, pesoEquivalente205 };
    });
    const elegibles = evaluados.filter((item) => item.pesoEquivalente205 !== null);
    const conDatosFueraRango = evaluados.filter((item) => item.datosCompletos && !item.edadValida).length;

    return {
        elegibles205: elegibles.length,
        fueraRango205: conDatosFueraRango,
        sinDatos205: evaluados.length - elegibles.length - conDatosFueraRango,
        pesoEquivalente205: estadisticas(elegibles.map((item) => item.pesoEquivalente205)),
        gmdPredestete: estadisticas(evaluados.map((item) => item.gmdPredestete).filter((valor) => valor !== null)),
        porSexo: ['Hembra', 'Macho'].map((sexo) => {
            const grupo = elegibles.filter((item) => item.sexo === sexo);
            return { sexo, ...estadisticas(grupo.map((item) => item.pesoEquivalente205)) };
        }).filter((grupo) => grupo.cantidad > 0),
        porMadre: agruparPromedios(
            elegibles,
            (item) => item.madre && ({
                id: String(item.madre.animalId),
                identificador: item.madre.identificador,
                nombre: item.madre.nombre
            }),
            'pesoEquivalente205'
        ),
        detalle: evaluados
    };
};

const analizarPorcinos = (resumen) => {
    const evaluadas = resumen.detalle.map((item) => {
        const factor21 = FACTORES_PORCINOS_21_DIAS[item.edadDesteteDias] || null;
        const pesoCamada21 = factor21 && item.pesoTotal !== null
            ? redondear(item.pesoTotal * factor21)
            : null;
        const pesoPromedio21 = pesoCamada21 !== null && item.destetados > 0
            ? redondear(pesoCamada21 / item.destetados)
            : null;
        const gmdPredestete = item.pesoPromedioNacimiento !== null
            && item.pesoPromedio !== null
            && item.edadDesteteDias
            ? redondear((item.pesoPromedio - item.pesoPromedioNacimiento) / item.edadDesteteDias, 3)
            : null;
        const supervivencia = item.nacidosVivos > 0
            ? porcentaje(item.destetados, item.nacidosVivos)
            : null;
        return { ...item, factor21, pesoCamada21, pesoPromedio21, gmdPredestete, supervivencia };
    });
    const elegibles = evaluadas.filter((item) => item.pesoCamada21 !== null);
    const conPesoFueraRango = evaluadas.filter((item) => item.pesoTotal !== null && !item.factor21).length;
    const criasElegibles = elegibles.reduce((total, item) => total + item.destetados, 0);
    const pesoAjustadoTotal = elegibles.reduce((total, item) => total + item.pesoCamada21, 0);

    return {
        elegibles21: elegibles.length,
        fueraRango21: conPesoFueraRango,
        sinDatos21: evaluadas.length - elegibles.length - conPesoFueraRango,
        pesoCamada21: estadisticas(elegibles.map((item) => item.pesoCamada21)),
        pesoPromedioLechon21: criasElegibles ? redondear(pesoAjustadoTotal / criasElegibles) : null,
        gmdPredestete: estadisticas(evaluadas.map((item) => item.gmdPredestete).filter((valor) => valor !== null)),
        supervivencia: estadisticas(evaluadas.map((item) => item.supervivencia).filter((valor) => valor !== null)),
        porMadre: agruparPromedios(
            elegibles,
            (item) => item.madre && ({
                id: String(item.madre.animalId),
                identificador: item.madre.identificador,
                nombre: item.madre.nombre
            }),
            'pesoCamada21'
        ),
        detalle: evaluadas
    };
};

const crearRangoFecha = (fechaInicio, fechaFin) => {
    const rango = {};
    if (fechaInicio) rango.$gte = new Date(fechaInicio);
    if (fechaFin) {
        const fin = new Date(fechaFin);
        fin.setUTCHours(23, 59, 59, 999);
        rango.$lte = fin;
    }
    return Object.keys(rango).length ? rango : null;
};

const obtenerReportePesoDestete = async ({ fechaInicio, fechaFin, especie = 'Todos', avanzado = false } = {}) => {
    const rango = crearRangoFecha(fechaInicio, fechaFin);
    const incluirBovinos = especie !== 'Porcino';
    const incluirPorcinos = especie !== 'Bovino';
    const filtroBovinos = {
        $and: [
            { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] },
            { fechaDestete: { $ne: null, ...(rango || {}) } }
        ]
    };
    const filtroPorcinos = { fechaDesteteReal: { $ne: null, ...(rango || {}) } };
    const [animales, camadas] = await Promise.all([
        incluirBovinos
            ? Animal.find(filtroBovinos)
                .select('identificadorFinca diio nombre sexo fechaNacimiento fechaDestete pesoNacimiento pesoDestete madre')
                .populate('madre', 'identificadorFinca diio nombre')
                .sort({ fechaDestete: -1 })
                .lean()
            : [],
        incluirPorcinos
            ? Camada.find(filtroPorcinos)
                .select('codigoCamada fechaNacimiento fechaDesteteReal nacidosVivos destetados pesoPromedioNacimiento pesoPromedioDestete pesoTotalDestete madre')
                .populate('madre', 'identificadorFinca diio nombre')
                .sort({ fechaDesteteReal: -1 })
                .lean()
            : []
    ]);
    const bovinos = incluirBovinos ? resumirBovinos(animales) : null;
    const porcinos = incluirPorcinos ? resumirPorcinos(camadas) : null;

    return {
        filtros: { fechaInicio: fechaInicio || null, fechaFin: fechaFin || null, especie },
        basico: { bovinos, porcinos },
        avanzado: avanzado ? {
            bovinos: bovinos ? analizarBovinos(bovinos) : null,
            porcinos: porcinos ? analizarPorcinos(porcinos) : null
        } : null
    };
};

module.exports = {
    FACTORES_PORCINOS_21_DIAS,
    analizarBovinos,
    analizarPorcinos,
    diasEntre,
    estadisticas,
    obtenerReportePesoDestete,
    resumirBovinos,
    resumirPorcinos
};
