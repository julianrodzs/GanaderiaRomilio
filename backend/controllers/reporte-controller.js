const Animal = require('../models/Animal');
const Potrero = require('../models/Potrero');
const { PlanSanitario } = require('../models/PlanSanitario');
const RotacionPotrero = require('../models/RotacionPotrero');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const ConteoDrone = require('../models/ConteoDrone');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const Pesaje = require('../models/Pesaje');
const Camada = require('../models/Camada');
const { Tarea } = require('../models/Tarea');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const CompraAnimal = require('../models/CompraAnimal');
const HistorialFincaAnimal = require('../models/HistorialFincaAnimal');
const { construirReporteCompras } = require('../services/reporteComprasAnimales-service');
const { tieneFeature } = require('../services/plan-service');
const {
    calcularGmd,
    calcularIcpPorcino,
    calcularIeeGeneral
} = require('../services/indicesProductivos-service');
const {
    actualizarConfiguracionProductiva,
    obtenerConfiguracionProductiva
} = require('../services/configuracionProductiva-service');
const {
    obtenerReporteDescendencia,
    obtenerReporteRacial
} = require('../services/reportesRazaGenealogia-service');
const { obtenerReportePesoDestete } = require('../services/reportePesoDestete-service');
const { obtenerCategoriaAnimal } = require('../services/categoriaAnimal-service');
const { calcularProductividadPorcina } = require('../services/productividadCria-service');
const {
    asignarEconomiaPorCamada,
    calcularTotalCompraAnimal,
    construirContratoSustentabilidad,
    crearMapaMonedas,
    esMovimientoInversionOperativa,
    normalizarMoneda,
    sumarMovimientosPorMoneda
} = require('../services/finanzas-calculos-service');
const { parsearFechaCivil, rangoFechaCivil } = require('../services/fechaZonaHoraria-service');
const {
    obtenerAnimalesConHechoPeriodo,
    obtenerAnimalesDiaPeriodo,
    obtenerPoblacionAFecha
} = require('../services/poblacionHistorica-service');

const reporteCtrl = {};
const { obtenerRendimientoForrajes } = require('../services/forrajeRendimiento-service');

reporteCtrl.getRendimientoForrajes = async (req, res) => {
    try {
        res.json(await obtenerRendimientoForrajes(req.query));
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al calcular el rendimiento forrajero', error: error.message });
    }
};

const obtenerPeriodoIndices = (query = {}) => {
    const hoy = new Date();
    const inicioPredeterminado = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    const fechaInicio = query.fechaInicio ? new Date(query.fechaInicio) : inicioPredeterminado;
    const fechaFin = query.fechaFin ? new Date(query.fechaFin) : hoy;
    fechaInicio.setUTCHours(0, 0, 0, 0);
    fechaFin.setUTCHours(23, 59, 59, 999);
    if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime()) || fechaInicio > fechaFin) {
        const error = new Error('El período indicado no es válido.');
        error.status = 400;
        throw error;
    }
    return { fechaInicio, fechaFin };
};

reporteCtrl.getConfiguracionProductiva = async (req, res) => {
    try {
        res.json(await obtenerConfiguracionProductiva());
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener la configuración productiva', error: error.message });
    }
};

reporteCtrl.getRazasBovinas = async (req, res) => {
    try {
        res.json(await obtenerReporteRacial({ especie: req.query.especie || 'Bovino' }));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener el reporte racial', error: error.message });
    }
};

reporteCtrl.getDescendenciaBovina = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = obtenerPeriodoIndices(req.query);
        res.json({
            filtros: { fechaInicio, fechaFin },
            ...await obtenerReporteDescendencia({ fechaInicio, fechaFin })
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message || 'Error al obtener el reporte de descendencia' });
    }
};

reporteCtrl.getPesoDestete = async (req, res) => {
    try {
        res.json(await obtenerReportePesoDestete({
            fechaInicio: req.query.fechaInicio,
            fechaFin: req.query.fechaFin,
            especie: req.query.especie || 'Todos'
        }));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener el reporte de peso al destete', error: error.message });
    }
};

reporteCtrl.getPesoDesteteAvanzado = async (req, res) => {
    try {
        res.json(await obtenerReportePesoDestete({
            fechaInicio: req.query.fechaInicio,
            fechaFin: req.query.fechaFin,
            especie: req.query.especie || 'Todos',
            avanzado: true
        }));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener el análisis avanzado de destete', error: error.message });
    }
};

reporteCtrl.updateConfiguracionProductiva = async (req, res) => {
    try {
        const configuracion = await actualizarConfiguracionProductiva(req.body, req.usuario?.id);
        res.json({ mensaje: 'Metas productivas actualizadas', configuracion });
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar las metas productivas' });
    }
};

reporteCtrl.getCrecimientoPorcino = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = obtenerPeriodoIndices(req.query);
        const animales = await Animal.find({ especie: 'Porcino', estado: 'Activo' }).lean();
        const ids = animales.map((animal) => animal._id);
        const [pesajes, configuracion] = await Promise.all([
            Pesaje.find({ animal: { $in: ids }, fecha: { $gte: fechaInicio, $lte: fechaFin } }).sort({ fecha: 1 }).lean(),
            obtenerConfiguracionProductiva()
        ]);
        res.json({
            filtros: { fechaInicio, fechaFin },
            ...calcularIcpPorcino({ animales, pesajes, configuracion: configuracion.toObject() })
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message || 'Error al calcular el crecimiento porcino' });
    }
};

reporteCtrl.getEficienciaEngorde = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = obtenerPeriodoIndices(req.query);
        const especie = ['Bovino', 'Porcino'].includes(req.query.especie) ? req.query.especie : 'Todos';
        const filtroEspecie = especie === 'Todos' ? {} : crearFiltroEspecieAnimal(especie);
        const filtroEngorde = { objetivoProductivo: 'ENGORDE' };
        const animales = await Animal.find(
            Object.keys(filtroEspecie).length ? { $and: [filtroEspecie, filtroEngorde] } : filtroEngorde
        ).lean();
        const ids = animales.map((animal) => animal._id);
        const [pesajes, configuracion] = await Promise.all([
            Pesaje.find({ animal: { $in: ids }, fecha: { $lte: fechaFin } }).sort({ fecha: 1 }).lean(),
            obtenerConfiguracionProductiva()
        ]);
        res.json({
            filtros: { fechaInicio, fechaFin, especie },
            ...calcularIeeGeneral({
                animales,
                pesajes,
                configuracion: configuracion.toObject(),
                fechaInicio,
                fechaFin,
                especie
            })
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message || 'Error al calcular la eficiencia de engorde' });
    }
};

const crearFiltroEspecieAnimal = (especie) => {
    if (especie === 'Bovino') return { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] };
    if (especie === 'Porcino') return { especie };
    return {};
};

const crearFiltroEspecieCompra = (especie) => {
    if (especie === 'Bovino') return { $or: [{ especie: 'Bovino' }, { especie: { $exists: false } }] };
    if (especie === 'Porcino') return { especie: 'Porcino' };
    return {};
};

const obtenerIdsAnimalesPorEspecie = async (especie) => {
    const filtro = crearFiltroEspecieAnimal(especie);
    if (!Object.keys(filtro).length) return null;
    const animales = await Animal.find(filtro).select('_id').lean();
    return animales.map((animal) => animal._id);
};

const crearFiltroFechas = (campo, fechaInicio, fechaFin) => {
    const filtro = {};

    if (fechaInicio || fechaFin) {
        filtro[campo] = {};
        if (fechaInicio) filtro[campo].$gte = parsearFechaCivil(fechaInicio, 'La fecha inicial');
        if (fechaFin) {
            const fechaFinDia = parsearFechaCivil(fechaFin, 'La fecha final');
            fechaFinDia.setUTCHours(23, 59, 59, 999);
            filtro[campo].$lte = fechaFinDia;
        }
        if (filtro[campo].$gte && filtro[campo].$lte && filtro[campo].$gte > filtro[campo].$lte) {
            const error = new Error('La fecha inicial no puede ser posterior a la final.');
            error.status = 400;
            throw error;
        }
    }

    return filtro;
};

const obtenerPeriodoCivil = (fechaInicio, fechaFin) => {
    const hoy = new Date();
    const inicioPredeterminado = `${hoy.getUTCFullYear()}-01-01`;
    const finPredeterminado = hoy.toISOString().slice(0, 10);
    return rangoFechaCivil({
        fechaInicio: fechaInicio || inicioPredeterminado,
        fechaFin: fechaFin || finPredeterminado
    });
};

const crearFiltroMesActual = (campo) => {
    const hoy = new Date();
    const inicio = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    const fin = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    return {
        [campo]: {
            $gte: inicio,
            $lte: fin
        }
    };
};

const crearFiltroProductos = ({ fechaInicio, fechaFin, producto, categoria, proveedor } = {}) => {
    const filtro = {
        naturaleza: 'Egreso',
        tipoMovimiento: 'Compra',
        producto: { $exists: true, $nin: [null, ''] }
    };
    const filtroFechas = fechaInicio || fechaFin
        ? crearFiltroFechas('fecha', fechaInicio, fechaFin)
        : crearFiltroMesActual('fecha');

    Object.assign(filtro, filtroFechas);

    if (producto) filtro.producto = { $regex: producto, $options: 'i' };
    if (categoria) {
        filtro.categoria = { $regex: categoria, $options: 'i' };
    }
    if (proveedor) filtro.proveedor = { $regex: proveedor, $options: 'i' };

    return filtro;
};

const normalizarUnidadPipeline = {
    $ifNull: [
        {
            $cond: [
                { $in: ['$unidadNormalizada', [null, '']] },
                {
                    $cond: [
                        { $eq: ['$unidad', ''] },
                        'sin unidad',
                        '$unidad'
                    ]
                },
                '$unidadNormalizada'
            ]
        },
        'sin unidad'
    ]
};

const agregarCantidadProductoPipeline = [
    {
        $addFields: {
            unidadNormalizada: normalizarUnidadPipeline
        }
    },
    {
        $addFields: {
            unidadPartes: {
                $regexFind: {
                    input: '$unidadNormalizada',
                    regex: /^([0-9]+(?:[,.][0-9]+)?)\s*(?:x\s*)?(.+)$/i
                }
            }
        }
    },
    {
        $addFields: {
            cantidadCompra: { $ifNull: ['$cantidad', 0] },
            factorUnidad: {
                $cond: [
                    { $gt: [{ $ifNull: ['$factorUnidad', 0] }, 0] },
                    '$factorUnidad',
                    {
                        $cond: [
                            { $ne: ['$unidadPartes', null] },
                            {
                                $toDouble: {
                                    $replaceAll: {
                                        input: { $arrayElemAt: ['$unidadPartes.captures', 0] },
                                        find: ',',
                                        replacement: '.'
                                    }
                                }
                            },
                            1
                        ]
                    }
                ]
            },
            unidadBase: {
                $cond: [
                    { $ne: ['$unidadPartes', null] },
                    { $arrayElemAt: ['$unidadPartes.captures', 1] },
                    '$unidadNormalizada'
                ]
            }
        }
    },
    {
        $addFields: {
            cantidadFisicaCalculada: { $multiply: ['$cantidadCompra', '$factorUnidad'] }
        }
    },
    {
        $addFields: {
            cantidadFisica: {
                $cond: [
                    { $gt: [{ $ifNull: ['$cantidadFisica', 0] }, 0] },
                    '$cantidadFisica',
                    '$cantidadFisicaCalculada'
                ]
            }
        }
    }
];

const pipelineDestinoUso = {
    $cond: [
        { $not: [{ $in: ['$destinoUso', [null, '']] }] },
        '$destinoUso',
        'Otro'
    ]
};

const agruparPorCampo = async (Modelo, campo, filtro = {}) => {
    return Modelo.aggregate([
        { $match: filtro },
        {
            $group: {
                _id: `$${campo}`,
                cantidad: { $sum: 1 }
            }
        },
        { $sort: { cantidad: -1 } }
    ]);
};

const mapearGrupo = (items, nombreCampo) => {
    return items.map((item) => ({
        [nombreCampo]: item._id || 'Sin definir',
        cantidad: item.cantidad
    }));
};

