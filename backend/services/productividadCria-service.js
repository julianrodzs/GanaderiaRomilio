const ESTADOS_CAMADA_CERRADA = new Set(['Destetada', 'Vendida', 'Cerrada']);
const METAS_CRIA_PORCINA_DEFAULT = Object.freeze({
    nacidosVivosPorCamada: 12,
    destetadosPorCamada: 11,
    supervivenciaPredestetePct: 90
});
const PESOS_INDICE_CRIA_PORCINA = Object.freeze({
    nacidosVivosPorCamada: 0.30,
    destetadosPorCamada: 0.45,
    supervivenciaPredestete: 0.25
});

const CLASIFICACION_ICRP = Object.freeze([
    { minimo: 100, etiqueta: 'Meta alcanzada' },
    { minimo: 85, etiqueta: 'Cerca de la meta' },
    { minimo: 70, etiqueta: 'Bajo la meta' },
    { minimo: -Infinity, etiqueta: 'Requiere revisión' }
]);

const redondear = (valor, decimales = 1) => Number(Number(valor || 0).toFixed(decimales));
const porcentaje = (parte, total) => (total > 0 ? (parte / total) * 100 : 0);
const idDe = (valor) => String(valor?._id || valor || '');

const camadaConDesteteCerrado = (camada) => Boolean(
    camada.fechaDesteteReal
    || ESTADOS_CAMADA_CERRADA.has(camada.estado)
);

const metaValida = (valor, respaldo) => {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero > 0 ? numero : respaldo;
};

const cumplimientoMeta = (valor, meta) => Math.min((valor / meta) * 100, 100);

const calcularIndiceCriaPorcina = ({
    promedioNacidosVivosPorCamada,
    promedioDestetadosPorCamada,
    supervivenciaPredestete,
    camadasDestetadas,
    nacidosVivosDestetables,
    configuracion = {}
}) => {
    const metasConfiguradas = configuracion.porcinosCria || configuracion;
    const metas = {
        nacidosVivosPorCamada: metaValida(metasConfiguradas.nacidosVivosObjetivoCamada, METAS_CRIA_PORCINA_DEFAULT.nacidosVivosPorCamada),
        destetadosPorCamada: metaValida(metasConfiguradas.destetadosObjetivoCamada, METAS_CRIA_PORCINA_DEFAULT.destetadosPorCamada),
        supervivenciaPredestetePct: metaValida(metasConfiguradas.supervivenciaPredesteteObjetivoPct, METAS_CRIA_PORCINA_DEFAULT.supervivenciaPredestetePct)
    };

    if (camadasDestetadas <= 0 || nacidosVivosDestetables <= 0) {
        return {
            icrp: null,
            clasificacion: null,
            datosInsuficientesIndice: true,
            mensajeIndice: 'Se necesita al menos una camada con destete cerrado y nacidos vivos para calcular el índice.',
            metas,
            componentesIndice: null
        };
    }

    const componentesIndice = {
        nacidosVivosPorCamada: {
            valor: promedioNacidosVivosPorCamada,
            meta: metas.nacidosVivosPorCamada,
            peso: PESOS_INDICE_CRIA_PORCINA.nacidosVivosPorCamada,
            cumplimiento: cumplimientoMeta(promedioNacidosVivosPorCamada, metas.nacidosVivosPorCamada)
        },
        destetadosPorCamada: {
            valor: promedioDestetadosPorCamada,
            meta: metas.destetadosPorCamada,
            peso: PESOS_INDICE_CRIA_PORCINA.destetadosPorCamada,
            cumplimiento: cumplimientoMeta(promedioDestetadosPorCamada, metas.destetadosPorCamada)
        },
        supervivenciaPredestete: {
            valor: supervivenciaPredestete,
            meta: metas.supervivenciaPredestetePct,
            peso: PESOS_INDICE_CRIA_PORCINA.supervivenciaPredestete,
            cumplimiento: cumplimientoMeta(supervivenciaPredestete, metas.supervivenciaPredestetePct)
        }
    };
    const indice = Object.values(componentesIndice).reduce(
        (total, componente) => total + (componente.cumplimiento * componente.peso),
        0
    );

    return {
        icrp: redondear(indice, 1),
        clasificacion: CLASIFICACION_ICRP.find((regla) => indice >= regla.minimo)?.etiqueta,
        datosInsuficientesIndice: false,
        mensajeIndice: null,
        metas,
        componentesIndice: Object.fromEntries(Object.entries(componentesIndice).map(([clave, componente]) => [clave, {
            ...componente,
            valor: redondear(componente.valor, 2),
            cumplimiento: redondear(componente.cumplimiento, 1)
        }]))
    };
};

