const Animal = require('../models/Animal');
const Potrero = require('../models/Potrero');
const { PlanSanitario } = require('../models/PlanSanitario');
const RotacionPotrero = require('../models/RotacionPotrero');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const ConteoDrone = require('../models/ConteoDrone');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const Pesaje = require('../models/Pesaje');

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
        producto: { $exists: true, $nin: [null, ''] }
    };
    const filtroFechas = fechaInicio || fechaFin
        ? crearFiltroFechas('fecha', fechaInicio, fechaFin)
        : crearFiltroMesActual('fecha');

    Object.assign(filtro, filtroFechas);

    if (producto) filtro.producto = { $regex: producto, $options: 'i' };
    if (categoria) filtro.categoria = { $regex: categoria, $options: 'i' };
    if (proveedor) filtro.proveedor = { $regex: proveedor, $options: 'i' };

    return filtro;
};

const normalizarUnidadPipeline = {
    $ifNull: [
        {
            $cond: [
                { $eq: ['$unidad', ''] },
                'sin unidad',
                '$unidad'
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
                    regex: /^([0-9]+(?:[,.][0-9]+)?)\s*(.+)$/
                }
            }
        }
    },
    {
        $addFields: {
            cantidadCompra: { $ifNull: ['$cantidad', 0] },
            factorUnidad: {
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
            cantidadFisica: { $multiply: ['$cantidadCompra', '$factorUnidad'] }
        }
    }
];

