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
