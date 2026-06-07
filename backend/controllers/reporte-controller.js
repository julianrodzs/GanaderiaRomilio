const Animal = require('../models/Animal');
const Potrero = require('../models/Potrero');
const { PlanSanitario } = require('../models/PlanSanitario');
const RotacionPotrero = require('../models/RotacionPotrero');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const ConteoDrone = require('../models/ConteoDrone');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');

const reporteCtrl = {};

const crearFiltroFechas = (campo, fechaInicio, fechaFin) => {
    const filtro = {};

    if (fechaInicio || fechaFin) {
        filtro[campo] = {};
        if (fechaInicio) filtro[campo].$gte = new Date(fechaInicio);
        if (fechaFin) {
            const fechaFinDia = new Date(fechaFin);
            fechaFinDia.setUTCHours(23, 59, 59, 999);
            filtro[campo].$lte = fechaFinDia;
        }
    }

    return filtro;
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

const crearFiltroPeriodo = (campo, fechaInicio, fechaFin) => {
    const filtro = crearFiltroFechas(campo, fechaInicio, fechaFin);
    return filtro[campo] || {};
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

const obtenerInicioPeriodo = (fechaInicio) => {
    if (fechaInicio) return new Date(fechaInicio);

    const hoy = new Date();
    return new Date(Date.UTC(hoy.getUTCFullYear(), 0, 1));
};

const esVacaReproductora = (animal, animalesConRegistroReproductivo = new Set()) => {
    if (animal.sexo !== 'Hembra' || ['Muerto', 'Vendido'].includes(animal.estado)) return false;
    const edadMeses = calcularEdadMeses(animal.fechaNacimiento);
    return edadMeses >= 24 || animalesConRegistroReproductivo.has(animal._id.toString());
};

const obtenerVacasReproductoras = async () => {
    const [hembras, registros] = await Promise.all([
        Animal.find({ sexo: 'Hembra' }),
        RegistroReproductivo.find().select('animal')
    ]);
    const animalesConRegistro = new Set(registros.map((registro) => registro.animal?.toString()).filter(Boolean));

    return hembras.filter((animal) => esVacaReproductora(animal, animalesConRegistro));
};

const obtenerVacasGestantes = async () => {
    const registros = await RegistroReproductivo.find({
        fechaPartoEstimada: { $exists: true, $ne: null },
        $or: [
            { fechaPartoReal: { $exists: false } },
            { fechaPartoReal: null }
        ]
    }).select('animal');

    return new Set(registros.map((registro) => registro.animal?.toString()).filter(Boolean)).size;
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

const categoriasInversion = ['ganado', 'animal', 'animales', 'novillo', 'novillos', 'vaca', 'vacas', 'toro', 'toros', 'ternero', 'terneros', 'finca', 'fincas', 'infraestructura', 'cerca', 'cercas', 'corral', 'corrales', 'maquinaria', 'inversion', 'inversión'];
const categoriasOperativas = ['vacuna', 'vacunas', 'desparasitante', 'desparasitantes', 'sales', 'sal', 'medicamento', 'medicamentos', 'salario', 'salarios', 'mano de obra', 'combustible', 'mantenimiento', 'veterinario', 'sanidad', 'alimentacion', 'alimentación'];

const contieneCategoria = (movimiento, palabras) => {
    const texto = [
        movimiento.tipoMovimiento,
        movimiento.categoria,
        movimiento.descripcion,
        movimiento.observaciones
    ].filter(Boolean).join(' ').toLowerCase();

    return palabras.some((palabra) => texto.includes(palabra));
};

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
    return movimiento.tipoMovimiento === 'Inversion' || contieneCategoria(movimiento, categoriasInversion);
};

const esMovimientoIngreso = (movimiento) => movimiento.naturaleza === 'Ingreso';

const esMovimientoGastoOperativo = (movimiento) => {
    if (movimiento.naturaleza !== 'Egreso') return false;
    if (esMovimientoInversion(movimiento)) return false;
    return movimiento.tipoMovimiento === 'Planilla'
        || movimiento.tipoMovimiento === 'Compra'
        || contieneCategoria(movimiento, categoriasOperativas);
};

reporteCtrl.getProductividadCria = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtroPartos = crearFiltroFechas('fechaPartoReal', fechaInicio, fechaFin);
        filtroPartos.fechaPartoReal = {
            ...(filtroPartos.fechaPartoReal || {}),
            $exists: true,
            $ne: null
        };

        const filtroDestetes = crearFiltroFechas('fechaDestete', fechaInicio, fechaFin);
        filtroDestetes.fechaDestete = {
            ...(filtroDestetes.fechaDestete || {}),
            $exists: true,
            $ne: null
        };

        const periodoMuertes = crearFiltroPeriodo('updatedAt', fechaInicio, fechaFin);
        const filtroMuertes = { estado: 'Muerto' };
        if (Object.keys(periodoMuertes).length) {
            filtroMuertes.updatedAt = periodoMuertes;
        }

        const [
            vacasReproductorasLista,
            ternerosNacidosPeriodo,
            ternerosDestetadosPeriodo,
            vacasGestantes,
            muertesPeriodo,
            totalAnimales
        ] = await Promise.all([
            obtenerVacasReproductoras(),
            RegistroReproductivo.countDocuments(filtroPartos),
            RegistroReproductivo.countDocuments(filtroDestetes),
            obtenerVacasGestantes(),
            Animal.countDocuments(filtroMuertes),
            Animal.countDocuments()
        ]);

        const vacasReproductoras = vacasReproductorasLista.length;
        const tasaNatalidad = redondear(porcentaje(ternerosNacidosPeriodo, vacasReproductoras));
        const tasaDestete = redondear(porcentaje(ternerosDestetadosPeriodo, ternerosNacidosPeriodo));
        const tasaGestacion = redondear(porcentaje(vacasGestantes, vacasReproductoras));
        const tasaSupervivencia = totalAnimales > 0
            ? redondear(Math.max(Math.min((1 - (muertesPeriodo / totalAnimales)) * 100, 100), 0))
            : 0;
        const ipg = redondear(
            tasaNatalidad * 0.40
            + tasaDestete * 0.25
            + tasaGestacion * 0.20
            + tasaSupervivencia * 0.15
        );

        res.json({
            ipg,
            clasificacion: clasificarIpg(ipg),
            tasaNatalidad,
            tasaDestete,
            tasaGestacion,
            tasaSupervivencia,
            ternerosNacidosPeriodo,
            ternerosDestetadosPeriodo,
            vacasReproductoras,
            vacasGestantes,
            muertesPeriodo,
            totalAnimales,
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
        res.status(500).json({ mensaje: 'Error al obtener productividad de cria', error: error.message });
    }
};

reporteCtrl.getFinanzasCria = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtroPeriodo = crearFiltroFechas('fecha', fechaInicio, fechaFin);
        const inicioPeriodo = obtenerInicioPeriodo(fechaInicio);

        const [movimientos, movimientosPeriodo, animales] = await Promise.all([
            MovimientoFinanciero.find().lean(),
            MovimientoFinanciero.find(filtroPeriodo).lean(),
            Animal.find().lean()
        ]);

        const inversionAcumulada = sumarMovimientos(movimientos.filter((movimiento) => {
            return movimiento.naturaleza !== 'Ingreso' && esMovimientoInversion(movimiento);
        }));
        const gastosOperativosPeriodo = sumarMovimientos(movimientosPeriodo.filter(esMovimientoGastoOperativo));
        const ingresosPeriodo = sumarMovimientos(movimientosPeriodo.filter(esMovimientoIngreso));
        const animalesActivos = animales.filter((animal) => !['Muerto', 'Vendido'].includes(animal.estado));
        const animalesActuales = animalesActivos.length;
        const animalesInicioPeriodo = animales.filter((animal) => {
            if (['Muerto', 'Vendido'].includes(animal.estado)) return false;
            if (!animal.createdAt) return false;
            return new Date(animal.createdAt) <= inicioPeriodo;
        }).length;
        const valorEstimadoHato = sumarMovimientos(animalesActivos.map((animal) => ({ monto: calcularValorAnimal(animal) })));

        res.json({
            inversionAcumulada: redondear(inversionAcumulada),
            gastosOperativosPeriodo: redondear(gastosOperativosPeriodo),
            ingresosPeriodo: redondear(ingresosPeriodo),
            balanceOperativo: redondear(ingresosPeriodo - gastosOperativosPeriodo),
            valorEstimadoHato: redondear(valorEstimadoHato),
            crecimientoHato: animalesActuales - animalesInicioPeriodo,
            animalesInicioPeriodo,
            animalesActuales,
            patrimonioGanaderoEstimado: redondear(valorEstimadoHato + inversionAcumulada)
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener finanzas de cria', error: error.message });
    }
};

reporteCtrl.getSustentabilidadCria = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const filtroPeriodo = crearFiltroFechas('fecha', fechaInicio, fechaFin);

        const [animales, movimientosPeriodo] = await Promise.all([
            Animal.find().lean(),
            MovimientoFinanciero.find(filtroPeriodo).lean()
        ]);

        const comprasAnimales = animales.filter((animal) => {
            return animal.montoCompra > 0 && estaFechaEnPeriodo(animal.fechaCompra, fechaInicio, fechaFin);
        });
        const ventasAnimales = animales.filter((animal) => {
            return animal.estado === 'Vendido'
                && animal.montoVenta > 0
                && estaFechaEnPeriodo(animal.fechaVenta, fechaInicio, fechaFin);
        });
        const montoComprasAnimales = sumarMovimientos(comprasAnimales.map((animal) => ({ monto: animal.montoCompra })));
        const montoVentasAnimales = sumarMovimientos(ventasAnimales.map((animal) => ({ monto: animal.montoVenta })));
        const gastosOperativosPeriodo = sumarMovimientos(movimientosPeriodo.filter(esMovimientoGastoOperativo));
        const margenSustentabilidad = montoVentasAnimales - montoComprasAnimales - gastosOperativosPeriodo;

        res.json({
            montoVentasAnimales: redondear(montoVentasAnimales),
            montoComprasAnimales: redondear(montoComprasAnimales),
            gastosOperativosPeriodo: redondear(gastosOperativosPeriodo),
            margenSustentabilidad: redondear(margenSustentabilidad),
            animalesCompradosPeriodo: comprasAnimales.length,
            animalesVendidosPeriodo: ventasAnimales.length,
            formula: 'ventas de animales - compras de animales - gastos operativos',
            criterioFechas: {
                compras: 'fechaCompra del animal',
                ventas: 'fechaVenta del animal cuando estado es Vendido',
                gastosOperativos: 'fecha del movimiento financiero'
            }
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener sustentabilidad de cria', error: error.message });
    }
};


const crearReportePartos = async ({ fechaInicio, fechaFin, diio }) => {
    const filtroPartos = crearFiltroFechas('fechaPartoReal', fechaInicio, fechaFin);
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

        filtroPartos.animal = { $in: animales.map((animal) => animal._id) };
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

reporteCtrl.getResumenReportes = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, diio } = req.query;
        const filtroFinanzas = crearFiltroFechas('fecha', fechaInicio, fechaFin);
        const filtroDrone = crearFiltroFechas('fechaVuelo', fechaInicio, fechaFin);

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
            totalConteosDrone,
            conteosDronePorEstado,
            reportePartos
        ] = await Promise.all([
            Animal.countDocuments(),
            agruparPorCampo(Animal, 'sexo'),
            agruparPorCampo(Animal, 'estado'),
            Animal.aggregate([
                { $match: { pesoActual: { $gt: 0 } } },
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
            agruparPorCampo(PlanSanitario, 'estado'),
            PlanSanitario.find({ estado: { $in: ['Próximo', 'Vencido'] } })
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
                        _id: '$naturaleza',
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
                        _id: '$tipoMovimiento',
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
                        _id: '$categoria',
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
                            mes: { $month: '$fecha' }
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { '_id.anio': 1, '_id.mes': 1 } }
            ]),
            ConteoDrone.countDocuments(filtroDrone),
            agruparPorCampo(ConteoDrone, 'estado', filtroDrone),
            crearReportePartos({ fechaInicio, fechaFin, diio })
        ]);

        res.json({
            filtros: {
                fechaInicio: fechaInicio || null,
                fechaFin: fechaFin || null,
                diio: diio || null
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
                    naturaleza: item._id || 'Sin definir',
                    total: item.total,
                    cantidad: item.cantidad
                })),
                porTipo: finanzasPorTipo.map((item) => ({
                    tipoMovimiento: item._id || 'Sin definir',
                    total: item.total,
                    cantidad: item.cantidad
                })),
                porCategoria: finanzasPorCategoria.map((item) => ({
                    categoria: item._id || 'Sin definir',
                    total: item.total,
                    cantidad: item.cantidad
                })),
                porMes: finanzasPorMes.map((item) => ({
                    anio: item._id.anio,
                    mes: item._id.mes,
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
        res.status(500).json({ mensaje: 'Error al obtener reportes', error: error.message });
    }
};

module.exports = reporteCtrl;