const obtenerRangoAnios = (items, fechaInicio, fechaFin) => {
    const anioInicio = fechaInicio ? new Date(fechaInicio).getUTCFullYear() : null;
    const anioFin = fechaFin ? new Date(fechaFin).getUTCFullYear() : null;
    const aniosDatos = items.map((item) => new Date(item.fechaPartoReal).getUTCFullYear()).filter(Boolean);
    const inicio = anioInicio || Math.min(...aniosDatos);
    const fin = anioFin || Math.max(...aniosDatos);

    if (!Number.isFinite(inicio) || !Number.isFinite(fin)) {
        return [];
    }

    return Array.from({ length: fin - inicio + 1 }, (_, indice) => inicio + indice);
};

const calcularEdadMeses = (fechaNacimiento) => {
    if (!fechaNacimiento) return null;

    const nacimiento = new Date(fechaNacimiento);
    if (Number.isNaN(nacimiento.getTime())) return null;

    const hoy = new Date();
    let meses = (hoy.getFullYear() - nacimiento.getUTCFullYear()) * 12;
    meses += hoy.getMonth() - nacimiento.getUTCMonth();

    if (hoy.getDate() < nacimiento.getUTCDate()) {
        meses -= 1;
    }

    return Math.max(meses, 0);
};

const calcularDiasEntre = (fechaInicio, fechaFin = new Date()) => {
    if (!fechaInicio) return null;
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;

    return Math.max(Math.floor((fin - inicio) / (1000 * 60 * 60 * 24)), 0);
};

const calcularMesesEntre = (fechaInicio, fechaFin = new Date()) => {
    const dias = calcularDiasEntre(fechaInicio, fechaFin);
    if (dias === null) return null;
    return redondear(Math.max(dias / 30.4375, 0), 2);
};

const restarMeses = (fecha, meses) => {
    const resultado = new Date(fecha);
    resultado.setUTCMonth(resultado.getUTCMonth() - meses);
    return resultado;
};

const porcentaje = (numerador, denominador) => {
    if (!denominador || denominador <= 0) return 0;
    return Math.max(Math.min((numerador / denominador) * 100, 100), 0);
};

const redondear = (valor, decimales = 2) => Number((valor || 0).toFixed(decimales));

const clasificarIpg = (ipg) => {
    if (ipg >= 95) return 'Excelente';
    if (ipg >= 85) return 'Muy bueno';
    if (ipg >= 75) return 'Bueno';
    if (ipg >= 60) return 'Regular';
    return 'Deficiente';
};

const estaFechaEnPeriodo = (fecha, fechaInicio, fechaFin) => {
    if (!fecha) return false;

    const valorFecha = new Date(fecha).getTime();
    if (Number.isNaN(valorFecha)) return false;

    if (fechaInicio && valorFecha < new Date(fechaInicio).getTime()) return false;
    if (fechaFin) {
        const fin = new Date(fechaFin);
        fin.setUTCHours(23, 59, 59, 999);
        if (valorFecha > fin.getTime()) return false;
    }

    return true;
};

const obtenerFechaIngresoFinca = (animal) => animal.fechaCompra || animal.fechaNacimiento || animal.createdAt;

const calcularTotalVentaAnimal = (animal) => {
    if (animal.pesoVenta && animal.precioVentaPorKg) {
        return animal.pesoVenta * animal.precioVentaPorKg;
    }
    return 0;
};

const crearRecomendacionesProductividad = ({
    vacasReproductoras,
    ternerosNacidosPeriodo,
    ternerosDestetadosPeriodo,
    vacasGestantes,
    totalAnimales,
    muertesPeriodo,
    tasaNatalidad,
    tasaDestete,
    tasaGestacion,
    tasaSupervivencia
}) => {
    const recomendaciones = [];

    if (vacasReproductoras === 0) recomendaciones.push('No hay vacas reproductoras identificadas. Registra fecha de nacimiento o ciclos reproductivos.');
    if (ternerosNacidosPeriodo === 0) recomendaciones.push('No hay partos reales registrados en el periodo.');
    if (ternerosNacidosPeriodo > 0 && ternerosDestetadosPeriodo === 0) recomendaciones.push('Hay nacimientos pero no hay destetes registrados en el periodo.');
    if (vacasGestantes === 0) recomendaciones.push('No hay vacas gestantes activas registradas.');
    if (totalAnimales === 0) recomendaciones.push('No hay animales registrados para calcular supervivencia.');
    if (muertesPeriodo > 0) recomendaciones.push('Hay muertes registradas en el periodo. Revisar causas sanitarias o manejo.');
    if (tasaNatalidad < 60 && vacasReproductoras > 0) recomendaciones.push('La natalidad está baja para una finca de cría. Revisar preñez, monta y diagnóstico reproductivo.');
    if (tasaDestete < 80 && ternerosNacidosPeriodo > 0) recomendaciones.push('La tasa de destete está baja. Revisar supervivencia de terneros, nutrición y sanidad.');
    if (tasaGestacion < 50 && vacasReproductoras > 0) recomendaciones.push('La tasa de gestación está baja. Revisar toros, condición corporal y calendario reproductivo.');
    if (tasaSupervivencia < 95 && totalAnimales > 0) recomendaciones.push('La supervivencia del hato requiere atención.');

    if (recomendaciones.length === 0) {
        recomendaciones.push('Indicadores reproductivos dentro de un rango saludable para finca de cría.');
    }

    return recomendaciones;
};

const categoriasInversion = new Set(['Ganado', 'Infraestructura', 'Maquinaria', 'Compra de animales']);

const sumarMovimientos = (movimientos) => movimientos.reduce((total, movimiento) => total + (movimiento.monto || 0), 0);

const calcularValorAnimal = (animal) => {
    if (animal.valorEstimado) return animal.valorEstimado;
    if (animal.montoCompra) return animal.montoCompra;

    const precioKg = animal.precioEstimadoKg || animal.precioKg || animal.valorKg || 0;
    if (animal.pesoActual && precioKg) {
        return animal.pesoActual * precioKg;
    }

    return 0;
};

const esMovimientoInversion = (movimiento) => {
    return movimiento.tipoMovimiento === 'Inversion'
        || movimiento.tipoMovimiento === 'Compra de animales'
        || categoriasInversion.has(movimiento.categoria);
};

const esMovimientoIngreso = (movimiento) => movimiento.naturaleza === 'Ingreso';

const esMovimientoGastoOperativo = (movimiento) => {
    if (movimiento.naturaleza !== 'Egreso') return false;
    if (esMovimientoInversion(movimiento)) return false;
    return movimiento.tipoMovimiento === 'Planilla'
        || movimiento.tipoMovimiento === 'Compra';
};

reporteCtrl.getProductividadCria = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, especie } = req.query;
        if (especie === 'Porcino') {
            const [camadas, camadasDestetadasPeriodo, configuracion] = await Promise.all([
                Camada.find(crearFiltroFechas('fechaNacimiento', fechaInicio, fechaFin)).lean(),
                Camada.find({
                    ...crearFiltroFechas('fechaDesteteReal', fechaInicio, fechaFin),
                    fechaDesteteReal: {
                        ...(crearFiltroFechas('fechaDesteteReal', fechaInicio, fechaFin).fechaDesteteReal || {}),
                        $exists: true,
                        $ne: null
                    }
                }).lean(),
                obtenerConfiguracionProductiva()
            ]);
            return res.json({
                ...calcularProductividadPorcina(camadas, { configuracion: configuracion.toObject(), camadasDestetadasPeriodo }),
                filtros: {
                    fechaInicio: fechaInicio || null,
                    fechaFin: fechaFin || null,
                    especie: 'Porcino'
                }
            });
        }

        const especieAnalizada = 'Bovino';
        const { inicio, fin } = obtenerPeriodoCivil(fechaInicio, fechaFin);
        const alcance = {
            organizacionId: req.organizacionId,
            fincaId: req.fincaId,
            especie: especieAnalizada
        };
        const [
            poblacionFinal,
            poblacionPromedio,
            nacidos,
            destetados,
            muertes,
            registrosHastaCorte
        ] = await Promise.all([
            obtenerPoblacionAFecha({ ...alcance, fecha: fin }),
            obtenerAnimalesDiaPeriodo({ ...alcance, fechaInicio: inicio, fechaFin: fin }),
            obtenerAnimalesConHechoPeriodo({ ...alcance, campo: 'fechaNacimiento', fechaInicio: inicio, fechaFin: fin }),
            obtenerAnimalesConHechoPeriodo({ ...alcance, campo: 'fechaDestete', fechaInicio: inicio, fechaFin: fin }),
            obtenerAnimalesConHechoPeriodo({ ...alcance, campo: 'fechaMuerte', fechaInicio: inicio, fechaFin: fin }),
            RegistroReproductivo.find({
                especie: 'Bovino',
                $or: [
                    { fechaMonta: { $lte: fin } },
                    { fechaInseminacion: { $lte: fin } },
                    { fechaUltimoDiagnosticoGestacion: { $lte: fin } },
                    { fechaPartoReal: { $lte: fin } }
                ]
            }).select('animal estadoCiclo gestacionConfirmada resultadoDiagnosticoGestacion fechaUltimoDiagnosticoGestacion').lean()
        ]);
        const idsConRegistro = new Set(registrosHastaCorte.map((registro) => String(registro.animal)));
        const calcularEdadAlCorte = (animal) => {
            if (!animal.fechaNacimiento) return null;
            return Math.max(0, (fin - new Date(animal.fechaNacimiento)) / (30.4375 * 24 * 60 * 60 * 1000));
        };
        const vacasReproductorasLista = poblacionFinal.filter((animal) => animal.sexo === 'Hembra'
            && ((calcularEdadAlCorte(animal) || 0) >= 24 || idsConRegistro.has(String(animal._id))));
        const idsVacasCorte = new Set(vacasReproductorasLista.map((animal) => String(animal._id)));
        const idsGestantes = new Set(registrosHastaCorte
            .filter((registro) => idsVacasCorte.has(String(registro.animal)))
            .filter((registro) => !registro.estadoCiclo || registro.estadoCiclo === 'Activo')
            .filter((registro) => registro.gestacionConfirmada === true || registro.resultadoDiagnosticoGestacion === 'PREÑADA')
            .map((registro) => String(registro.animal)));

        const vacasReproductoras = vacasReproductorasLista.length;
        const ternerosNacidosPeriodo = nacidos.filter((animal) => !animal.fechaCompra).length;
        const ternerosDestetadosPeriodo = destetados.length;
        const vacasGestantes = idsGestantes.size;
        const muertesPeriodo = muertes.length;
        const totalAnimales = poblacionPromedio.promedio;
        const tasaNatalidad = vacasReproductoras ? redondear(porcentaje(ternerosNacidosPeriodo, vacasReproductoras)) : null;
        const tasaDestete = ternerosNacidosPeriodo ? redondear(porcentaje(ternerosDestetadosPeriodo, ternerosNacidosPeriodo)) : null;
        const tasaGestacion = vacasReproductoras ? redondear(porcentaje(vacasGestantes, vacasReproductoras)) : null;
        const tasaSupervivencia = totalAnimales > 0
            ? redondear(Math.max(Math.min((1 - (muertesPeriodo / totalAnimales)) * 100, 100), 0))
            : null;
        const tasasCompletas = [tasaNatalidad, tasaDestete, tasaGestacion, tasaSupervivencia].every((valor) => valor !== null);
        const ipg = tasasCompletas ? redondear(
            tasaNatalidad * 0.40
            + tasaDestete * 0.25
            + tasaGestacion * 0.20
            + tasaSupervivencia * 0.15
        ) : null;

        res.json({
            tipo: 'Bovino',
            especieAnalizada,
            ipg,
            clasificacion: ipg === null ? 'Sin datos suficientes' : clasificarIpg(ipg),
            tasaNatalidad,
            tasaDestete,
            tasaGestacion,
            tasaSupervivencia,
            ternerosNacidosPeriodo,
            ternerosDestetadosPeriodo,
            vacasReproductoras,
            vacasGestantes,
            muertesPeriodo,
            totalAnimales: redondear(totalAnimales),
            animalesDia: redondear(poblacionPromedio.animalesDia),
            recomendaciones: crearRecomendacionesProductividad({
                vacasReproductoras,
                ternerosNacidosPeriodo,
                ternerosDestetadosPeriodo,
                vacasGestantes,
                totalAnimales,
                muertesPeriodo,
                tasaNatalidad,
                tasaDestete,
                tasaGestacion,
                tasaSupervivencia
            })
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener productividad de cria', error: error.message });
    }
};

