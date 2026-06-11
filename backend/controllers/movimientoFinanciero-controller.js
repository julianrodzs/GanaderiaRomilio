const MovimientoFinanciero = require('../models/MovimientoFinanciero');

const movimientoFinancieroCtrl = {};

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

const calcularResumenPorTipo = async () => {
    const totales = await MovimientoFinanciero.aggregate([
        {
            $group: {
                _id: '$tipoMovimiento',
                total: { $sum: '$monto' }
            }
        }
    ]);

    return totales.reduce((acumulado, item) => {
        acumulado[item._id] = item.total;
        return acumulado;
    }, {});
};

const calcularResumenPorNaturaleza = async () => {
    const totales = await MovimientoFinanciero.aggregate([
        {
            $group: {
                _id: '$naturaleza',
                total: { $sum: '$monto' }
            }
        }
    ]);

    return totales.reduce((acumulado, item) => {
        acumulado[item._id] = item.total;
        return acumulado;
    }, {});
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

movimientoFinancieroCtrl.getMovimientos = async (req, res) => {
    try {
        const movimientos = await poblarReferencias(
            MovimientoFinanciero.find().sort({ fecha: -1 })
        );

        res.json(movimientos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener movimientos financieros', error: error.message });
    }
};

movimientoFinancieroCtrl.createMovimiento = async (req, res) => {
    try {
        const nuevoMovimiento = new MovimientoFinanciero(req.body);
        const movimientoGuardado = await nuevoMovimiento.save();
        const movimiento = await poblarReferencias(
            MovimientoFinanciero.findById(movimientoGuardado._id)
        );

        res.status(201).json(movimiento);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear movimiento financiero', error: error.message });
    }
};

movimientoFinancieroCtrl.getResumen = async (req, res) => {
    try {
        const [totalGeneralResultado, totalesPorTipo, totalesPorNaturaleza, totalPorCategoria, totalPorMes, totalPorMoneda] = await Promise.all([
            MovimientoFinanciero.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$monto' }
                    }
                }
            ]),
            calcularResumenPorTipo(),
            calcularResumenPorNaturaleza(),
            MovimientoFinanciero.aggregate([
                {
                    $group: {
                        _id: '$categoria',
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
                            mes: { $month: '$fecha' }
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { '_id.anio': 1, '_id.mes': 1 } }
            ]),
            MovimientoFinanciero.aggregate([
                {
                    $group: {
                        _id: '$moneda',
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        res.json({
            totalGeneral: totalGeneralResultado[0]?.total || 0,
            totalPlanillas: totalesPorTipo.Planilla || 0,
            totalInversiones: totalesPorTipo.Inversion || 0,
            totalCompras: (totalesPorTipo.Compra || 0) + (totalesPorTipo['Compra de animales'] || 0),
            totalIngresos: totalesPorNaturaleza.Ingreso || 0,
            totalEgresos: totalesPorNaturaleza.Egreso || 0,
            balance: (totalesPorNaturaleza.Ingreso || 0) - (totalesPorNaturaleza.Egreso || 0),
            totalPorCategoria: totalPorCategoria.map((item) => ({
                categoria: item._id,
                total: item.total,
                cantidad: item.cantidad
            })),
            totalPorMes: totalPorMes.map((item) => ({
                anio: item._id.anio,
                mes: item._id.mes,
                total: item.total,
                cantidad: item.cantidad
            })),
            totalPorMoneda: totalPorMoneda.map((item) => ({
                moneda: item._id || 'CRC',
                total: item.total,
                cantidad: item.cantidad
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

        res.json(movimientos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener movimientos por tipo', error: error.message });
    }
};

movimientoFinancieroCtrl.getResumenConsumo = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, categoria, producto, unidad } = req.query;
        const filtro = {
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

        if (categoria) filtro.categoria = categoria;
        if (unidad) filtro.unidad = unidad;
        if (producto) filtro.producto = { $regex: producto, $options: 'i' };

        const consumo = await MovimientoFinanciero.aggregate([
            { $match: filtro },
            {
                $group: {
                    _id: {
                        producto: '$producto',
                        unidad: '$unidad',
                        categoria: '$categoria'
                    },
                    cantidadTotal: { $sum: '$cantidad' },
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

        const [general, porTipoTrabajo, porEmpleado, porMes] = await Promise.all([
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 },
                        totalPersonas: { $sum: { $ifNull: ['$cantidadPersonas', 0] } },
                        totalDias: { $sum: { $ifNull: ['$diasTrabajados', 0] } },
                        totalHoras: { $sum: { $ifNull: ['$horasTrabajadas', 0] } }
                    }
                }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: { $ifNull: ['$tipoTrabajo', 'Sin clasificar'] },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 },
                        dias: { $sum: { $ifNull: ['$diasTrabajados', 0] } },
                        horas: { $sum: { $ifNull: ['$horasTrabajadas', 0] } }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: { ...filtro, empleado: { $exists: true, $nin: [null, ''] } } },
                {
                    $group: {
                        _id: '$empleado',
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
                            mes: { $month: '$fecha' }
                        },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                { $sort: { '_id.anio': 1, '_id.mes': 1 } }
            ])
        ]);

        res.json({
            total: general[0]?.total || 0,
            registros: general[0]?.registros || 0,
            totalPersonas: general[0]?.totalPersonas || 0,
            totalDias: general[0]?.totalDias || 0,
            totalHoras: general[0]?.totalHoras || 0,
            porTipoTrabajo: porTipoTrabajo.map((item) => ({
                tipoTrabajo: item._id,
                total: item.total,
                registros: item.registros,
                dias: item.dias,
                horas: item.horas
            })),
            porEmpleado: porEmpleado.map((item) => ({
                empleado: item._id,
                total: item.total,
                registros: item.registros
            })),
            porMes: porMes.map((item) => ({
                anio: item._id.anio,
                mes: item._id.mes,
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

        const [general, porTipoInversion, porEstadoActivo, depreciables] = await Promise.all([
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 },
                        depreciacionMensual: { $sum: { $ifNull: ['$depreciacionMensual', 0] } },
                        valorResidual: { $sum: { $ifNull: ['$valorResidual', 0] } }
                    }
                }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: { $ifNull: ['$tipoInversion', '$categoria'] },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 },
                        depreciacionMensual: { $sum: { $ifNull: ['$depreciacionMensual', 0] } }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: { $ifNull: ['$estadoActivo', 'Sin estado'] },
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            MovimientoFinanciero.aggregate([
                { $match: { ...filtro, depreciable: true } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$monto' },
                        registros: { $sum: 1 },
                        depreciacionMensual: { $sum: { $ifNull: ['$depreciacionMensual', 0] } }
                    }
                }
            ])
        ]);

        res.json({
            total: general[0]?.total || 0,
            registros: general[0]?.registros || 0,
            depreciacionMensual: general[0]?.depreciacionMensual || 0,
            valorResidual: general[0]?.valorResidual || 0,
            depreciables: {
                total: depreciables[0]?.total || 0,
                registros: depreciables[0]?.registros || 0,
                depreciacionMensual: depreciables[0]?.depreciacionMensual || 0
            },
            porTipoInversion: porTipoInversion.map((item) => ({
                tipoInversion: item._id || 'Sin clasificar',
                total: item.total,
                registros: item.registros,
                depreciacionMensual: item.depreciacionMensual
            })),
            porEstadoActivo: porEstadoActivo.map((item) => ({
                estadoActivo: item._id,
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
        const movimientoActualizado = await MovimientoFinanciero.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!movimientoActualizado) {
            return res.status(404).json({ mensaje: 'Movimiento financiero no encontrado' });
        }

        const movimiento = await poblarReferencias(
            MovimientoFinanciero.findById(movimientoActualizado._id)
        );

        res.json(movimiento);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar movimiento financiero', error: error.message });
    }
};

movimientoFinancieroCtrl.deleteMovimiento = async (req, res) => {
    try {
        const movimiento = await MovimientoFinanciero.findByIdAndDelete(req.params.id);

        if (!movimiento) {
            return res.status(404).json({ mensaje: 'Movimiento financiero no encontrado' });
        }

        res.json({ mensaje: 'Movimiento financiero eliminado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar movimiento financiero', error: error.message });
    }
};

module.exports = movimientoFinancieroCtrl;
