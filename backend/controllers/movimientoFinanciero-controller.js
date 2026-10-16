const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const { normalizarMovimientoFinanciero } = require('../services/normalizacionFinanciera-service');
const { nombreUsuario, notificarAccionSegura } = require('../services/notificacion-service');
const { sanitizarMovimientoManual } = require('../services/movimientoFinanciero-dto');
const { crearMapaMonedas, normalizarMoneda } = require('../services/finanzas-calculos-service');
const {
    errorMovimientoAutomatico,
    esMovimientoFinancieroAutomatico,
    presentarMovimientoFinanciero
} = require('../services/movimientoFinanciero-proteccion-service');

const movimientoFinancieroCtrl = {};

const formatearMonto = (movimiento) => new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: movimiento.moneda || 'CRC',
    maximumFractionDigits: 0
}).format(movimiento.monto || 0);

const notificarMovimiento = (req, movimiento, tipo, titulo, verbo) => notificarAccionSegura({
    actor: req.usuario,
    naturaleza: 'Informativa',
    tipo,
    titulo,
    mensaje: `${nombreUsuario(req.usuario)} ${verbo} ${movimiento.naturaleza === 'Ingreso' ? 'un ingreso' : 'un egreso'} de ${formatearMonto(movimiento)} en la categoría ${movimiento.categoria || 'Sin categoría'}.`,
    moduloOrigen: 'Finanzas',
    entidadTipo: 'MovimientoFinanciero',
    entidadId: movimiento._id,
    url: `/finanzas/${movimiento._id}`,
    metadata: { monto: movimiento.monto, moneda: movimiento.moneda, categoria: movimiento.categoria }
});

const poblarReferencias = (query) => query
    .populate('potrero')
    .populate('animal');

const normalizarTipoMovimiento = (tipoMovimiento = '') => {
    const tipo = tipoMovimiento.trim().toLowerCase();

    if (tipo === 'planilla' || tipo === 'planillas') return 'Planilla';
    if (tipo === 'inversion' || tipo === 'inversiones' || tipo === 'inversión') return 'Inversion';
    if (tipo === 'compra' || tipo === 'compras') return 'Compra';
    if (tipo === 'compra de animales' || tipo === 'compras de animales') return 'Compra de animales';

    return tipoMovimiento;
};

const construirFiltroFecha = ({ fechaInicio, fechaFin } = {}) => {
    const filtro = {};

    if (fechaInicio || fechaFin) {
        filtro.fecha = {};
        if (fechaInicio) filtro.fecha.$gte = new Date(fechaInicio);
        if (fechaFin) {
            const fin = new Date(fechaFin);
            fin.setUTCHours(23, 59, 59, 999);
            filtro.fecha.$lte = fin;
        }
    }

    return filtro;
};

const campoVacio = (campo) => ({
    $or: [
        { [campo]: { $exists: false } },
        { [campo]: null },
        { [campo]: '' }
    ]
});

movimientoFinancieroCtrl.getMovimientos = async (req, res) => {
    try {
        const movimientos = await poblarReferencias(
            MovimientoFinanciero.find().sort({ fecha: -1 })
        );

        res.json(movimientos.map(presentarMovimientoFinanciero));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener movimientos financieros', error: error.message });
    }
};

movimientoFinancieroCtrl.createMovimiento = async (req, res) => {
    try {
        const payload = sanitizarMovimientoManual(req.body);
        const nuevoMovimiento = new MovimientoFinanciero({
            ...normalizarMovimientoFinanciero(payload),
            organizacionId: req.organizacionId,
            fincaId: req.fincaId
        });
        const movimientoGuardado = await nuevoMovimiento.save();
        const movimiento = await poblarReferencias(
            MovimientoFinanciero.findById(movimientoGuardado._id)
        );

        await notificarMovimiento(req, movimiento, 'MOVIMIENTO_FINANCIERO_CREADO', 'Movimiento financiero registrado', 'registró');

        res.status(201).json(presentarMovimientoFinanciero(movimiento));
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al crear movimiento financiero', error: error.message, codigo: error.code });
    }
};