reporteCtrl.getFinanzasCria = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtroPeriodo = crearFiltroFechas('fecha', fechaInicio, fechaFin);
        const { inicio, fin } = obtenerPeriodoCivil(fechaInicio, fechaFin);
        const inicioMovimientosInventario = new Date(inicio.getTime() + 1);
        const alcance = { organizacionId: req.organizacionId, fincaId: req.fincaId };

        const [movimientos, movimientosPeriodo, poblacionInicial, poblacionFinal, nacimientos, compras, ventas, muertes, traslados] = await Promise.all([
            MovimientoFinanciero.find().lean(),
            MovimientoFinanciero.find(filtroPeriodo).lean(),
            obtenerPoblacionAFecha({ ...alcance, fecha: inicio }),
            obtenerPoblacionAFecha({ ...alcance, fecha: fin }),
            obtenerAnimalesConHechoPeriodo({ ...alcance, campo: 'fechaNacimiento', fechaInicio: inicioMovimientosInventario, fechaFin: fin }),
            obtenerAnimalesConHechoPeriodo({ ...alcance, campo: 'fechaCompra', fechaInicio: inicioMovimientosInventario, fechaFin: fin }),
            obtenerAnimalesConHechoPeriodo({ ...alcance, campo: 'fechaVenta', fechaInicio: inicioMovimientosInventario, fechaFin: fin }),
            obtenerAnimalesConHechoPeriodo({ ...alcance, campo: 'fechaMuerte', fechaInicio: inicioMovimientosInventario, fechaFin: fin }),
            HistorialFincaAnimal.find({ tipo: 'Traslado', fecha: { $gte: inicioMovimientosInventario, $lte: fin } })
                .setOptions({ omitirAislamientoFinca: true }).lean()
        ]);

        const inversionOperativaHistorica = sumarMovimientosPorMoneda(movimientos, esMovimientoInversionOperativa);
        const gastosOperativosPeriodo = sumarMovimientosPorMoneda(movimientosPeriodo, esMovimientoGastoOperativo);
        const ingresosPeriodo = sumarMovimientosPorMoneda(movimientosPeriodo, esMovimientoIngreso);
        const monedas = crearMapaMonedas((moneda) => ({
            inversionOperativaHistorica: redondear(inversionOperativaHistorica[moneda]),
            gastosOperativosPeriodo: redondear(gastosOperativosPeriodo[moneda]),
            ingresosPeriodo: redondear(ingresosPeriodo[moneda]),
            balanceOperativo: redondear(ingresosPeriodo[moneda] - gastosOperativosPeriodo[moneda])
        }));
        const animalesInicioPeriodo = poblacionInicial.length;
        const animalesFinalPeriodo = poblacionFinal.length;
        const trasladosEntrada = traslados.filter((item) => String(item.fincaDestino) === String(req.fincaId)).length;
        const trasladosSalida = traslados.filter((item) => String(item.fincaOrigen) === String(req.fincaId)).length;
        const entradasNacimiento = nacimientos.filter((animal) => !animal.fechaCompra).length;
        const entradasCompra = compras.length;
        const inventarioEsperado = animalesInicioPeriodo + entradasNacimiento + entradasCompra + trasladosEntrada
            - ventas.length - muertes.length - trasladosSalida;
        const diferenciaConciliacion = animalesFinalPeriodo - inventarioEsperado;
        const advertencias = diferenciaConciliacion === 0 ? [] : [{
            codigo: 'INVENTARIO_NO_CONCILIA',
            mensaje: `El inventario final difiere en ${diferenciaConciliacion} animal(es) respecto de los hechos disponibles. Revise fechas históricas faltantes.`,
            diferencia: diferenciaConciliacion
        }];
        const valorEstimadoHato = sumarMovimientos(poblacionFinal.map((animal) => ({ monto: calcularValorAnimal(animal) })));

        res.json({
            monedas,
            valorEstimadoHato: redondear(valorEstimadoHato),
            crecimientoHato: animalesFinalPeriodo - animalesInicioPeriodo,
            animalesInicioPeriodo,
            animalesActuales: animalesFinalPeriodo,
            animalesFinalPeriodo,
            movimientosInventario: {
                nacimientos: entradasNacimiento,
                compras: entradasCompra,
                trasladosEntrada,
                ventas: ventas.length,
                muertes: muertes.length,
                descartes: 0,
                trasladosSalida
            },
            advertencias,
            patrimonioGanaderoEstimado: redondear(valorEstimadoHato),
            metodologiaPatrimonio: 'El inventario inicial y final se reconstruye a la fecha del período. El valor usa los datos monetarios disponibles en la ficha y se presenta separado del flujo financiero.'
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener finanzas de cria', error: error.message });
    }
};

reporteCtrl.getSustentabilidadCria = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtroPeriodo = crearFiltroFechas('fecha', fechaInicio, fechaFin);
        const { inicio, fin } = obtenerPeriodoCivil(fechaInicio, fechaFin);

        const [animales, movimientosPeriodo, poblacionPeriodo] = await Promise.all([
            Animal.find().lean(),
            MovimientoFinanciero.find(filtroPeriodo).lean(),
            obtenerAnimalesDiaPeriodo({
                organizacionId: req.organizacionId,
                fincaId: req.fincaId,
                fechaInicio: inicio,
                fechaFin: fin
            })
        ]);

        const gastosOperativosPeriodo = sumarMovimientosPorMoneda(movimientosPeriodo, esMovimientoGastoOperativo);
        const movimientosVentas = sumarMovimientosPorMoneda(movimientosPeriodo, (movimiento) => (
            movimiento.tipoMovimiento === 'Venta de animales' || movimiento.referenciaModelo === 'VentaAnimal'
        ));
        const movimientosCompras = sumarMovimientosPorMoneda(movimientosPeriodo, (movimiento) => (
            movimiento.tipoMovimiento === 'Compra de animales' || movimiento.referenciaModelo === 'CompraAnimal'
        ));
        const animalesVendidos = animales.filter((animal) => {
            return estaFechaEnPeriodo(animal.fechaVenta, fechaInicio, fechaFin)
                && animal.pesoVenta > 0
                && animal.precioVentaPorKg > 0;
        });
        const animalesAnalizados = animalesVendidos.map((animal) => {
            const fechaIngreso = obtenerFechaIngresoFinca(animal);
            const duracionMeses = calcularMesesEntre(fechaIngreso, animal.fechaVenta) || 0;
            const totalCompra = calcularTotalCompraAnimal(animal);
            const totalVenta = calcularTotalVentaAnimal(animal);
            return {
                animalId: animal._id,
                diio: animal.diio || animal.identificadorFinca || '--',
                nombre: animal.nombre || '',
                origen: animal.fechaCompra ? 'Comprado' : 'Nacido en finca',
                fechaIngreso: fechaIngreso || null,
                fechaVenta: animal.fechaVenta,
                precioCompraPorKg: animal.precioCompraPorKg || 0,
                precioVentaPorKg: animal.precioVentaPorKg || 0,
                pesoCompra: animal.fechaCompra ? animal.pesoCompra || 0 : animal.pesoNacimiento || 0,
                pesoVenta: animal.pesoVenta || 0,
                totalCompra: redondear(totalCompra),
                totalVenta: redondear(totalVenta),
                duracionMeses,
                resultadoComercialDirecto: redondear(totalVenta - totalCompra)
            };
        });
        const montoComprasAnimales = sumarMovimientos(animalesAnalizados.map((animal) => ({ monto: animal.totalCompra })));
        const montoVentasAnimales = sumarMovimientos(animalesAnalizados.map((animal) => ({ monto: animal.totalVenta })));
        const contratoSustentabilidad = construirContratoSustentabilidad({
            gastos: gastosOperativosPeriodo,
            ventas: movimientosVentas,
            compras: movimientosCompras,
            animalesPromedio: poblacionPeriodo.promedio,
            movimientosPeriodo: movimientosPeriodo.length
        });
        const monedas = contratoSustentabilidad.monedas;
        const pesoCompraTotal = sumarMovimientos(animalesAnalizados.map((animal) => ({ monto: animal.pesoCompra })));
        const pesoVentaTotal = sumarMovimientos(animalesAnalizados.map((animal) => ({ monto: animal.pesoVenta })));
        const duracionPromedioMeses = animalesAnalizados.length
            ? animalesAnalizados.reduce((total, animal) => total + animal.duracionMeses, 0) / animalesAnalizados.length
            : 0;
        const precioVentaPromedioKg = pesoVentaTotal ? montoVentasAnimales / pesoVentaTotal : 0;
        const precioCompraPromedioKg = pesoCompraTotal ? montoComprasAnimales / pesoCompraTotal : 0;

        res.json({
            monedas,
            montoVentasAnimales: redondear(montoVentasAnimales),
            montoComprasAnimales: redondear(montoComprasAnimales),
            animalesCompradosPeriodo: animalesAnalizados.filter((animal) => animal.origen === 'Comprado').length,
            animalesVendidosPeriodo: animalesAnalizados.length,
            animalesPromedioPeriodo: redondear(poblacionPeriodo.promedio),
            animalesDia: redondear(poblacionPeriodo.animalesDia),
            diasPeriodo: poblacionPeriodo.diasPeriodo,
            movimientosPeriodo: contratoSustentabilidad.movimientosPeriodo,
            precioVentaPromedioKg: redondear(precioVentaPromedioKg),
            precioCompraPromedioKg: redondear(precioCompraPromedioKg),
            pesoCompraTotal: redondear(pesoCompraTotal),
            pesoVentaTotal: redondear(pesoVentaTotal),
            duracionPromedioMeses: redondear(duracionPromedioMeses),
            detalleAnimales: animalesAnalizados,
            animalesIgnorados: animales.filter((animal) => {
                return estaFechaEnPeriodo(animal.fechaVenta, fechaInicio, fechaFin)
                    && (!animal.pesoVenta || !animal.precioVentaPorKg);
            }).map((animal) => ({
                animalId: animal._id,
                diio: animal.diio || animal.identificadorFinca || '--',
                motivo: 'Falta pesoVenta o precioVentaPorKg'
            })),
            formula: 'Balance del período = ventas reales del período - compras reales del período - gastos operativos reales del período.',
            criterioFechas: {
                ingreso: 'fechaNacimiento para nacidos en finca y fechaCompra para comprados',
                ventas: 'fechaVenta del animal cuando estado es Vendido',
                gastosOperativos: 'fecha del movimiento financiero',
                costoOperativo: 'gastos operativos del período / promedio de animales-día del mismo período'
            }
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener sustentabilidad de cria', error: error.message });
    }
};


