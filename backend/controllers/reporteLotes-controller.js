const Lote = require('../models/Lote');
const { obtenerDetalleLote } = require('../services/lote-service');

const construirFiltro = (query = {}) => {
    const filtro = {};
    if (query.especie && query.especie !== 'Todos') filtro.especie = query.especie;
    if (query.proposito && query.proposito !== 'Todos') filtro.proposito = query.proposito;
    if (query.estado && query.estado !== 'Todos') filtro.estado = query.estado;
    if (query.etapa && query.etapa !== 'Todos') filtro.etapaOperativa = query.etapa;
    if (query.fechaInicio || query.fechaFin) {
        filtro.fechaInicio = {};
        if (query.fechaInicio) filtro.fechaInicio.$gte = new Date(query.fechaInicio);
        if (query.fechaFin) {
            const fin = new Date(query.fechaFin); fin.setHours(23, 59, 59, 999);
            filtro.fechaInicio.$lte = fin;
        }
    }
    return filtro;
};

const generarReporteLotes = async (req, res, incluirAnalitica) => {
    try {
        const lotes = await Lote.find(construirFiltro(req.query)).sort({ estado: 1, codigo: 1 }).lean();
        const detalles = await Promise.all(lotes.map((lote) => obtenerDetalleLote(lote._id)));
        res.json({
            resumen: {
                lotes: detalles.length,
                activos: detalles.filter((lote) => lote.estado === 'ACTIVO').length,
                animalesActuales: detalles.reduce((total, lote) => total + lote.animales.length, 0),
                conPesajes: detalles.reduce((total, lote) => total + lote.resumen.coberturaPesajes.conPesaje, 0)
            },
            lotes: detalles.map((lote) => ({
                _id: lote._id,
                codigo: lote.codigo,
                nombre: lote.nombre,
                especie: lote.especie,
                proposito: lote.proposito,
                etapaOperativa: lote.etapaOperativa,
                estado: lote.estado,
                animales: lote.animales.length,
                pesoPromedioActual: lote.resumen.pesoPromedioActual,
                coberturaPesajes: lote.resumen.coberturaPesajes,
                gmdPromedioLote: incluirAnalitica ? lote.resumen.gmdPromedioLote : undefined,
                gmdObjetivoKgDia: lote.gmdObjetivoKgDia,
                cumplimientoGmd: incluirAnalitica ? lote.resumen.cumplimientoGmd : undefined,
                alcanzaronPesoObjetivo: incluirAnalitica ? lote.resumen.alcanzaronPesoObjetivo : undefined,
                diasActivo: lote.resumen.diasActivo,
                potrero: lote.ubicacionActual,
                planAlimentacion: lote.planAlimentacionActual?.plan || null
            }))
        });
    } catch (error) {
        res.status(error.status || 500).json({ mensaje: error.message || 'Error al generar reporte de lotes' });
    }
};

const obtenerReporteLotes = (req, res) => generarReporteLotes(req, res, false);
const obtenerReporteLotesAnalitica = (req, res) => generarReporteLotes(req, res, true);

module.exports = { obtenerReporteLotes, obtenerReporteLotesAnalitica };