movimientoFinancieroCtrl.getResumen = async (req, res) => {
    try {
        const [totales, totalPorCategoria, totalPorMes] = await Promise.all([
            MovimientoFinanciero.aggregate([
                {
                    $group: {
                        _id: { moneda: { $ifNull: ['$moneda', 'CRC'] } },
                        totalGeneral: { $sum: '$monto' },
                        totalPlanillas: { $sum: { $cond: [{ $eq: ['$tipoMovimiento', 'Planilla'] }, '$monto', 0] } },
                        totalInversiones: { $sum: { $cond: [{ $eq: ['$tipoMovimiento', 'Inversion'] }, '$monto', 0] } },
                        totalCompras: {
                            $sum: {
                                $cond: [{ $in: ['$tipoMovimiento', ['Compra', 'Compra de animales']] }, '$monto', 0]
                            }
                        },
                        totalIngresos: { $sum: { $cond: [{ $eq: ['$naturaleza', 'Ingreso'] }, '$monto', 0] } },
                        totalEgresos: { $sum: { $cond: [{ $eq: ['$naturaleza', 'Egreso'] }, '$monto', 0] } },
                        cantidad: { $sum: 1 }
                    }
                }
            ]),
            MovimientoFinanciero.aggregate([
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
            ]),
            MovimientoFinanciero.aggregate([
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
            ])
        ]);

        const monedas = crearMapaMonedas(() => ({
            totalGeneral: 0,
            totalPlanillas: 0,
            totalInversiones: 0,
            totalCompras: 0,
            totalIngresos: 0,
            totalEgresos: 0,
            balance: 0,
            cantidad: 0
        }));
        totales.forEach((item) => {
            const moneda = normalizarMoneda(item._id?.moneda);
            monedas[moneda] = {
                totalGeneral: item.totalGeneral || 0,
                totalPlanillas: item.totalPlanillas || 0,
                totalInversiones: item.totalInversiones || 0,
                totalCompras: item.totalCompras || 0,
                totalIngresos: item.totalIngresos || 0,
                totalEgresos: item.totalEgresos || 0,
                balance: (item.totalIngresos || 0) - (item.totalEgresos || 0),
                cantidad: item.cantidad || 0
            };
        });

        res.json({
            monedas,
            totalPorCategoria: totalPorCategoria.map((item) => ({
                categoria: item._id.categoria,
                moneda: normalizarMoneda(item._id.moneda),
                total: item.total,
                cantidad: item.cantidad
            })),
            totalPorMes: totalPorMes.map((item) => ({
                anio: item._id.anio,
                mes: item._id.mes,
                moneda: normalizarMoneda(item._id.moneda),
                total: item.total,
                cantidad: item.cantidad
            })),
            totalPorMoneda: Object.entries(monedas).map(([moneda, datos]) => ({
                moneda,
                total: datos.totalGeneral,
                cantidad: datos.cantidad
            }))
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener resumen financiero', error: error.message });
    }
};

movimientoFinancieroCtrl.getMovimientosPorTipo = async (req, res) => {
    try {
        const tipoMovimiento = normalizarTipoMovimiento(req.params.tipoMovimiento);
        const movimientos = await poblarReferencias(
            MovimientoFinanciero.find({ tipoMovimiento }).sort({ fecha: -1 })
        );

        res.json(movimientos.map(presentarMovimientoFinanciero));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener movimientos por tipo', error: error.message });
    }
};

movimientoFinancieroCtrl.getResumenDestinos = async (req, res) => {
    try {
        const filtro = construirFiltroFecha(req.query);
        const destinos = await MovimientoFinanciero.aggregate([
            { $match: filtro },
            {
                $addFields: {
                    destinoCalculado: {
                        $cond: [
                            {
                                $or: [
                                    { $eq: ['$destinoUso', null] },
                                    { $eq: ['$destinoUso', ''] }
                                ]
                            },
                            'Sin destino',
                            '$destinoUso'
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: {
                        destinoUso: '$destinoCalculado',
                        moneda: { $ifNull: ['$moneda', 'CRC'] }
                    },
                    total: { $sum: '$monto' },
                    registros: { $sum: 1 },
                    productos: { $addToSet: '$producto' }
                }
            },
            {
                $group: {
                    _id: '$_id.destinoUso',
                    totales: {
                        $push: {
                            moneda: '$_id.moneda',
                            total: '$total'
                        }
                    },
                    registros: { $sum: '$registros' },
                    productos: { $push: '$productos' }
                }
            },
            {
                $project: {
                    _id: 0,
                    destinoUso: '$_id',
                    registros: 1,
                    totales: 1,
                    productos: {
                        $slice: [
                            {
                                $reduce: {
                                    input: '$productos',
                                    initialValue: [],
                                    in: { $setUnion: ['$$value', '$$this'] }
                                }
                            },
                            5
                        ]
                    }
                }
            },
            { $sort: { registros: -1 } }
        ]);

        res.json(destinos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener resumen por destino de uso', error: error.message });
    }
};

movimientoFinancieroCtrl.getRevisionDatos = async (req, res) => {
    try {
        const filtro = construirFiltroFecha(req.query);
        const baseCompra = { ...filtro, tipoMovimiento: 'Compra' };
        const consultas = {
            sinDestinoUso: { ...filtro, ...campoVacio('destinoUso') },
            categoriaGeneralOtros: {
                ...filtro,
                categoria: { $in: ['General', 'Otros'] }
            },
            comprasSinProducto: { ...baseCompra, ...campoVacio('producto') },
            comprasSinCantidadUnidad: {
                ...baseCompra,
                $or: [
                    { cantidad: { $exists: false } },
                    { cantidad: null },
                    { cantidad: 0 },
                    { unidad: { $exists: false } },
                    { unidad: null },
                    { unidad: '' }
                ]
            },
            sinProveedor: { ...filtro, ...campoVacio('proveedor') },
            sinPrecioFisico: {
                ...baseCompra,
                cantidad: { $gt: 0 },
                unidad: { $exists: true, $nin: [null, ''] },
                $or: [
                    { precioUnitarioFisico: { $exists: false } },
                    { precioUnitarioFisico: null },
                    { precioUnitarioFisico: 0 }
                ]
            }
        };

        const camposMuestra = 'fecha tipoMovimiento categoria categoriaNormalizada producto cantidad unidad monto moneda proveedor destinoUso descripcion';
        const [
            total,
            sinDestinoUso,
            categoriaGeneralOtros,
            comprasSinProducto,
            comprasSinCantidadUnidad,
            sinProveedor,
            sinPrecioFisico,
            muestras
        ] = await Promise.all([
            MovimientoFinanciero.countDocuments(filtro),
            MovimientoFinanciero.countDocuments(consultas.sinDestinoUso),
            MovimientoFinanciero.countDocuments(consultas.categoriaGeneralOtros),
            MovimientoFinanciero.countDocuments(consultas.comprasSinProducto),
            MovimientoFinanciero.countDocuments(consultas.comprasSinCantidadUnidad),
            MovimientoFinanciero.countDocuments(consultas.sinProveedor),
            MovimientoFinanciero.countDocuments(consultas.sinPrecioFisico),
            MovimientoFinanciero.find({
                ...filtro,
                $or: [
                    ...consultas.sinDestinoUso.$or,
                    { categoria: { $in: ['General', 'Otros'] } },
                    { producto: { $exists: false } },
                    { producto: null },
                    { producto: '' },
                    { proveedor: { $exists: false } },
                    { proveedor: null },
                    { proveedor: '' }
                ]
            })
                .sort({ fecha: -1 })
                .limit(10)
                .select(camposMuestra)
                .lean()
        ]);

        res.json({
            total,
            resumen: {
                sinDestinoUso,
                categoriaGeneralOtros,
                comprasSinProducto,
                comprasSinCantidadUnidad,
                sinProveedor,
                sinPrecioFisico
            },
            muestras
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al revisar calidad de datos financieros', error: error.message });
    }
};

movimientoFinancieroCtrl.getResumenConsumo = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, categoria, producto, unidad } = req.query;
        const filtro = {
            naturaleza: 'Egreso',
            tipoMovimiento: 'Compra',
            cantidad: { $gt: 0 },
            producto: { $exists: true, $nin: [null, ''] }
        };

        if (fechaInicio || fechaFin) {
            filtro.fecha = {};
            if (fechaInicio) filtro.fecha.$gte = new Date(fechaInicio);
            if (fechaFin) {
                const fin = new Date(fechaFin);
                fin.setUTCHours(23, 59, 59, 999);
                filtro.fecha.$lte = fin;
            }
        }

        if (categoria) {
            filtro.categoria = categoria;
        }
        if (unidad) {
            filtro.$and = [
                ...(filtro.$and || []),
                {
                    $or: [
                        { unidad },
                        { unidadNormalizada: unidad }
                    ]
                }
            ];
        }
        if (producto) filtro.producto = { $regex: producto, $options: 'i' };

        const consumo = await MovimientoFinanciero.aggregate([
            { $match: filtro },
            {
                $group: {
                    _id: {
                        producto: '$producto',
                        unidad: { $ifNull: ['$unidadNormalizada', '$unidad'] },
                        categoria: '$categoria',
                        moneda: { $ifNull: ['$moneda', 'CRC'] }
                    },
                    cantidadTotal: { $sum: { $ifNull: ['$cantidadFisica', '$cantidad'] } },
                    montoTotal: { $sum: '$monto' },
                    registros: { $sum: 1 },
                    primeraCompra: { $min: '$fecha' },
                    ultimaCompra: { $max: '$fecha' }
                }
            },
            {
                $project: {
                    _id: 0,
                    producto: '$_id.producto',
                    unidad: { $ifNull: ['$_id.unidad', 'sin unidad'] },
                    categoria: '$_id.categoria',
                    moneda: '$_id.moneda',
                    cantidadTotal: 1,
                    montoTotal: 1,
                    precioPromedioUnitario: {
                        $cond: [
                            { $gt: ['$cantidadTotal', 0] },
                            { $divide: ['$montoTotal', '$cantidadTotal'] },
                            0
                        ]
                    },
                    registros: 1,
                    primeraCompra: 1,
                    ultimaCompra: 1
                }
            },
            { $sort: { montoTotal: -1, cantidadTotal: -1 } }
        ]);

        res.json(consumo);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener resumen de consumo', error: error.message });
    }
};

movimientoFinancieroCtrl.getResumenPlanilla = async (req, res) => {
    try {
        const filtro = {
            ...construirFiltroFecha(req.query),
            tipoMovimiento: 'Planilla'
        };

        const [general, porCategoria, porEmpleado, porMes] = await Promise.all([
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: { moneda: { $ifNull: ['$moneda', 'CRC'] } },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: {
                            categoria: { $ifNull: ['$categoria', 'Mano de Obra / Jornales'] },
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: { ...filtro, empleado: { $exists: true, $nin: [null, ''] } } },
                {
                    $group: {
                        _id: {
                            empleado: '$empleado',
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: {
                            anio: { $year: '$fecha' },
                            mes: { $month: '$fecha' },
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                { $sort: { '_id.anio': 1, '_id.mes': 1 } }
            ])
        ]);

        const monedas = crearMapaMonedas(() => ({ total: 0, registros: 0 }));
        general.forEach((item) => {
            monedas[normalizarMoneda(item._id?.moneda)] = {
                total: item.total || 0,
                registros: item.registros || 0
            };
        });

        res.json({
            monedas,
            registros: Object.values(monedas).reduce((total, item) => total + item.registros, 0),
            porCategoria: porCategoria.map((item) => ({
                categoria: item._id.categoria,
                moneda: normalizarMoneda(item._id.moneda),
                total: item.total,
                registros: item.registros
            })),
            porEmpleado: porEmpleado.map((item) => ({
                empleado: item._id.empleado,
                moneda: normalizarMoneda(item._id.moneda),
                total: item.total,
                registros: item.registros
            })),
            porMes: porMes.map((item) => ({
                anio: item._id.anio,
                mes: item._id.mes,
                moneda: normalizarMoneda(item._id.moneda),
                total: item.total,
                registros: item.registros
            }))
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener resumen de planilla', error: error.message });
    }
};

movimientoFinancieroCtrl.getResumenInversiones = async (req, res) => {
    try {
        const filtro = {
            ...construirFiltroFecha(req.query),
            tipoMovimiento: 'Inversion'
        };

        const [general, porCategoria, porMes] = await Promise.all([
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: { moneda: { $ifNull: ['$moneda', 'CRC'] } },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: {
                            categoria: { $ifNull: ['$categoria', 'Inversiones / Infraestructura'] },
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: {
                            anio: { $year: '$fecha' },
                            mes: { $month: '$fecha' },
                            moneda: { $ifNull: ['$moneda', 'CRC'] }
                        },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                { $sort: { '_id.anio': 1, '_id.mes': 1 } }
            ])
        ]);

        const monedas = crearMapaMonedas(() => ({ total: 0, registros: 0 }));
        general.forEach((item) => {
            monedas[normalizarMoneda(item._id?.moneda)] = {
                total: item.total || 0,
                registros: item.registros || 0
            };
        });

        res.json({
            monedas,
            registros: Object.values(monedas).reduce((total, item) => total + item.registros, 0),
            porCategoria: porCategoria.map((item) => ({
                categoria: item._id.categoria,
                moneda: normalizarMoneda(item._id.moneda),
                total: item.total,
                registros: item.registros
            })),
            porMes: porMes.map((item) => ({
                anio: item._id.anio,
                mes: item._id.mes,
                moneda: normalizarMoneda(item._id.moneda),
                total: item.total,
                registros: item.registros
            }))
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener resumen de inversiones', error: error.message });
    }
};

movimientoFinancieroCtrl.updateMovimiento = async (req, res) => {
    try {
        const movimientoActual = await MovimientoFinanciero.findById(req.params.id);
        if (!movimientoActual) {
            return res.status(404).json({ mensaje: 'Movimiento financiero no encontrado' });
        }
        if (esMovimientoFinancieroAutomatico(movimientoActual)) {
            throw errorMovimientoAutomatico(movimientoActual);
        }

        const payload = sanitizarMovimientoManual(req.body);
        const movimientoActualizado = await MovimientoFinanciero.findByIdAndUpdate(req.params.id, { $set: payload }, {
            new: true,
            runValidators: true
        });

        if (!movimientoActualizado) {
            return res.status(404).json({ mensaje: 'Movimiento financiero no encontrado' });
        }

        const movimiento = await poblarReferencias(
            MovimientoFinanciero.findById(movimientoActualizado._id)
        );

        await notificarMovimiento(req, movimiento, 'MOVIMIENTO_FINANCIERO_MODIFICADO', 'Movimiento financiero actualizado', 'actualizó');

        res.json(presentarMovimientoFinanciero(movimiento));
    } catch (error) {
        res.status(error.status || 400).json({ mensaje: error.message || 'Error al actualizar movimiento financiero', error: error.message, codigo: error.code });
    }
};

movimientoFinancieroCtrl.deleteMovimiento = async (req, res) => {
    try {
        const movimiento = await MovimientoFinanciero.findById(req.params.id);
        if (!movimiento) {
            return res.status(404).json({ mensaje: 'Movimiento financiero no encontrado' });
        }
        if (esMovimientoFinancieroAutomatico(movimiento)) {
            throw errorMovimientoAutomatico(movimiento);
        }

        await MovimientoFinanciero.deleteOne({ _id: movimiento._id });

        await notificarMovimiento(req, movimiento, 'MOVIMIENTO_FINANCIERO_ELIMINADO', 'Movimiento financiero eliminado', 'eliminó');

        res.json({ mensaje: 'Movimiento financiero eliminado' });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message || 'Error al eliminar movimiento financiero', error: error.message, codigo: error.code });
    }
};

module.exports = movimientoFinancieroCtrl;