const crearReportePartos = async ({ fechaInicio, fechaFin, diio, filtroExtra = {} }) => {
    const filtroPartos = crearFiltroFechas('fechaPartoReal', fechaInicio, fechaFin);
    const idsBovinos = await obtenerIdsAnimalesPorEspecie('Bovino');
    const idsBovinosSet = new Set((idsBovinos || []).map((id) => String(id)));
    filtroPartos.fechaPartoReal = {
        ...(filtroPartos.fechaPartoReal || {}),
        $exists: true,
        $ne: null
    };

    if (diio) {
        const animales = await Animal.find({
            $or: [
                { diio: { $regex: diio, $options: 'i' } },
                { identificadorFinca: { $regex: diio, $options: 'i' } }
            ]
        }).select('_id');

        const idsDiio = animales.map((animal) => animal._id);
        filtroPartos.animal = {
            $in: idsDiio.filter((id) => idsBovinosSet.has(String(id)))
        };
    } else {
        filtroPartos.animal = { $in: idsBovinos || [] };
    }

    if (filtroExtra.animal?.$in) {
        const idsActuales = filtroPartos.animal?.$in || [];
        filtroPartos.animal = {
            $in: idsActuales.filter((id) => filtroExtra.animal.$in.some((otroId) => String(otroId) === String(id)))
        };
    }

    const registros = await RegistroReproductivo.find(filtroPartos)
        .populate('animal')
        .sort({ fechaPartoReal: 1 });
    const anios = obtenerRangoAnios(registros, fechaInicio, fechaFin);
    const vacas = new Map();

    registros.forEach((registro) => {
        if (!registro.animal) return;

        const animalId = registro.animal._id.toString();
        const anio = new Date(registro.fechaPartoReal).getUTCFullYear();

        if (!vacas.has(animalId)) {
            vacas.set(animalId, {
                animalId,
                diio: registro.animal.diio || registro.animal.identificadorFinca || '--',
                nombre: registro.animal.nombre || '',
                fechaNacimiento: registro.animal.fechaNacimiento || null,
                totalPartos: 0,
                ultimoParto: null,
                partosPorAnio: Object.fromEntries(anios.map((anioItem) => [anioItem, 0]))
            });
        }

        const vaca = vacas.get(animalId);
        vaca.totalPartos += 1;
        vaca.partosPorAnio[anio] = (vaca.partosPorAnio[anio] || 0) + 1;
        vaca.ultimoParto = registro.fechaPartoReal;
    });

    const porVaca = Array.from(vacas.values()).map((vaca) => {
        const valoresAnuales = anios.map((anio) => vaca.partosPorAnio[anio] || 0);
        const aniosCumplidos = valoresAnuales.filter((cantidad) => cantidad === 1).length;
        const aniosSinParto = valoresAnuales.filter((cantidad) => cantidad === 0).length;
        const aniosRevisar = valoresAnuales.filter((cantidad) => cantidad > 1).length;

        let estado = 'Cumple';
        if (aniosSinParto > 0) estado = 'Bajo objetivo';
        if (aniosRevisar > 0) estado = 'Revisar';

        return {
            ...vaca,
            edadMeses: calcularEdadMeses(vaca.fechaNacimiento),
            promedioAnual: anios.length ? vaca.totalPartos / anios.length : 0,
            aniosCumplidos,
            aniosSinParto,
            aniosRevisar,
            estado
        };
    }).sort((a, b) => a.diio.localeCompare(b.diio, 'es', { numeric: true }));

    return {
        anios,
        resumen: {
            totalPartos: registros.length,
            vacasConPartos: porVaca.length,
            vacasCumplen: porVaca.filter((vaca) => vaca.estado === 'Cumple').length,
            vacasBajoObjetivo: porVaca.filter((vaca) => vaca.estado === 'Bajo objetivo').length,
            vacasRevisar: porVaca.filter((vaca) => vaca.estado === 'Revisar').length
        },
        porVaca
    };
};

const tieneGestacionActiva = (registros, fechaCorte) => {
    return registros.some((registro) => {
        if (registro.fechaPartoReal || ['Cancelado', 'No preñada', 'Cerrado sin parto'].includes(registro.estadoCiclo)) return false;
        if (!(registro.gestacionConfirmada === true || registro.resultadoDiagnosticoGestacion === 'PREÑADA')) return false;
        return !registro.fechaUltimoDiagnosticoGestacion || new Date(registro.fechaUltimoDiagnosticoGestacion) <= fechaCorte;
    });
};

const obtenerUltimoParto = (registros, fechaCorte = new Date()) => {
    return registros
        .filter((registro) => registro.fechaPartoReal && new Date(registro.fechaPartoReal) <= fechaCorte)
        .sort((a, b) => new Date(b.fechaPartoReal) - new Date(a.fechaPartoReal))[0] || null;
};

const obtenerDestetesBajos = (vaca, terneros, pesoDesteteMin, fechaInicio, fechaFin) => {
    const posiblesMadres = [vaca.diio, vaca.identificadorFinca].filter(Boolean);

    return terneros.filter((ternero) => {
        if (String(ternero.madre || '') !== String(vaca._id) && !posiblesMadres.includes(ternero.madreDiio)) return false;
        if (!ternero.pesoDestete || ternero.pesoDestete >= pesoDesteteMin) return false;
        if (fechaInicio || fechaFin) {
            return estaFechaEnPeriodo(ternero.fechaDestete || ternero.updatedAt, fechaInicio, fechaFin);
        }
        return true;
    });
};

const calcularCategoriaAnimal = (animal) => {
    return obtenerCategoriaAnimal(animal) || animal.categoria || 'Otro';
};

const crearAnalisisPesajesAnimal = (animal, pesajes) => {
    const ordenados = [...pesajes].sort((a, b) => (
        new Date(a.fecha) - new Date(b.fecha)
        || new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
        || String(a._id || '').localeCompare(String(b._id || ''))
    ));
    const inicial = ordenados[0];
    const actual = ordenados[ordenados.length - 1];
    const crecimiento = calcularGmd(ordenados);
    const dias = crecimiento?.dias ?? null;
    const gananciaTotal = crecimiento?.gananciaKg ?? null;
    const gananciaDiariaPromedio = crecimiento?.gmdReal ?? null;
    const gananciaMensualPromedio = gananciaDiariaPromedio === null ? null : gananciaDiariaPromedio * 30.44;

    return {
        animalId: animal._id,
        diio: animal.diio || animal.identificadorFinca || '--',
        nombre: animal.nombre || '',
        sexo: animal.sexo,
        categoria: calcularCategoriaAnimal(animal),
        pesoInicial: inicial?.peso ?? null,
        pesoActual: actual?.peso ?? null,
        fechaInicial: inicial?.fecha || null,
        fechaUltimoPesaje: actual?.fecha || null,
        cantidadPesajes: ordenados.length,
        diasTranscurridos: dias,
        gananciaTotal: gananciaTotal === null ? null : redondear(gananciaTotal),
        gananciaDiariaPromedio: gananciaDiariaPromedio === null ? null : redondear(gananciaDiariaPromedio, 3),
        gananciaMensualPromedio: gananciaMensualPromedio === null ? null : redondear(gananciaMensualPromedio, 2),
        evolucion: ordenados.map((pesaje) => ({
            fecha: pesaje.fecha,
            peso: pesaje.peso
        }))
    };
};

reporteCtrl.getCrecimientoPesajes = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, animalId, diasSinPesaje = 60, especie } = req.query;
        const filtroPesajes = crearFiltroFechas('fecha', fechaInicio, fechaFin);
        const filtroAnimales = {
            estado: { $nin: ['Muerto', 'Vendido'] },
            ...crearFiltroEspecieAnimal(especie)
        };
        if (animalId) filtroAnimales._id = animalId;
        const animales = await Animal.find(filtroAnimales).lean();
        const idsAnimales = animales.map((animal) => animal._id);
        filtroPesajes.animal = { $in: idsAnimales };
        const pesajes = idsAnimales.length
            ? await Pesaje.find(filtroPesajes).sort({ fecha: 1, createdAt: 1, _id: 1 }).lean()
            : [];
        const ultimosPesajesGlobales = idsAnimales.length
            ? await Pesaje.find({ animal: { $in: idsAnimales } })
                .setOptions({ omitirAislamientoFinca: true })
                .sort({ fecha: -1, createdAt: -1, _id: -1 })
                .lean()
            : [];
        const ultimoGlobalPorAnimal = ultimosPesajesGlobales.reduce((mapa, pesaje) => {
            const id = String(pesaje.animal || '');
            if (id && !mapa.has(id)) mapa.set(id, pesaje);
            return mapa;
        }, new Map());
        const pesajesPorAnimal = pesajes.reduce((mapa, pesaje) => {
            const id = pesaje.animal?.toString();
            if (!id) return mapa;
            if (!mapa.has(id)) mapa.set(id, []);
            mapa.get(id).push(pesaje);
            return mapa;
        }, new Map());
        const analisis = animales
            .filter((animal) => !animalId || animal._id.toString() === animalId)
            .map((animal) => crearAnalisisPesajesAnimal(animal, pesajesPorAnimal.get(animal._id.toString()) || []))
            .filter((item) => item.cantidadPesajes > 0);
        const conCrecimiento = analisis.filter((item) => item.cantidadPesajes >= 2 && item.diasTranscurridos > 0);
        const fechaLimiteReciente = new Date();
        fechaLimiteReciente.setDate(fechaLimiteReciente.getDate() - Number(diasSinPesaje || 60));
        const animalesSinPesajesRecientes = animales.filter((animal) => {
            const ultimo = ultimoGlobalPorAnimal.get(animal._id.toString());
            return !ultimo || new Date(ultimo.fecha) < fechaLimiteReciente;
        }).map((animal) => ({
            animalId: animal._id,
            diio: animal.diio || animal.identificadorFinca || '--',
            nombre: animal.nombre || '',
            sexo: animal.sexo,
            categoria: calcularCategoriaAnimal(animal),
            fechaUltimoPesaje: ultimoGlobalPorAnimal.get(animal._id.toString())?.fecha || null
        }));
        const categoriasCrias = especie === 'Porcino'
            ? new Set(['Lechón', 'Lechona'])
            : especie === 'Bovino'
                ? new Set(['Ternero', 'Ternera'])
                : new Set(['Ternero', 'Ternera', 'Lechón', 'Lechona']);
        const crecimientoCrias = analisis.filter((item) => categoriasCrias.has(item.categoria)).map((item) => {
            const animal = animales.find((animalItem) => animalItem._id.toString() === item.animalId.toString());
            const pesoNacimiento = animal?.pesoNacimiento;
            if (pesoNacimiento === null || pesoNacimiento === undefined || item.pesoActual === null) return null;
            return {
                ...item,
                pesoNacimiento,
                gananciaDesdeNacimiento: redondear(item.pesoActual - pesoNacimiento)
            };
        }).filter(Boolean);

        res.json({
            filtros: {
                fechaInicio: fechaInicio || null,
                fechaFin: fechaFin || null,
                animalId: animalId || null,
                diasSinPesaje: Number(diasSinPesaje || 60),
                especie: especie || 'Todos'
            },
            resumen: {
                animalesConPesajes: analisis.length,
                totalPesajes: pesajes.length,
                animalesConCrecimiento: conCrecimiento.length,
                animalesSinPesajesRecientes: animalesSinPesajesRecientes.length,
                gananciaPromedioDiaria: conCrecimiento.length ? redondear(
                    conCrecimiento.reduce((total, item) => total + item.gananciaDiariaPromedio, 0) / conCrecimiento.length,
                    3
                ) : null,
                gananciaDiariaPromedio: conCrecimiento.length ? redondear(
                    conCrecimiento.reduce((total, item) => total + item.gananciaDiariaPromedio, 0) / conCrecimiento.length,
                    3
                ) : null,
                gananciaPromedioMensual: conCrecimiento.length ? redondear(
                    conCrecimiento.reduce((total, item) => total + item.gananciaMensualPromedio, 0) / conCrecimiento.length,
                    2
                ) : null,
                gananciaMensualPromedio: conCrecimiento.length ? redondear(
                    conCrecimiento.reduce((total, item) => total + item.gananciaMensualPromedio, 0) / conCrecimiento.length,
                    2
                ) : null,
                sinPesajesRecientes: animalesSinPesajesRecientes.length
            },
            mejoresCrecimientos: [...conCrecimiento].sort((a, b) => b.gananciaDiariaPromedio - a.gananciaDiariaPromedio).slice(0, 10),
            menoresCrecimientos: [...conCrecimiento].sort((a, b) => a.gananciaDiariaPromedio - b.gananciaDiariaPromedio).slice(0, 10),
            animalesSinPesajesRecientes,
            evolucion: animalId ? analisis[0]?.evolucion || [] : analisis.slice(0, 10),
            crecimientoCrias,
            crecimientoTerneros: especie === 'Porcino' ? [] : crecimientoCrias
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener reporte de crecimiento', error: error.message });
    }
};