const calcularProductividadPorcina = (camadas = [], { configuracion = {} } = {}) => {
    const camadasDestetadas = camadas.filter(camadaConDesteteCerrado);
    const nacidosVivos = camadas.reduce((total, camada) => total + Number(camada.nacidosVivos || 0), 0);
    const nacidosVivosDestetables = camadasDestetadas.reduce((total, camada) => total + Number(camada.nacidosVivos || 0), 0);
    const destetados = camadasDestetadas.reduce((total, camada) => total + Number(camada.destetados || 0), 0);
    const muertosPreDestete = camadasDestetadas.reduce((total, camada) => total + Number(camada.muertosPreDestete || 0), 0);
    const madresConParto = new Set(camadas.map((camada) => idDe(camada.madre)).filter(Boolean)).size;
    const madresConDestete = new Set(camadasDestetadas.map((camada) => idDe(camada.madre)).filter(Boolean)).size;
    const promedioNacidosVivosCamadasCerradas = redondear(camadasDestetadas.length ? nacidosVivosDestetables / camadasDestetadas.length : 0, 2);
    const promedioDestetadosPorCamada = redondear(camadasDestetadas.length ? destetados / camadasDestetadas.length : 0, 2);
    const supervivenciaPredestete = redondear(porcentaje(destetados, nacidosVivosDestetables), 2);
    const indice = calcularIndiceCriaPorcina({
        promedioNacidosVivosPorCamada: promedioNacidosVivosCamadasCerradas,
        promedioDestetadosPorCamada,
        supervivenciaPredestete,
        camadasDestetadas: camadasDestetadas.length,
        nacidosVivosDestetables,
        configuracion
    });

    return {
        tipo: 'Porcino',
        ...indice,
        totalCamadas: camadas.length,
        camadasDestetadas: camadasDestetadas.length,
        madresConParto,
        madresConDestete,
        nacidosVivos,
        destetados,
        muertosPreDestete,
        promedioNacidosVivosPorCamada: redondear(camadas.length ? nacidosVivos / camadas.length : 0, 2),
        promedioNacidosVivosCamadasCerradas,
        promedioDestetadosPorCamada,
        supervivenciaPredestete,
        mortalidadPredesteteRegistrada: redondear(porcentaje(muertosPreDestete, nacidosVivosDestetables), 2),
        camadasPorMadreConParto: redondear(madresConParto ? camadas.length / madresConParto : 0, 2),
        destetadosPorMadre: redondear(madresConDestete ? destetados / madresConDestete : 0, 2),
        metodologia: {
            supervivenciaPredestete: 'Destetados / nacidos vivos de camadas cuyo destete ya fue cerrado.',
            criterioDesteteCerrado: 'Fecha de destete real o estado Destetada, Vendida o Cerrada.',
            indiceCriaPorcina: '30% nacidos vivos por camada, 45% destetados por camada y 25% supervivencia predestete, normalizados contra las metas internas.'
        }
    };
};

module.exports = {
    CLASIFICACION_ICRP,
    METAS_CRIA_PORCINA_DEFAULT,
    PESOS_INDICE_CRIA_PORCINA,
    calcularIndiceCriaPorcina,
    calcularProductividadPorcina,
    camadaConDesteteCerrado
};
