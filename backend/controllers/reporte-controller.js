const Animal = require('../models/Animal');
const Potrero = require('../models/Potrero');
const { PlanSanitario } = require('../models/PlanSanitario');
const RotacionPotrero = require('../models/RotacionPotrero');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const ConteoDrone = require('../models/ConteoDrone');

const reporteCtrl = {};

const crearFiltroFechas = (campo, fechaInicio, fechaFin) => {
    const filtro = {};

    if (fechaInicio || fechaFin) {
        filtro[campo] = {};
        if (fechaInicio) filtro[campo].$gte = new Date(fechaInicio);
        if (fechaFin) filtro[campo].$lte = new Date(fechaFin);
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

reporteCtrl.getResumenReportes = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
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
            conteosDronePorEstado
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
            agruparPorCampo(ConteoDrone, 'estado', filtroDrone)
        ]);

        res.json({
            filtros: {
                fechaInicio: fechaInicio || null,
                fechaFin: fechaFin || null
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
            }
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener reportes', error: error.message });
    }
};

module.exports = reporteCtrl;