reporteCtrl.getVacasImproductivas = async (req, res) => {
    try {
        if (req.query.especie === 'Porcino') {
            return res.json({
                aplica: false,
                parametros: { especie: 'Porcino' },
                resumen: {
                    totalVacasRevisar: 0,
                    sinPartoReciente: 0,
                    sinGestacionActiva: 0,
                    muchosDiasAbiertos: 0,
                    destetesBajos: 0
                },
                vacas: []
            });
        }
        const {
            fechaInicio,
            fechaFin,
            diio,
            mesesSinParto = 12,
            diasAbiertos = 120,
            pesoDesteteMin = 140
        } = req.query;
        const mesesSinPartoNumero = Number(mesesSinParto) || 12;
        const diasAbiertosNumero = Number(diasAbiertos) || 120;
        const pesoDesteteMinNumero = Number(pesoDesteteMin) || 140;
        const fechaCorte = fechaFin
            ? (() => { const fecha = parsearFechaCivil(fechaFin, 'La fecha final'); fecha.setUTCHours(23, 59, 59, 999); return fecha; })()
            : new Date();
        const limiteParto = restarMeses(fechaCorte, mesesSinPartoNumero);
        const configuracion = await obtenerConfiguracionProductiva();
        const diasEsperaPosparto = Number(configuracion?.diasEsperaPosparto || 45);

        const filtroEspecieBovina = crearFiltroEspecieAnimal('Bovino');
        let filtroHembras = {
            sexo: 'Hembra',
            estado: 'Activo'
        };

        if (diio) {
            filtroHembras = { $and: [
                filtroHembras,
                filtroEspecieBovina,
                { $or: [
                    { diio: { $regex: diio, $options: 'i' } },
                    { identificadorFinca: { $regex: diio, $options: 'i' } },
                    { nombre: { $regex: diio, $options: 'i' } }
                ] }
            ] };
        } else {
            filtroHembras = { $and: [filtroHembras, filtroEspecieBovina] };
        }

        const [hembras, registros, terneros] = await Promise.all([
            Animal.find(filtroHembras).lean(),
            RegistroReproductivo.find().lean(),
            Animal.find({
                $and: [
                    crearFiltroEspecieAnimal('Bovino'),
                    { $or: [
                        { madre: { $exists: true, $ne: null } },
                        { madreDiio: { $exists: true, $ne: null } }
                    ] }
                ]
            }).lean()
        ]);
        const registrosPorAnimal = registros.reduce((mapa, registro) => {
            const animalId = registro.animal?.toString();
            if (!animalId) return mapa;
            if (!mapa.has(animalId)) mapa.set(animalId, []);
            mapa.get(animalId).push(registro);
            return mapa;
        }, new Map());

        const enEsperaPosparto = [];
        const vacas = hembras
            .map((vaca) => {
                const edadMeses = vaca.fechaNacimiento
                    ? Math.floor((fechaCorte - new Date(vaca.fechaNacimiento)) / (30.4375 * 24 * 60 * 60 * 1000))
                    : null;
                const registrosVaca = registrosPorAnimal.get(vaca._id.toString()) || [];
                const ultimoParto = obtenerUltimoParto(registrosVaca, fechaCorte);
                const gestacionActiva = tieneGestacionActiva(registrosVaca, fechaCorte);
                const diasAbierta = ultimoParto ? calcularDiasEntre(ultimoParto.fechaPartoReal, fechaCorte) : null;
                const esperandoPosparto = diasAbierta !== null && diasAbierta < diasEsperaPosparto;
                const destetesBajos = obtenerDestetesBajos(vaca, terneros, pesoDesteteMinNumero, fechaInicio, fechaFin);
                const motivos = [];

                if (edadMeses === null || edadMeses < 24) return null;

                if (!ultimoParto || new Date(ultimoParto.fechaPartoReal) < limiteParto) {
                    motivos.push('Sin parto reciente');
                }

                if (!gestacionActiva && !esperandoPosparto) {
                    motivos.push('Sin gestación activa');
                }

                if (ultimoParto && !gestacionActiva && !esperandoPosparto && diasAbierta > diasAbiertosNumero) {
                    motivos.push('Muchos días abiertos');
                }

                if (destetesBajos.length > 0) {
                    motivos.push('Destete bajo');
                }

                if (esperandoPosparto) {
                    enEsperaPosparto.push({
                        animalId: vaca._id,
                        diio: vaca.diio || vaca.identificadorFinca || '--',
                        nombre: vaca.nombre || '',
                        ultimoParto: ultimoParto?.fechaPartoReal || null,
                        diasPosparto: diasAbierta
                    });
                }
                if (motivos.length === 0) return null;

                return {
                    animalId: vaca._id,
                    diio: vaca.diio || vaca.identificadorFinca || '--',
                    nombre: vaca.nombre || '',
                    edadMeses,
                    ultimoParto: ultimoParto?.fechaPartoReal || null,
                    diasAbierta,
                    gestacionActiva,
                    destetesBajos: destetesBajos.map((ternero) => ({
                        animalId: ternero._id,
                        diio: ternero.diio || ternero.identificadorFinca || '--',
                        pesoDestete: ternero.pesoDestete,
                        fechaDestete: ternero.fechaDestete || null
                    })),
                    motivos
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.motivos.length - a.motivos.length || a.diio.localeCompare(b.diio, 'es', { numeric: true }));

        res.json({
            parametros: {
                mesesSinParto: mesesSinPartoNumero,
                diasAbiertos: diasAbiertosNumero,
                pesoDesteteMin: pesoDesteteMinNumero,
                diasEsperaPosparto,
                fechaInicio: fechaInicio || null,
                fechaFin: fechaFin || null
            },
            resumen: {
                totalVacasRevisar: vacas.length,
                sinPartoReciente: vacas.filter((vaca) => vaca.motivos.includes('Sin parto reciente')).length,
                sinGestacionActiva: vacas.filter((vaca) => vaca.motivos.includes('Sin gestación activa')).length,
                muchosDiasAbiertos: vacas.filter((vaca) => vaca.motivos.includes('Muchos días abiertos')).length,
                destetesBajos: vacas.filter((vaca) => vaca.motivos.includes('Destete bajo')).length,
                enPeriodoEsperaPosparto: enEsperaPosparto.length
            },
            vacas,
            enEsperaPosparto
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener vacas a revisar', error: error.message });
    }
};

reporteCtrl.getProductosResumen = async (req, res) => {
    try {
        const filtro = crearFiltroProductos(req.query);

        const [general, productosMasRegistrados, categoriasMasRegistradas, proveedoresMasUsados, totalPorCategoria] = await Promise.all([
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: { moneda: { $ifNull: ['$moneda', 'CRC'] } },
                        montoTotal: { $sum: '$monto' },
                        cantidadMovimientos: { $sum: 1 }
                    }
                }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                ...agregarCantidadProductoPipeline,
                {
                    $group: {
                        _id: {
                            producto: '$producto',
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        cantidadRegistros: { $sum: 1 },
                        cantidadTotal: { $sum: '$cantidadCompra' },
                        cantidadFisicaTotal: { $sum: '$cantidadFisica' },
                        montoTotal: { $sum: '$monto' },
                        categoria: { $first: '$categoria' },
                        unidadMedida: { $first: '$unidadNormalizada' },
                        unidadBase: { $first: '$unidadBase' }
                    }
                },
                { $sort: { cantidadFisicaTotal: -1, cantidadTotal: -1, cantidadRegistros: -1, montoTotal: -1 } },
                { $limit: 8 }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: {
                            categoria: '$categoria',
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        cantidadRegistros: { $sum: 1 },
                        montoTotal: { $sum: '$monto' }
                    }
                },
                { $sort: { cantidadRegistros: -1, montoTotal: -1 } },
                { $limit: 8 }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: { ...filtro, proveedor: { $exists: true, $nin: [null, ''] } } },
                {
                    $group: {
                        _id: {
                            proveedor: '$proveedor',
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        cantidadRegistros: { $sum: 1 },
                        montoTotal: { $sum: '$monto' },
                        ultimaCompra: { $max: '$fecha' }
                    }
                },
                { $sort: { cantidadRegistros: -1, montoTotal: -1 } },
                { $limit: 8 }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: {
                            categoria: '$categoria',
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ])
        ]);

        const monedas = crearMapaMonedas(() => ({ montoTotal: 0, cantidadMovimientos: 0 }));
        general.forEach((item) => {
            monedas[normalizarMoneda(item._id?.moneda)] = {
                montoTotal: item.montoTotal || 0,
                cantidadMovimientos: item.cantidadMovimientos || 0
            };
        });

        res.json({
            monedas,
            cantidadMovimientos: Object.values(monedas).reduce((total, item) => total + item.cantidadMovimientos, 0),
            productosMasRegistrados: productosMasRegistrados.map((item) => ({
                producto: item._id.producto || 'Sin producto',
                moneda: normalizarMoneda(item._id.moneda),
                categoria: item.categoria || 'Otros',
                unidadMedida: item.unidadMedida || 'sin unidad',
                cantidadTotal: item.cantidadTotal || 0,
                cantidadFisicaTotal: item.cantidadFisicaTotal || 0,
                unidadBase: item.unidadBase || item.unidadMedida || 'sin unidad',
                montoTotal: item.montoTotal || 0,
                cantidadRegistros: item.cantidadRegistros || 0
            })),
            categoriasMasRegistradas: categoriasMasRegistradas.map((item) => ({
                categoria: item._id.categoria || 'Otros',
                moneda: normalizarMoneda(item._id.moneda),
                cantidadRegistros: item.cantidadRegistros || 0,
                montoTotal: item.montoTotal || 0
            })),
            proveedoresMasUsados: proveedoresMasUsados.map((item) => ({
                proveedor: item._id.proveedor || 'Sin proveedor',
                moneda: normalizarMoneda(item._id.moneda),
                cantidadRegistros: item.cantidadRegistros || 0,
                montoTotal: item.montoTotal || 0,
                ultimaCompra: item.ultimaCompra || null
            })),
            totalPorCategoria: totalPorCategoria.map((item) => ({
                categoria: item._id.categoria || 'Otros',
                moneda: normalizarMoneda(item._id.moneda),
                total: item.total || 0,
                cantidad: item.cantidad || 0
            }))
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener resumen de productos', error: error.message });
    }
};

reporteCtrl.getProductosPorProducto = async (req, res) => {
    try {
        const filtro = crearFiltroProductos(req.query);
        const pagina = Math.max(Number.parseInt(req.query.pagina, 10) || 1, 1);
        const limiteSolicitado = Number.parseInt(req.query.limite, 10) || 10;
        const limite = [10, 25, 50].includes(limiteSolicitado) ? limiteSolicitado : 10;
        const resultado = await MovimientoFinanciero.aggregate([
            { $match: filtro },
            ...agregarCantidadProductoPipeline,
            {
                $group: {
                    _id: {
                        producto: '$producto',
                        categoria: '$categoria',
                        unidadMedida: '$unidadNormalizada',
                        unidadBase: '$unidadBase',
                        moneda: { $ifNull: ['$moneda', 'CRC'] }
                    },
                    cantidadTotal: { $sum: '$cantidadCompra' },
                    cantidadFisicaTotal: { $sum: '$cantidadFisica' },
                    montoTotal: { $sum: '$monto' },
                    cantidadRegistros: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    producto: '$_id.producto',
                    categoria: { $ifNull: ['$_id.categoria', 'Otros'] },
                    unidadMedida: '$_id.unidadMedida',
                    unidadBase: '$_id.unidadBase',
                    moneda: '$_id.moneda',
                    cantidadTotal: 1,
                    cantidadFisicaTotal: 1,
                    montoTotal: 1,
                    precioPromedio: {
                        $cond: [
                            { $gt: ['$cantidadFisicaTotal', 0] },
                            { $divide: ['$montoTotal', '$cantidadFisicaTotal'] },
                            0
                        ]
                    },
                    cantidadRegistros: 1
                }
            },
            { $sort: { montoTotal: -1, cantidadFisicaTotal: -1 } },
            {
                $facet: {
                    datos: [
                        { $skip: (pagina - 1) * limite },
                        { $limit: limite }
                    ],
                    conteo: [{ $count: 'total' }]
                }
            }
        ]);

        const total = resultado[0]?.conteo?.[0]?.total || 0;
        res.json({
            datos: resultado[0]?.datos || [],
            paginacion: {
                pagina,
                limite,
                total,
                totalPaginas: Math.max(Math.ceil(total / limite), 1)
            }
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener productos agrupados', error: error.message });
    }
};

reporteCtrl.getProductosPorCategoria = async (req, res) => {
    try {
        const filtro = crearFiltroProductos(req.query);
        const categorias = await MovimientoFinanciero.aggregate([
            { $match: filtro },
            ...agregarCantidadProductoPipeline,
            {
                $group: {
                    _id: {
                        categoria: '$categoria',
                        moneda: { $ifNull: ['$moneda', 'CRC'] }
                    },
                    cantidadTotal: { $sum: '$cantidadFisica' },
                    montoTotal: { $sum: '$monto' },
                    productosIncluidos: { $addToSet: '$producto' },
                    cantidadRegistros: { $sum: 1 }
                }
            },
            {
                $setWindowFields: {
                    partitionBy: '$_id.moneda',
                    output: {
                        totalGeneral: { $sum: '$montoTotal' }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    categoria: { $ifNull: ['$_id.categoria', 'Otros'] },
                    moneda: '$_id.moneda',
                    cantidadTotal: 1,
                    montoTotal: 1,
                    productosIncluidos: 1,
                    cantidadRegistros: 1,
                    porcentajeDelTotal: {
                        $cond: [
                            { $gt: ['$totalGeneral', 0] },
                            { $multiply: [{ $divide: ['$montoTotal', '$totalGeneral'] }, 100] },
                            0
                        ]
                    }
                }
            },
            { $sort: { montoTotal: -1 } }
        ]);

        res.json(categorias);
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener productos por categoria', error: error.message });
    }
};

reporteCtrl.getProductosCombustibles = async (req, res) => {
    try {
        const filtro = {
            ...crearFiltroProductos(req.query),
            categoria: { $regex: 'combustible', $options: 'i' }
        };

        const [general, consumoPorMes, proveedores] = await Promise.all([
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                ...agregarCantidadProductoPipeline,
                {
                    $group: {
                        _id: { moneda: { $ifNull: ['$moneda', 'CRC'] } },
                        litrosTotales: { $sum: '$cantidadFisica' },
                        montoTotal: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        moneda: '$_id.moneda',
                        litrosTotales: 1,
                        montoTotal: 1,
                        registros: 1,
                        precioPromedioLitro: {
                            $cond: [
                                { $gt: ['$litrosTotales', 0] },
                                { $divide: ['$montoTotal', '$litrosTotales'] },
                                0
                            ]
                        }
                    }
                }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                ...agregarCantidadProductoPipeline,
                {
                    $group: {
                        _id: {
                            anio: { $year: '$fecha' },
                            mes: { $month: '$fecha' },
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        litros: { $sum: '$cantidadFisica' },
                        montoTotal: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                { $sort: { '_id.anio': 1, '_id.mes': 1 } },
                {
                    $project: {
                        _id: 0,
                        anio: '$_id.anio',
                        mes: '$_id.mes',
                        moneda: '$_id.moneda',
                        litros: 1,
                        montoTotal: 1,
                        registros: 1
                    }
                }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: { ...filtro, proveedor: { $exists: true, $nin: [null, ''] } } },
                {
                    $group: {
                        _id: {
                            proveedor: '$proveedor',
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        registros: { $sum: 1 },
                        montoTotal: { $sum: '$monto' }
                    }
                },
                { $sort: { registros: -1, montoTotal: -1 } }
            ])
        ]);

        const monedas = crearMapaMonedas(() => ({
            litrosTotales: 0,
            montoTotal: 0,
            precioPromedioLitro: 0,
            registros: 0,
            proveedorMasUsado: null
        }));
        general.forEach((item) => {
            const moneda = normalizarMoneda(item.moneda);
            monedas[moneda] = {
                litrosTotales: item.litrosTotales || 0,
                montoTotal: item.montoTotal || 0,
                precioPromedioLitro: item.precioPromedioLitro || 0,
                registros: item.registros || 0,
                proveedorMasUsado: proveedores.find((proveedor) => normalizarMoneda(proveedor._id?.moneda) === moneda)?._id?.proveedor || null
            };
        });
        res.json({
            monedas,
            consumoPorMes,
            registros: Object.values(monedas).reduce((total, item) => total + item.registros, 0)
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener reporte de combustibles', error: error.message });
    }
};

reporteCtrl.getProductosPrecioPromedio = async (req, res) => {
    try {
        const filtro = crearFiltroProductos(req.query);
        const precios = await MovimientoFinanciero.aggregate([
            { $match: filtro },
            ...agregarCantidadProductoPipeline,
            {
                $group: {
                    _id: {
                        anio: { $year: '$fecha' },
                        mes: { $month: '$fecha' },
                        producto: '$producto',
                        unidadMedida: '$unidadBase',
                        moneda: { $ifNull: ['$moneda', 'CRC'] }
                    },
                    cantidadTotal: { $sum: '$cantidadFisica' },
                    montoTotal: { $sum: '$monto' }
                }
            },
            {
                $project: {
                    _id: 0,
                    anio: '$_id.anio',
                    mes: '$_id.mes',
                    producto: '$_id.producto',
                    unidadMedida: '$_id.unidadMedida',
                    moneda: '$_id.moneda',
                    cantidadTotal: 1,
                    montoTotal: 1,
                    precioPromedio: {
                        $cond: [
                            { $gt: ['$cantidadTotal', 0] },
                            { $divide: ['$montoTotal', '$cantidadTotal'] },
                            0
                        ]
                    }
                }
            },
            { $sort: { anio: 1, mes: 1, producto: 1 } }
        ]);

        res.json(precios);
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener precio promedio de productos', error: error.message });
    }
};

reporteCtrl.getProductosProveedores = async (req, res) => {
    try {
        const filtro = crearFiltroProductos(req.query);
        const proveedores = await MovimientoFinanciero.aggregate([
            { $match: { ...filtro, proveedor: { $exists: true, $nin: [null, ''] } } },
            {
                $group: {
                    _id: {
                        proveedor: '$proveedor',
                        moneda: { $ifNull: ['$moneda', 'CRC'] }
                    },
                    montoTotal: { $sum: '$monto' },
                    cantidadRegistros: { $sum: 1 },
                    productosComprados: { $addToSet: '$producto' },
                    ultimaCompra: { $max: '$fecha' }
                }
            },
            {
                $project: {
                    _id: 0,
                    proveedor: '$_id.proveedor',
                    moneda: '$_id.moneda',
                    montoTotal: 1,
                    cantidadRegistros: 1,
                    productosComprados: 1,
                    ultimaCompra: 1
                }
            },
            { $sort: { montoTotal: -1, cantidadRegistros: -1 } }
        ]);

        res.json(proveedores);
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener proveedores de productos', error: error.message });
    }
};

reporteCtrl.getProductosDestinos = async (req, res) => {
    try {
        const filtro = crearFiltroProductos(req.query);
        const destinos = await MovimientoFinanciero.aggregate([
            { $match: filtro },
            ...agregarCantidadProductoPipeline,
            {
                $addFields: {
                    destino: pipelineDestinoUso
                }
            },
            {
                $group: {
                    _id: {
                        destino: '$destino',
                        moneda: { $ifNull: ['$moneda', 'CRC'] }
                    },
                    productos: { $addToSet: '$producto' },
                    cantidadTotal: { $sum: '$cantidadFisica' },
                    montoTotal: { $sum: '$monto' },
                    cantidadRegistros: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    destino: '$_id.destino',
                    moneda: '$_id.moneda',
                    productos: 1,
                    cantidadTotal: 1,
                    montoTotal: 1,
                    cantidadRegistros: 1
                }
            },
            { $sort: { montoTotal: -1 } }
        ]);

        res.json(destinos);
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener destinos de productos', error: error.message });
    }
};

reporteCtrl.getProductosTop = async (req, res) => {
    try {
        const limite = Math.max(Number(req.query.limite) || 10, 1);
        const filtro = crearFiltroProductos(req.query);
        const productos = await MovimientoFinanciero.aggregate([
            { $match: filtro },
            ...agregarCantidadProductoPipeline,
            {
                $group: {
                    _id: {
                        producto: '$producto',
                        categoria: '$categoria',
                        unidadMedida: '$unidadNormalizada',
                        unidadBase: '$unidadBase',
                        moneda: { $ifNull: ['$moneda', 'CRC'] }
                    },
                    cantidadTotal: { $sum: '$cantidadCompra' },
                    cantidadFisicaTotal: { $sum: '$cantidadFisica' },
                    montoTotal: { $sum: '$monto' },
                    cantidadRegistros: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    producto: '$_id.producto',
                    categoria: { $ifNull: ['$_id.categoria', 'Otros'] },
                    unidadMedida: '$_id.unidadMedida',
                    unidadBase: '$_id.unidadBase',
                    moneda: '$_id.moneda',
                    cantidadTotal: 1,
                    cantidadFisicaTotal: 1,
                    montoTotal: 1,
                    cantidadRegistros: 1
                }
            },
            { $sort: { cantidadFisicaTotal: -1, montoTotal: -1, cantidadRegistros: -1 } },
            { $limit: limite }
        ]);

        res.json(productos);
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener top de productos', error: error.message });
    }
};

const crearFiltroTextoPorcino = () => ({
    $or: [
        { categoria: { $regex: 'porc|chan|cerd|lech', $options: 'i' } },
        { descripcion: { $regex: 'porc|chan|cerd|lech|camada', $options: 'i' } },
        { producto: { $regex: 'porc|chan|cerd|lech|camada', $options: 'i' } },
        { observaciones: { $regex: 'porc|chan|cerd|lech|camada', $options: 'i' } },
        { referenciaModelo: 'Camada' }
    ]
});

const crearFiltroCamadasPeriodo = (fechaInicio, fechaFin) => crearFiltroFechas('fechaNacimiento', fechaInicio, fechaFin);

const mapearCamadaResumen = (camada) => ({
    _id: camada._id,
    codigoCamada: camada.codigoCamada,
    madre: camada.madre ? {
        _id: camada.madre._id,
        diio: camada.madre.diio,
        identificadorFinca: camada.madre.identificadorFinca,
        nombre: camada.madre.nombre
    } : null,
    fechaNacimiento: camada.fechaNacimiento,
    fechaDesteteEstimada: camada.fechaDesteteEstimada,
    fechaDesteteReal: camada.fechaDesteteReal,
    nacidosTotales: camada.nacidosTotales || 0,
    nacidosVivos: camada.nacidosVivos || 0,
    nacidosMuertos: camada.nacidosMuertos || 0,
    momias: camada.momias || 0,
    destetados: camada.destetados || 0,
    muertosPreDestete: camada.muertosPreDestete || 0,
    criasParaFinca: camada.criasParaFinca || 0,
    criasParaVenta: camada.criasParaVenta || 0,
    criasParaEngorde: camada.criasParaEngorde || 0,
    destino: camada.destino,
    estado: camada.estado,
    tasaDestete: redondear(porcentaje(camada.destetados || 0, camada.nacidosVivos || 0)),
    mortalidadPreDestete: redondear(porcentaje(camada.muertosPreDestete || 0, camada.nacidosVivos || 0)),
    pesoPromedioNacimiento: camada.pesoPromedioNacimiento || 0,
    pesoPromedioDestete: camada.pesoPromedioDestete || 0,
    pesoTotalDestete: camada.pesoTotalDestete || 0
});

reporteCtrl.getReporteCamadas = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtro = crearFiltroCamadasPeriodo(fechaInicio, fechaFin);

        const [camadas, porEstado, porDestino] = await Promise.all([
            Camada.find(filtro).populate('madre', 'diio identificadorFinca nombre').sort({ fechaNacimiento: -1 }).lean(),
            Camada.aggregate([
                { $match: filtro },
                { $group: { _id: '$estado', cantidad: { $sum: 1 } } },
                { $sort: { cantidad: -1 } }
            ]),
            Camada.aggregate([
                { $match: filtro },
                { $group: { _id: '$destino', cantidad: { $sum: 1 } } },
                { $sort: { cantidad: -1 } }
            ])
        ]);

        const totales = camadas.reduce((acc, camada) => ({
            nacidosTotales: acc.nacidosTotales + (camada.nacidosTotales || 0),
            nacidosVivos: acc.nacidosVivos + (camada.nacidosVivos || 0),
            nacidosMuertos: acc.nacidosMuertos + (camada.nacidosMuertos || 0),
            momias: acc.momias + (camada.momias || 0),
            destetados: acc.destetados + (camada.destetados || 0),
            muertosPreDestete: acc.muertosPreDestete + (camada.muertosPreDestete || 0),
            criasParaFinca: acc.criasParaFinca + (camada.criasParaFinca || 0),
            criasParaVenta: acc.criasParaVenta + (camada.criasParaVenta || 0),
            criasParaEngorde: acc.criasParaEngorde + (camada.criasParaEngorde || 0)
        }), {
            nacidosTotales: 0,
            nacidosVivos: 0,
            nacidosMuertos: 0,
            momias: 0,
            destetados: 0,
            muertosPreDestete: 0,
            criasParaFinca: 0,
            criasParaVenta: 0,
            criasParaEngorde: 0
        });

        res.json({
            resumen: {
                totalCamadas: camadas.length,
                camadasActivas: camadas.filter((camada) => camada.estado === 'Activa').length,
                camadasDestetadas: camadas.filter((camada) => camada.estado === 'Destetada').length,
                ...totales,
                promedioVivosPorCamada: redondear(camadas.length ? totales.nacidosVivos / camadas.length : 0),
                promedioDestetadosPorCamada: redondear(camadas.length ? totales.destetados / camadas.length : 0),
                tasaDestete: redondear(porcentaje(totales.destetados, totales.nacidosVivos)),
                mortalidadPreDestete: redondear(porcentaje(totales.muertosPreDestete, totales.nacidosVivos))
            },
            porEstado: mapearGrupo(porEstado, 'estado'),
            porDestino: mapearGrupo(porDestino, 'destino'),
            camadas: camadas.map(mapearCamadaResumen)
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener reporte de camadas', error: error.message });
    }
};

reporteCtrl.getReporteReproductivoPorcino = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtroRegistros = {
            especie: 'Porcino',
            ...crearFiltroFechas('fechaInseminacion', fechaInicio, fechaFin)
        };
        const filtroCamadas = crearFiltroCamadasPeriodo(fechaInicio, fechaFin);

        const [registros, camadas] = await Promise.all([
            RegistroReproductivo.find(filtroRegistros).populate('animal', 'diio identificadorFinca nombre estado').sort({ fechaInseminacion: -1 }).lean(),
            Camada.find(filtroCamadas).populate('madre', 'diio identificadorFinca nombre').lean()
        ]);

        const camadasPorMadre = new Map();
        camadas.forEach((camada) => {
            const madreId = camada.madre?._id?.toString();
            if (!madreId) return;
            const actual = camadasPorMadre.get(madreId) || [];
            actual.push(camada);
            camadasPorMadre.set(madreId, actual);
        });

        const madres = new Map();
        registros.forEach((registro) => {
            const animal = registro.animal;
            if (!animal?._id) return;
            const id = animal._id.toString();
            const actual = madres.get(id) || {
                animal,
                ciclos: 0,
                activos: 0,
                cerrados: 0,
                noPrenada: 0,
                partos: 0,
                nacidosVivos: 0,
                destetados: 0,
                ultimoParto: null
            };
            actual.ciclos += 1;
            if ((registro.estadoCiclo || 'Activo') === 'Activo') actual.activos += 1;
            if (registro.estadoCiclo === 'Cerrado') actual.cerrados += 1;
            if (registro.estadoCiclo === 'No preñada') actual.noPrenada += 1;
            madres.set(id, actual);
        });

        camadas.forEach((camada) => {
            const madre = camada.madre;
            if (!madre?._id) return;
            const id = madre._id.toString();
            const actual = madres.get(id) || {
                animal: madre,
                ciclos: 0,
                activos: 0,
                cerrados: 0,
                noPrenada: 0,
                partos: 0,
                nacidosVivos: 0,
                destetados: 0,
                ultimoParto: null
            };
            actual.partos += 1;
            actual.nacidosVivos += camada.nacidosVivos || 0;
            actual.destetados += camada.destetados || 0;
            if (!actual.ultimoParto || new Date(camada.fechaNacimiento) > new Date(actual.ultimoParto)) {
                actual.ultimoParto = camada.fechaNacimiento;
            }
            madres.set(id, actual);
        });

        const totalNacidosVivos = camadas.reduce((total, camada) => total + (camada.nacidosVivos || 0), 0);
        const totalDestetados = camadas.reduce((total, camada) => total + (camada.destetados || 0), 0);

        res.json({
            resumen: {
                ciclosRegistrados: registros.length,
                ciclosActivos: registros.filter((registro) => (registro.estadoCiclo || 'Activo') === 'Activo').length,
                ciclosNoPrenada: registros.filter((registro) => registro.estadoCiclo === 'No preñada').length,
                partosRegistrados: camadas.length,
                nacidosVivos: totalNacidosVivos,
                destetados: totalDestetados,
                tasaPartoPorCiclo: redondear(porcentaje(camadas.length, registros.length)),
                tasaDestete: redondear(porcentaje(totalDestetados, totalNacidosVivos))
            },
            madres: Array.from(madres.values()).map((item) => ({
                animalId: item.animal._id,
                diio: item.animal.diio || item.animal.identificadorFinca,
                nombre: item.animal.nombre,
                ciclos: item.ciclos,
                activos: item.activos,
                cerrados: item.cerrados,
                noPrenada: item.noPrenada,
                partos: item.partos,
                nacidosVivos: item.nacidosVivos,
                destetados: item.destetados,
                tasaDestete: redondear(porcentaje(item.destetados, item.nacidosVivos)),
                ultimoParto: item.ultimoParto,
                camadas: (camadasPorMadre.get(item.animal._id.toString()) || []).map(mapearCamadaResumen)
            })).sort((a, b) => b.partos - a.partos || b.nacidosVivos - a.nacidosVivos)
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener reporte reproductivo porcino', error: error.message });
    }
};

reporteCtrl.getReporteTareasCamadas = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtroCamadas = crearFiltroCamadasPeriodo(fechaInicio, fechaFin);
        const camadas = await Camada.find(filtroCamadas).populate('madre', 'diio identificadorFinca nombre').lean();
        const camadaIds = camadas.map((camada) => camada._id);
        const filtroTareas = {
            referenciaId: { $in: camadaIds },
            moduloOrigen: 'Reproduccion',
            creadoAutomaticamente: true
        };

        const tareas = await Tarea.find(filtroTareas).sort({ fechaProgramada: 1 }).lean();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const tareasPorCamada = new Map();
        tareas.forEach((tarea) => {
            const key = tarea.referenciaId?.toString();
            const actual = tareasPorCamada.get(key) || [];
            actual.push(tarea);
            tareasPorCamada.set(key, actual);
        });

        const contarEstado = (estado) => tareas.filter((tarea) => tarea.estado === estado).length;
        const vencidas = tareas.filter((tarea) => {
            if (['Completada', 'Cancelada'].includes(tarea.estado) || !tarea.fechaProgramada) return false;
            const fecha = new Date(tarea.fechaProgramada);
            fecha.setHours(0, 0, 0, 0);
            return fecha < hoy;
        }).length;

        res.json({
            resumen: {
                camadasConTareas: camadas.filter((camada) => (tareasPorCamada.get(camada._id.toString()) || []).length > 0).length,
                totalTareas: tareas.length,
                pendientes: contarEstado('Pendiente'),
                enProceso: contarEstado('En proceso'),
                completadas: contarEstado('Completada'),
                canceladas: contarEstado('Cancelada'),
                vencidas
            },
            porCategoria: mapearGrupo(
                await Tarea.aggregate([
                    { $match: filtroTareas },
                    { $group: { _id: '$categoriaAutomatica', cantidad: { $sum: 1 } } },
                    { $sort: { cantidad: -1 } }
                ]),
                'categoria'
            ),
            camadas: camadas.map((camada) => {
                const tareasCamada = tareasPorCamada.get(camada._id.toString()) || [];
                return {
                    ...mapearCamadaResumen(camada),
                    tareas: tareasCamada.map((tarea) => ({
                        _id: tarea._id,
                        titulo: tarea.titulo,
                        tipo: tarea.tipo,
                        estado: tarea.estado,
                        prioridad: tarea.prioridad,
                        fechaProgramada: tarea.fechaProgramada,
                        categoriaAutomatica: tarea.categoriaAutomatica,
                        claveAutomatica: tarea.claveAutomatica
                    })),
                    resumenTareas: {
                        total: tareasCamada.length,
                        pendientes: tareasCamada.filter((tarea) => tarea.estado === 'Pendiente').length,
                        completadas: tareasCamada.filter((tarea) => tarea.estado === 'Completada').length,
                        canceladas: tareasCamada.filter((tarea) => tarea.estado === 'Cancelada').length
                    }
                };
            })
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener tareas por camada', error: error.message });
    }
};

reporteCtrl.getReporteEconomicoCamadas = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtroCamadas = crearFiltroCamadasPeriodo(fechaInicio, fechaFin);
        const camadas = await Camada.find(filtroCamadas).populate('madre', 'diio identificadorFinca nombre').lean();
        const camadaIds = camadas.map((camada) => camada._id);
        const filtroFinanzasPeriodo = crearFiltroFechas('fecha', fechaInicio, fechaFin);
        const filtroPorcino = {
            ...filtroFinanzasPeriodo,
            ...crearFiltroTextoPorcino()
        };
        const filtroDirecto = {
            ...filtroFinanzasPeriodo,
            referenciaId: { $in: camadaIds }
        };

        const [movimientosPorcinos, movimientosDirectos] = await Promise.all([
            MovimientoFinanciero.find(filtroPorcino).lean(),
            MovimientoFinanciero.find(filtroDirecto).lean()
        ]);

        const idsDirectos = new Set(movimientosDirectos.map((movimiento) => movimiento._id.toString()));
        const movimientos = [
            ...movimientosDirectos,
            ...movimientosPorcinos.filter((movimiento) => !idsDirectos.has(movimiento._id.toString()))
        ];
        const { asignaciones, resumenMonedas, cobertura } = asignarEconomiaPorCamada({ camadaIds, movimientos });
        const totalCriasVivas = camadas.reduce((total, camada) => total + (camada.nacidosVivos || 0), 0);
        const totalCriasDestetadas = camadas.reduce((total, camada) => total + (camada.destetados || 0), 0);
        Object.values(resumenMonedas).forEach((resumen) => {
            resumen.costoPromedioPorCamada = camadas.length
                ? redondear(resumen.egresosPorcinos / camadas.length)
                : 0;
            resumen.ingresoPromedioPorCamada = camadas.length
                ? redondear(resumen.ingresosPorcinos / camadas.length)
                : 0;
            resumen.costoPorCriaViva = totalCriasVivas
                ? redondear(resumen.egresosPorcinos / totalCriasVivas)
                : null;
            resumen.costoPorCriaDestetada = totalCriasDestetadas
                ? redondear(resumen.egresosPorcinos / totalCriasDestetadas)
                : null;
        });
        const detalleCamadas = camadas.map((camada) => {
            const asignacion = asignaciones[camada._id.toString()] || {
                monedas: crearMapaMonedas(() => ({
                    ingresosDirectos: 0,
                    egresosDirectos: 0,
                    ingresoIndirectoAsignado: 0,
                    egresoIndirectoAsignado: 0,
                    ingresoAsignado: 0,
                    costoAsignado: 0
                })),
                movimientosDirectos: 0
            };
            const monedas = crearMapaMonedas((moneda) => {
                const datos = asignacion.monedas[moneda];
                return {
                    ingresosDirectos: datos.ingresosDirectos,
                    egresosDirectos: datos.egresosDirectos,
                    ingresoIndirectoAsignado: datos.ingresoIndirectoAsignado,
                    egresoIndirectoAsignado: datos.egresoIndirectoAsignado,
                    costoEstimado: datos.costoAsignado,
                    ingresoEstimado: datos.ingresoAsignado,
                    margenEstimado: redondear(datos.ingresoAsignado - datos.costoAsignado),
                    costoPorCriaViva: camada.nacidosVivos
                        ? redondear(datos.costoAsignado / camada.nacidosVivos)
                        : null,
                    costoPorCriaDestetada: camada.destetados
                        ? redondear(datos.costoAsignado / camada.destetados)
                        : null
                };
            });
            return {
                ...mapearCamadaResumen(camada),
                monedas,
                movimientosDirectos: asignacion.movimientosDirectos
            };
        });

        res.json({
            resumen: {
                camadasEvaluadas: camadas.length,
                movimientosPorcinos: movimientos.length,
                monedas: resumenMonedas,
                cobertura: {
                    ...cobertura,
                    criasDestetadasConDenominador: totalCriasDestetadas,
                    costoPorDestetadoDisponible: totalCriasDestetadas > 0
                },
                criterioAsignacionIndirecta: cobertura.criterioIndirectos
            },
            camadas: detalleCamadas
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener reporte economico por camada', error: error.message });
    }
};

reporteCtrl.getReporteSanidad = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, especie } = req.query;
        const filtroAplicaciones = {
            ...crearFiltroFechas('fechaAplicacion', fechaInicio, fechaFin),
            ...(especie ? { especie } : {})
        };
        const filtroTratamientosPeriodo = {
            ...crearFiltroFechas('fechaInicio', fechaInicio, fechaFin),
            ...(especie ? { especie } : {})
        };
        const filtroEspecie = especie ? { especie } : {};

        const [
            totalAplicaciones,
            aplicacionesPorNaturaleza,
            tratamientosPorEstado,
            productosMasAplicados,
            animalesMasTratados,
            proximosTratamientos,
            proximosPlanes
        ] = await Promise.all([
            AplicacionSanitaria.countDocuments(filtroAplicaciones),
            AplicacionSanitaria.aggregate([
                { $match: filtroAplicaciones },
                { $group: { _id: '$naturaleza', cantidad: { $sum: 1 } } },
                { $sort: { cantidad: -1 } }
            ]),
            TratamientoSanitario.aggregate([
                { $match: filtroTratamientosPeriodo },
                { $group: { _id: '$estado', cantidad: { $sum: 1 } } },
                { $sort: { cantidad: -1 } }
            ]),
            AplicacionSanitaria.aggregate([
                { $match: filtroAplicaciones },
                { $group: { _id: '$producto', cantidad: { $sum: 1 } } },
                { $sort: { cantidad: -1, _id: 1 } },
                { $limit: 8 }
            ]),
            AplicacionSanitaria.aggregate([
                { $match: { ...filtroAplicaciones, naturaleza: 'Tratamiento' } },
                { $unwind: '$animales' },
                { $group: { _id: '$animales', cantidad: { $sum: 1 }, organizacionId: { $first: '$organizacionId' } } },
                { $sort: { cantidad: -1 } },
                { $limit: 8 },
                {
                    $lookup: {
                        from: 'animals',
                        let: { animalId: '$_id', organizacionId: '$organizacionId' },
                        pipeline: [{
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$_id', '$$animalId'] },
                                        { $eq: ['$organizacionId', '$$organizacionId'] }
                                    ]
                                }
                            }
                        }],
                        as: 'animal'
                    }
                },
                { $unwind: { path: '$animal', preserveNullAndEmptyArrays: true } }
            ]),
            TratamientoSanitario.find({
                ...filtroEspecie,
                estado: 'Activo',
                proximaAplicacion: { $ne: null }
            })
                .populate('animales', 'diio identificadorFinca nombre')
                .sort({ proximaAplicacion: 1 })
                .limit(8)
                .lean(),
            PlanSanitario.find({
                ...crearFiltroEspecieAnimal(especie),
                estado: { $in: ['Próximo', 'Vencido'] }
            })
                .sort({ proximaAplicacion: 1 })
                .limit(8)
                .lean()
        ]);

        res.json({
            filtros: { fechaInicio: fechaInicio || null, fechaFin: fechaFin || null, especie: especie || null },
            totalAplicaciones,
            aplicacionesPorNaturaleza: aplicacionesPorNaturaleza.map((item) => ({
                naturaleza: item._id === 'Aplicacion unica' ? 'Aplicación única' : item._id,
                cantidad: item.cantidad
            })),
            tratamientosPorEstado: tratamientosPorEstado.map((item) => ({
                estado: item._id,
                cantidad: item.cantidad
            })),
            productosMasAplicados: productosMasAplicados.map((item) => ({
                producto: item._id,
                cantidad: item.cantidad
            })),
            animalesMasTratados: animalesMasTratados.map((item) => ({
                animalId: item._id,
                diio: item.animal?.diio || item.animal?.identificadorFinca,
                nombre: item.animal?.nombre,
                cantidad: item.cantidad
            })),
            proximosTratamientos,
            proximosPlanes
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener reporte sanitario', error: error.message });
    }
};

reporteCtrl.getReporteComprasAnimales = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, especie, sexo, proveedor, raza } = req.query;
        const filtroCompras = {
            estado: 'Confirmada',
            ...crearFiltroFechas('fechaCompra', fechaInicio, fechaFin),
            ...crearFiltroEspecieCompra(especie)
        };
        const compras = await CompraAnimal.find(filtroCompras)
            .sort({ fechaCompra: 1, createdAt: 1 })
            .lean();
        const idsAnimales = [...new Set(compras.flatMap((compra) => (
            (compra.animales || []).map((item) => String(item.animal || '')).filter(Boolean)
        )))];

        const filtroIds = { $in: idsAnimales };
        const fechaCompraMasAntigua = compras.reduce((fechaMinima, compra) => {
            const fecha = new Date(compra.fechaCompra);
            return !fechaMinima || fecha < fechaMinima ? fecha : fechaMinima;
        }, null);
        const filtroFechaSeguimiento = fechaCompraMasAntigua ? { $gte: fechaCompraMasAntigua } : undefined;
        const [animales, pesajes, tratamientos] = idsAnimales.length
            ? await Promise.all([
                Animal.find({ _id: filtroIds }).lean(),
                Pesaje.find({
                    animal: filtroIds,
                    ...(filtroFechaSeguimiento ? { fecha: filtroFechaSeguimiento } : {})
                }).sort({ fecha: 1 }).lean(),
                TratamientoSanitario.find({
                    animales: filtroIds,
                    ...(filtroFechaSeguimiento ? { fechaInicio: filtroFechaSeguimiento } : {})
                }).select('animales fechaInicio estado').lean()
            ])
            : [[], [], []];

        res.json(construirReporteCompras({
            compras,
            animales,
            pesajes,
            tratamientos,
            filtros: { especie, sexo, proveedor, raza }
        }));
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener el reporte de compras de animales', error: error.message });
    }
};

reporteCtrl.getResumenReportes = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, partosFechaInicio, partosFechaFin, diio, especie } = req.query;
        const filtroFinanzas = crearFiltroFechas('fecha', fechaInicio, fechaFin);
        const filtroDrone = crearFiltroFechas('fechaVuelo', fechaInicio, fechaFin);
        const especieInventarioGanado = especie === 'Porcino' ? 'Porcino' : 'Bovino';
        const filtroAnimales = crearFiltroEspecieAnimal(especieInventarioGanado);
        const incluyeBovinos = especie !== 'Porcino';
        const idsEspecie = incluyeBovinos ? await obtenerIdsAnimalesPorEspecie('Bovino') : [];
        const filtroReproduccion = idsEspecie ? { animal: { $in: idsEspecie } } : {};
        const filtroSanidad = crearFiltroEspecieAnimal(especie);
        const incluyeAnaliticaProductiva = await tieneFeature('analiticaProductiva', req.organizacionId);

        const [
            totalAnimales,
            animalesPorSexo,
            animalesPorEstado,
            pesoPromedio,
            totalPotreros,
            potrerosPorEstado,
            planesPorEstado,
            alertasSanidad,
            rotacionesActivas,
            finanzasPorNaturaleza,
            finanzasPorTipo,
            finanzasPorCategoria,
            finanzasPorMes,
            gastosPorMes,
            totalConteosDrone,
            conteosDronePorEstado,
            reportePartos
        ] = await Promise.all([
            Animal.countDocuments(filtroAnimales),
            agruparPorCampo(Animal, 'sexo', filtroAnimales),
            agruparPorCampo(Animal, 'estado', filtroAnimales),
            Animal.aggregate([
                { $match: { ...filtroAnimales, pesoActual: { $gt: 0 } } },
                {
                    $group: {
                        _id: null,
                        promedio: { $avg: '$pesoActual' },
                        cantidad: { $sum: 1 }
                    }
                }
            ]),
            Potrero.countDocuments(),
            agruparPorCampo(Potrero, 'estado'),
            agruparPorCampo(PlanSanitario, 'estado', filtroSanidad),
            PlanSanitario.find({ ...filtroSanidad, estado: { $in: ['Próximo', 'Vencido'] } })
                .sort({ proximaAplicacion: 1 })
                .limit(8),
            RotacionPotrero.find({ estado: 'Activa' })
                .populate('potrero')
                .sort({ fechaEntrada: -1 })
                .limit(8),
            MovimientoFinanciero.aggregate([
                { $match: filtroFinanzas },
                {
                    $group: {
                        _id: {
                            naturaleza: '$naturaleza',
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtroFinanzas },
                {
                    $group: {
                        _id: {
                            tipoMovimiento: '$tipoMovimiento',
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: { ...filtroFinanzas, naturaleza: 'Egreso' } },
                {
                    $group: {
                        _id: {
                            categoria: '$categoria',
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } },
                { $limit: 8 }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtroFinanzas },
                {
                    $group: {
                        _id: {
                            anio: { $year: '$fecha' },
                            mes: { $month: '$fecha' },
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { '_id.anio': 1, '_id.mes': 1 } }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: { ...filtroFinanzas, naturaleza: 'Egreso' } },
                {
                    $group: {
                        _id: {
                            anio: { $year: '$fecha' },
                            mes: { $month: '$fecha' },
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { '_id.anio': 1, '_id.mes': 1 } }
            ]),
            ConteoDrone.countDocuments(filtroDrone),
            agruparPorCampo(ConteoDrone, 'estado', filtroDrone),
            incluyeAnaliticaProductiva && incluyeBovinos
                ? crearReportePartos({
                    fechaInicio: partosFechaInicio || fechaInicio,
                    fechaFin: partosFechaFin || fechaFin,
                    diio,
                    filtroExtra: filtroReproduccion
                })
                : Promise.resolve({
                    bloqueado: !incluyeAnaliticaProductiva,
                    aplica: incluyeBovinos,
                    feature: 'analiticaProductiva',
                    resumen: {},
                    anios: [],
                    porVaca: []
                })
        ]);

        res.json({
            filtros: {
                fechaInicio: fechaInicio || null,
                fechaFin: fechaFin || null,
                partosFechaInicio: partosFechaInicio || fechaInicio || null,
                partosFechaFin: partosFechaFin || fechaFin || null,
                diio: diio || null,
                especie: especie || null
            },
            inventario: {
                totalAnimales,
                porSexo: mapearGrupo(animalesPorSexo, 'sexo'),
                porEstado: mapearGrupo(animalesPorEstado, 'estado'),
                pesoPromedio: pesoPromedio[0]?.promedio || 0,
                animalesConPeso: pesoPromedio[0]?.cantidad || 0
            },
            potreros: {
                totalPotreros,
                porEstado: mapearGrupo(potrerosPorEstado, 'estado'),
                rotacionesActivas
            },
            sanidad: {
                porEstado: mapearGrupo(planesPorEstado, 'estado'),
                alertas: alertasSanidad
            },
            finanzas: {
                porNaturaleza: finanzasPorNaturaleza.map((item) => ({
                    naturaleza: item._id.naturaleza || 'Sin definir',
                    moneda: normalizarMoneda(item._id.moneda),
                    total: item.total,
                    cantidad: item.cantidad
                })),
                porTipo: finanzasPorTipo.map((item) => ({
                    tipoMovimiento: item._id.tipoMovimiento || 'Sin definir',
                    moneda: normalizarMoneda(item._id.moneda),
                    total: item.total,
                    cantidad: item.cantidad
                })),
                porCategoria: finanzasPorCategoria.map((item) => ({
                    categoria: item._id.categoria || 'Sin definir',
                    moneda: normalizarMoneda(item._id.moneda),
                    total: item.total,
                    cantidad: item.cantidad
                })),
                porMes: finanzasPorMes.map((item) => ({
                    anio: item._id.anio,
                    mes: item._id.mes,
                    moneda: normalizarMoneda(item._id.moneda),
                    total: item.total,
                    cantidad: item.cantidad
                })),
                gastosPorMes: gastosPorMes.map((item) => ({
                    anio: item._id.anio,
                    mes: item._id.mes,
                    moneda: normalizarMoneda(item._id.moneda),
                    total: item.total,
                    cantidad: item.cantidad
                }))
            },
            drone: {
                totalConteos: totalConteosDrone,
                porEstado: mapearGrupo(conteosDronePorEstado, 'estado')
            },
            reproduccion: {
                partos: reportePartos
            }
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: 'Error al obtener reportes', error: error.message });
    }
};

module.exports = reporteCtrl;