const pipelineDestinoUso = {
    $let: {
        vars: {
            texto: {
                $toLower: {
                    $concat: [
                        { $ifNull: ['$producto', ''] },
                        ' ',
                        { $ifNull: ['$categoria', ''] },
                        ' ',
                        { $ifNull: ['$descripcion', ''] },
                        ' ',
                        { $ifNull: ['$tipoTrabajo', ''] },
                        ' ',
                        { $ifNull: ['$observaciones', ''] }
                    ]
                }
            }
        },
        in: {
            $switch: {
                branches: [
                    { case: { $regexMatch: { input: '$$texto', regex: /chapia/ } }, then: 'Chapia' },
                    { case: { $regexMatch: { input: '$$texto', regex: /tractor|gasolina|diesel|diésel|combustible/ } }, then: 'Tractor' },
                    { case: { $regexMatch: { input: '$$texto', regex: /sanidad|vacuna|desparasit|medicamento|garrapata/ } }, then: 'Sanidad' },
                    { case: { $regexMatch: { input: '$$texto', regex: /potrero|cerca|port[oó]n/ } }, then: 'Potrero' },
                    { case: { $regexMatch: { input: '$$texto', regex: /manten|repar|aceite|repuesto/ } }, then: 'Mantenimiento' },
                    { case: { $regexMatch: { input: '$$texto', regex: /alimento|sal|melaza|concentrado|pasto/ } }, then: 'Alimentación' }
                ],
                default: 'Otro'
            }
        }
    }
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

const calcularMesesPeriodo = (fechaInicio, fechaFin) => {
    const inicio = fechaInicio ? new Date(fechaInicio) : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const fin = fechaFin ? new Date(fechaFin) : new Date();
    const meses = calcularMesesEntre(inicio, fin);
    return meses && meses > 0 ? meses : 1;
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

const obtenerFechaIngresoFinca = (animal) => animal.fechaCompra || animal.fechaNacimiento || animal.createdAt;

const esAnimalConsideradoActivoEnPeriodo = (animal, fechaInicio, fechaFin) => {
    if (animal.estado === 'Muerto') return false;

    const ingreso = obtenerFechaIngresoFinca(animal);
    const finPeriodo = fechaFin ? new Date(fechaFin) : new Date();
    finPeriodo.setUTCHours(23, 59, 59, 999);
    if (ingreso && new Date(ingreso) > finPeriodo) return false;

    if (!animal.fechaVenta) return true;
    if (!fechaInicio) return true;

    return new Date(animal.fechaVenta).getTime() >= new Date(fechaInicio).getTime();
};

const calcularTotalCompraAnimal = (animal) => {
    if (!animal.fechaCompra) return 0;
    if (animal.pesoCompra && animal.precioCompraPorKg) {
        return animal.pesoCompra * animal.precioCompraPorKg;
    }
    return animal.montoCompra || 0;
};

const calcularTotalVentaAnimal = (animal) => {
    if (animal.pesoVenta && animal.precioVentaPorKg) {
        return animal.pesoVenta * animal.precioVentaPorKg;
    }
    return 0;
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

        const mesesPeriodo = calcularMesesPeriodo(fechaInicio, fechaFin);
        const animalesActivosCosto = animales.filter((animal) => esAnimalConsideradoActivoEnPeriodo(animal, fechaInicio, fechaFin));
        const gastosOperativosPeriodo = sumarMovimientos(movimientosPeriodo.filter(esMovimientoGastoOperativo));
        const costoProduccionMensualPorAnimal = animalesActivosCosto.length
            ? gastosOperativosPeriodo / animalesActivosCosto.length / mesesPeriodo
            : 0;
        const animalesVendidos = animales.filter((animal) => {
            return animal.estado === 'Vendido'
                && estaFechaEnPeriodo(animal.fechaVenta, fechaInicio, fechaFin)
                && animal.pesoVenta > 0
                && animal.precioVentaPorKg > 0;
        });
        const animalesAnalizados = animalesVendidos.map((animal) => {
            const fechaIngreso = obtenerFechaIngresoFinca(animal);
            const duracionMeses = calcularMesesEntre(fechaIngreso, animal.fechaVenta) || 0;
            const totalCompra = calcularTotalCompraAnimal(animal);
            const totalVenta = calcularTotalVentaAnimal(animal);
            const costoProduccionAsignado = costoProduccionMensualPorAnimal * duracionMeses;
            const utilidadPerdida = totalVenta - totalCompra - costoProduccionAsignado;

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
                costoProduccionAsignado: redondear(costoProduccionAsignado),
                utilidadPerdida: redondear(utilidadPerdida)
            };
        });
        const montoComprasAnimales = sumarMovimientos(animalesAnalizados.map((animal) => ({ monto: animal.totalCompra })));
        const montoVentasAnimales = sumarMovimientos(animalesAnalizados.map((animal) => ({ monto: animal.totalVenta })));
        const costoProduccionAsignado = sumarMovimientos(animalesAnalizados.map((animal) => ({ monto: animal.costoProduccionAsignado })));
        const margenSustentabilidad = montoVentasAnimales - montoComprasAnimales - costoProduccionAsignado;
        const pesoCompraTotal = sumarMovimientos(animalesAnalizados.map((animal) => ({ monto: animal.pesoCompra })));
        const pesoVentaTotal = sumarMovimientos(animalesAnalizados.map((animal) => ({ monto: animal.pesoVenta })));
        const duracionPromedioMeses = animalesAnalizados.length
            ? animalesAnalizados.reduce((total, animal) => total + animal.duracionMeses, 0) / animalesAnalizados.length
            : 0;
        const precioVentaPromedioKg = pesoVentaTotal ? montoVentasAnimales / pesoVentaTotal : 0;
        const precioCompraPromedioKg = pesoCompraTotal ? montoComprasAnimales / pesoCompraTotal : 0;

        res.json({
            montoVentasAnimales: redondear(montoVentasAnimales),
            montoComprasAnimales: redondear(montoComprasAnimales),
            gastosOperativosPeriodo: redondear(gastosOperativosPeriodo),
            costoProduccionAsignado: redondear(costoProduccionAsignado),
            costoProduccionMensualPorAnimal: redondear(costoProduccionMensualPorAnimal),
            margenSustentabilidad: redondear(margenSustentabilidad),
            utilidadPerdida: redondear(margenSustentabilidad),
            animalesCompradosPeriodo: animalesAnalizados.filter((animal) => animal.origen === 'Comprado').length,
            animalesVendidosPeriodo: animalesAnalizados.length,
            animalesActivosCosto: animalesActivosCosto.length,
            mesesPeriodo: redondear(mesesPeriodo),
            precioVentaPromedioKg: redondear(precioVentaPromedioKg),
            precioCompraPromedioKg: redondear(precioCompraPromedioKg),
            pesoCompraTotal: redondear(pesoCompraTotal),
            pesoVentaTotal: redondear(pesoVentaTotal),
            duracionPromedioMeses: redondear(duracionPromedioMeses),
            detalleAnimales: animalesAnalizados,
            animalesIgnorados: animales.filter((animal) => {
                return animal.estado === 'Vendido'
                    && estaFechaEnPeriodo(animal.fechaVenta, fechaInicio, fechaFin)
                    && (!animal.pesoVenta || !animal.precioVentaPorKg);
            }).map((animal) => ({
                animalId: animal._id,
                diio: animal.diio || animal.identificadorFinca || '--',
                motivo: 'Falta pesoVenta o precioVentaPorKg'
            })),
            formula: 'venta por kilo - compra por kilo - costo operativo mensual por animal segun meses en finca',
            criterioFechas: {
                ingreso: 'fechaNacimiento para nacidos en finca y fechaCompra para comprados',
                ventas: 'fechaVenta del animal cuando estado es Vendido',
                gastosOperativos: 'fecha del movimiento financiero',
                costoOperativo: 'gastos operativos del periodo / animales activos considerados / meses del periodo'
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

const tieneGestacionActiva = (registros, fechaCorte) => {
    return registros.some((registro) => {
        if (!registro.fechaPartoEstimada || registro.fechaPartoReal) return false;
        return new Date(registro.fechaPartoEstimada) >= fechaCorte;
    });
};

const obtenerUltimoParto = (registros) => {
    return registros
        .filter((registro) => registro.fechaPartoReal)
        .sort((a, b) => new Date(b.fechaPartoReal) - new Date(a.fechaPartoReal))[0] || null;
};

const obtenerDestetesBajos = (vaca, terneros, pesoDesteteMin, fechaInicio, fechaFin) => {
    const posiblesMadres = [vaca.diio, vaca.identificadorFinca].filter(Boolean);

    return terneros.filter((ternero) => {
        if (!posiblesMadres.includes(ternero.madreDiio)) return false;
        if (!ternero.pesoDestete || ternero.pesoDestete >= pesoDesteteMin) return false;
        if (fechaInicio || fechaFin) {
            return estaFechaEnPeriodo(ternero.fechaDestete || ternero.updatedAt, fechaInicio, fechaFin);
        }
        return true;
    });
};

const calcularCategoriaAnimal = (animal) => {
    const edadMeses = calcularEdadMeses(animal.fechaNacimiento);
    if (edadMeses !== null && edadMeses < 12) return 'Ternero';
    if (animal.sexo === 'Hembra') return edadMeses !== null && edadMeses >= 24 ? 'Vaca' : 'Novilla';
    return edadMeses !== null && edadMeses >= 24 ? 'Toro' : 'Novillo';
};

const crearAnalisisPesajesAnimal = (animal, pesajes) => {
    const ordenados = [...pesajes].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const inicial = ordenados[0];
    const actual = ordenados[ordenados.length - 1];
    const dias = inicial && actual ? calcularDiasEntre(inicial.fecha, actual.fecha) : 0;
    const gananciaTotal = actual && inicial ? actual.peso - inicial.peso : 0;
    const gananciaDiariaPromedio = dias > 0 ? gananciaTotal / dias : 0;
    const gananciaMensualPromedio = gananciaDiariaPromedio * 30.44;

    return {
        animalId: animal._id,
        diio: animal.diio || animal.identificadorFinca || '--',
        nombre: animal.nombre || '',
        sexo: animal.sexo,
        categoria: calcularCategoriaAnimal(animal),
        pesoInicial: inicial?.peso || 0,
        pesoActual: actual?.peso || 0,
        fechaInicial: inicial?.fecha || null,
        fechaUltimoPesaje: actual?.fecha || null,
        cantidadPesajes: ordenados.length,
        diasTranscurridos: dias,
        gananciaTotal: redondear(gananciaTotal),
        gananciaDiariaPromedio: redondear(gananciaDiariaPromedio, 3),
        gananciaMensualPromedio: redondear(gananciaMensualPromedio, 2),
        evolucion: ordenados.map((pesaje) => ({
            fecha: pesaje.fecha,
            peso: pesaje.peso
        }))
    };
};

reporteCtrl.getCrecimientoPesajes = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, animalId, diasSinPesaje = 60 } = req.query;
        const filtroPesajes = crearFiltroFechas('fecha', fechaInicio, fechaFin);
        if (animalId) filtroPesajes.animal = animalId;

        const [pesajes, animales] = await Promise.all([
            Pesaje.find(filtroPesajes).sort({ fecha: 1 }).lean(),
            Animal.find({ estado: { $nin: ['Muerto', 'Vendido'] } }).lean()
        ]);
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
        const conCrecimiento = analisis.filter((item) => item.cantidadPesajes >= 2);
        const fechaLimiteReciente = new Date();
        fechaLimiteReciente.setDate(fechaLimiteReciente.getDate() - Number(diasSinPesaje || 60));
        const animalesSinPesajesRecientes = animales.filter((animal) => {
            const ultimo = [...(pesajesPorAnimal.get(animal._id.toString()) || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
            return !ultimo || new Date(ultimo.fecha) < fechaLimiteReciente;
        }).map((animal) => ({
            animalId: animal._id,
            diio: animal.diio || animal.identificadorFinca || '--',
            nombre: animal.nombre || '',
            sexo: animal.sexo,
            categoria: calcularCategoriaAnimal(animal),
            fechaUltimoPesaje: (pesajesPorAnimal.get(animal._id.toString()) || []).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0]?.fecha || null
        }));
        const crecimientoTerneros = analisis.filter((item) => item.categoria === 'Ternero').map((item) => {
            const animal = animales.find((animalItem) => animalItem._id.toString() === item.animalId.toString());
            const pesoNacimiento = animal?.pesoNacimiento || 0;
            return {
                ...item,
                pesoNacimiento,
                gananciaDesdeNacimiento: redondear(item.pesoActual - pesoNacimiento)
            };
        });

        res.json({
            filtros: {
                fechaInicio: fechaInicio || null,
                fechaFin: fechaFin || null,
                animalId: animalId || null,
                diasSinPesaje: Number(diasSinPesaje || 60)
            },
            resumen: {
                animalesConPesajes: analisis.length,
                totalPesajes: pesajes.length,
                animalesConCrecimiento: conCrecimiento.length,
                animalesSinPesajesRecientes: animalesSinPesajesRecientes.length,
                gananciaPromedioDiaria: redondear(
                    conCrecimiento.reduce((total, item) => total + item.gananciaDiariaPromedio, 0) / (conCrecimiento.length || 1),
                    3
                ),
                gananciaDiariaPromedio: redondear(
                    conCrecimiento.reduce((total, item) => total + item.gananciaDiariaPromedio, 0) / (conCrecimiento.length || 1),
                    3
                ),
                gananciaPromedioMensual: redondear(
                    conCrecimiento.reduce((total, item) => total + item.gananciaMensualPromedio, 0) / (conCrecimiento.length || 1),
                    2
                ),
                gananciaMensualPromedio: redondear(
                    conCrecimiento.reduce((total, item) => total + item.gananciaMensualPromedio, 0) / (conCrecimiento.length || 1),
                    2
                ),
                sinPesajesRecientes: animalesSinPesajesRecientes.length
            },
            mejoresCrecimientos: [...conCrecimiento].sort((a, b) => b.gananciaDiariaPromedio - a.gananciaDiariaPromedio).slice(0, 10),
            menoresCrecimientos: [...conCrecimiento].sort((a, b) => a.gananciaDiariaPromedio - b.gananciaDiariaPromedio).slice(0, 10),
            animalesSinPesajesRecientes,
            evolucion: animalId ? analisis[0]?.evolucion || [] : analisis.slice(0, 10),
            crecimientoTerneros
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener reporte de crecimiento', error: error.message });
    }
};

reporteCtrl.getVacasImproductivas = async (req, res) => {
    try {
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
        const fechaCorte = fechaFin ? new Date(fechaFin) : new Date();
        fechaCorte.setUTCHours(23, 59, 59, 999);
        const limiteParto = restarMeses(fechaCorte, mesesSinPartoNumero);

        const filtroHembras = {
            sexo: 'Hembra',
            estado: { $in: ['Activo', 'En tratamiento'] }
        };

        if (diio) {
            filtroHembras.$or = [
                { diio: { $regex: diio, $options: 'i' } },
                { identificadorFinca: { $regex: diio, $options: 'i' } },
                { nombre: { $regex: diio, $options: 'i' } }
            ];
        }

        const [hembras, registros, terneros] = await Promise.all([
            Animal.find(filtroHembras).lean(),
            RegistroReproductivo.find().lean(),
            Animal.find({ madreDiio: { $exists: true, $ne: null } }).lean()
        ]);
        const registrosPorAnimal = registros.reduce((mapa, registro) => {
            const animalId = registro.animal?.toString();
            if (!animalId) return mapa;
            if (!mapa.has(animalId)) mapa.set(animalId, []);
            mapa.get(animalId).push(registro);
            return mapa;
        }, new Map());

        const vacas = hembras
            .map((vaca) => {
                const edadMeses = calcularEdadMeses(vaca.fechaNacimiento);
                const registrosVaca = registrosPorAnimal.get(vaca._id.toString()) || [];
                const ultimoParto = obtenerUltimoParto(registrosVaca);
                const gestacionActiva = tieneGestacionActiva(registrosVaca, fechaCorte);
                const diasAbierta = ultimoParto ? calcularDiasEntre(ultimoParto.fechaPartoReal, fechaCorte) : null;
                const destetesBajos = obtenerDestetesBajos(vaca, terneros, pesoDesteteMinNumero, fechaInicio, fechaFin);
                const motivos = [];

                if (edadMeses === null || edadMeses < 24) return null;

                if (!ultimoParto || new Date(ultimoParto.fechaPartoReal) < limiteParto) {
                    motivos.push('Sin parto reciente');
                }

                if (!gestacionActiva) {
                    motivos.push('Sin gestación activa');
                }

                if (ultimoParto && !gestacionActiva && diasAbierta > diasAbiertosNumero) {
                    motivos.push('Muchos días abiertos');
                }

                if (destetesBajos.length > 0) {
                    motivos.push('Destete bajo');
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
                fechaInicio: fechaInicio || null,
                fechaFin: fechaFin || null
            },
            resumen: {
                totalVacasRevisar: vacas.length,
                sinPartoReciente: vacas.filter((vaca) => vaca.motivos.includes('Sin parto reciente')).length,
                sinGestacionActiva: vacas.filter((vaca) => vaca.motivos.includes('Sin gestación activa')).length,
                muchosDiasAbiertos: vacas.filter((vaca) => vaca.motivos.includes('Muchos días abiertos')).length,
                destetesBajos: vacas.filter((vaca) => vaca.motivos.includes('Destete bajo')).length
            },
            vacas
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener vacas a revisar', error: error.message });
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
                        _id: null,
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
                        _id: '$producto',
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
                        _id: '$categoria',
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
                        _id: '$proveedor',
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
                        _id: '$categoria',
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ])
        ]);

        res.json({
            montoTotal: general[0]?.montoTotal || 0,
            cantidadMovimientos: general[0]?.cantidadMovimientos || 0,
            productosMasRegistrados: productosMasRegistrados.map((item) => ({
                producto: item._id || 'Sin producto',
                categoria: item.categoria || 'Otros',
                unidadMedida: item.unidadMedida || 'sin unidad',
                cantidadTotal: item.cantidadTotal || 0,
                cantidadFisicaTotal: item.cantidadFisicaTotal || 0,
                unidadBase: item.unidadBase || item.unidadMedida || 'sin unidad',
                montoTotal: item.montoTotal || 0,
                cantidadRegistros: item.cantidadRegistros || 0
            })),
            categoriasMasRegistradas: categoriasMasRegistradas.map((item) => ({
                categoria: item._id || 'Otros',
                cantidadRegistros: item.cantidadRegistros || 0,
                montoTotal: item.montoTotal || 0
            })),
            proveedoresMasUsados: proveedoresMasUsados.map((item) => ({
                proveedor: item._id || 'Sin proveedor',
                cantidadRegistros: item.cantidadRegistros || 0,
                montoTotal: item.montoTotal || 0,
                ultimaCompra: item.ultimaCompra || null
            })),
            totalPorCategoria: totalPorCategoria.map((item) => ({
                categoria: item._id || 'Otros',
                total: item.total || 0,
                cantidad: item.cantidad || 0
            }))
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener resumen de productos', error: error.message });
    }
};

reporteCtrl.getProductosPorProducto = async (req, res) => {
    try {
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
                        unidadBase: '$unidadBase'
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
            { $sort: { montoTotal: -1, cantidadFisicaTotal: -1 } }
        ]);

        res.json(productos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener productos agrupados', error: error.message });
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
                    _id: '$categoria',
                    cantidadTotal: { $sum: '$cantidadFisica' },
                    montoTotal: { $sum: '$monto' },
                    productosIncluidos: { $addToSet: '$producto' },
                    cantidadRegistros: { $sum: 1 }
                }
            },
            {
                $setWindowFields: {
                    output: {
                        totalGeneral: { $sum: '$montoTotal' }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    categoria: { $ifNull: ['$_id', 'Otros'] },
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
        res.status(500).json({ mensaje: 'Error al obtener productos por categoria', error: error.message });
    }
};

reporteCtrl.getProductosCombustibles = async (req, res) => {
    try {
        const filtro = {
            ...crearFiltroProductos(req.query),
            $or: [
                { categoria: { $regex: 'combustible', $options: 'i' } },
                { producto: { $regex: 'gasolina|di[eé]sel|diesel', $options: 'i' } }
            ]
        };

        const [general, consumoPorMes, proveedores] = await Promise.all([
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                ...agregarCantidadProductoPipeline,
                {
                    $group: {
                        _id: null,
                        litrosTotales: { $sum: '$cantidadFisica' },
                        montoTotal: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
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
                            mes: { $month: '$fecha' }
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
                        _id: '$proveedor',
                        registros: { $sum: 1 },
                        montoTotal: { $sum: '$monto' }
                    }
                },
                { $sort: { registros: -1, montoTotal: -1 } },
                { $limit: 1 }
            ])
        ]);

        res.json({
            litrosTotales: general[0]?.litrosTotales || 0,
            montoTotal: general[0]?.montoTotal || 0,
            precioPromedioLitro: general[0]?.precioPromedioLitro || 0,
            registros: general[0]?.registros || 0,
            consumoPorMes,
            proveedorMasUsado: proveedores[0]?._id || null
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener reporte de combustibles', error: error.message });
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
                        unidadMedida: '$unidadBase'
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
        res.status(500).json({ mensaje: 'Error al obtener precio promedio de productos', error: error.message });
    }
};

reporteCtrl.getProductosProveedores = async (req, res) => {
    try {
        const filtro = crearFiltroProductos(req.query);
        const proveedores = await MovimientoFinanciero.aggregate([
            { $match: { ...filtro, proveedor: { $exists: true, $nin: [null, ''] } } },
            {
                $group: {
                    _id: '$proveedor',
                    montoTotal: { $sum: '$monto' },
                    cantidadRegistros: { $sum: 1 },
                    productosComprados: { $addToSet: '$producto' },
                    ultimaCompra: { $max: '$fecha' }
                }
            },
            {
                $project: {
                    _id: 0,
                    proveedor: '$_id',
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
        res.status(500).json({ mensaje: 'Error al obtener proveedores de productos', error: error.message });
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
                    _id: '$destino',
                    productos: { $addToSet: '$producto' },
                    cantidadTotal: { $sum: '$cantidadFisica' },
                    montoTotal: { $sum: '$monto' },
                    cantidadRegistros: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    destino: '$_id',
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
        res.status(500).json({ mensaje: 'Error al obtener destinos de productos', error: error.message });
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
                        unidadBase: '$unidadBase'
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
        res.status(500).json({ mensaje: 'Error al obtener top de productos', error: error.message });
    }
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
