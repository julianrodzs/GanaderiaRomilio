const XLSX = require('xlsx');
const { Types } = require('mongoose');
const Animal = require('../models/Animal');
const CierreConsolidado = require('../models/CierreConsolidado');
const HistorialFincaAnimal = require('../models/HistorialFincaAnimal');
const MetaConsolidacion = require('../models/MetaConsolidacion');
const MovimientoFinanciero = require('../models/MovimientoFinanciero');
const TrasladoFinca = require('../models/TrasladoFinca');
const { RegistroReproductivo } = require('../models/RegistroReproductivo');
const { AplicacionSanitaria } = require('../models/AplicacionSanitaria');
const { TratamientoSanitario } = require('../models/TratamientoSanitario');
const { exportarCierreExcel, exportarCierrePdf } = require('../services/cierreConsolidado-export-service');
const { Membresia } = require('../models/Membresia');
const { listarFincasAccesibles, resolverFincasParaReporte } = require('../services/accesoFinca-service');
const {
    anularGrupoFinancieroMultiFinca,
    crearCierreConsolidado,
    crearGastoCompartido,
    crearTransferenciaFinancieraInterna,
    guardarMetaConsolidacion,
    trasladarAnimalesEntreFincas
} = require('../services/consolidacionMultiFinca-service');
const {
    filtroEspecie,
    obtenerDetalleDestetesPorFinca,
    obtenerReporteMultiFinca,
    periodoReporte
} = require('../services/reporteMultiFinca-service');
const { obtenerPoblacionAFecha } = require('../services/poblacionHistorica-service');
const { asegurarFincasOperativasPlan } = require('../services/plan-service');

const cargarMembresia = (req) => Membresia.findById(req.usuario.membresiaId);

const fincasReporte = async (req, fincaIds = req.query.fincaIds) => {
    const membresia = await cargarMembresia(req);
    return resolverFincasParaReporte({ membresia, organizacionId: req.organizacionId, fincaIds });
};

const fincasHistoricas = async (req, fincaIds) => {
    const membresia = await cargarMembresia(req);
    return resolverFincasParaReporte({
        membresia,
        organizacionId: req.organizacionId,
        fincaIds,
        incluirInactivas: true
    });
};

const fincasMutables = async (req, fincaIds) => {
    const fincas = await fincasReporte(req, fincaIds);
    await asegurarFincasOperativasPlan({ organizacionId: req.organizacionId, fincaIds: fincas.map((finca) => finca._id) });
    return fincas;
};

const manejarError = (res, error, mensaje) => res.status(error.status || 500).json({
    mensaje: error.message || mensaje,
    code: error.code
});

const trasladarAnimales = async (req, res) => {
    try {
        const [destino] = await fincasMutables(req, [req.body.fincaDestino]);
        const traslado = await trasladarAnimalesEntreFincas({
            fincaOrigenId: req.fincaId,
            fincaDestino: destino,
            animales: req.body.animales,
            fecha: req.body.fecha,
            motivo: req.body.motivo,
            observaciones: req.body.observaciones,
            usuarioId: req.usuario.id,
            zonaHoraria: req.organizacion?.zonaHoraria
        });
        res.status(201).json({ mensaje: `${traslado.animales.length} animal(es) trasladado(s).`, traslado });
    } catch (error) {
        manejarError(res, error, 'No se pudo completar el traslado entre fincas.');
    }
};

const anularGrupoFinanciero = async (req, res) => {
    try {
        if (!Types.ObjectId.isValid(req.params.grupoConsolidacion)) {
            return res.status(400).json({ mensaje: 'El grupo financiero no es válido.', code: 'MULTI_FARM_INVALID_OPERATION' });
        }
        const fincas = await fincasHistoricas(req);
        const fincasGrupo = await MovimientoFinanciero.distinct('fincaId', {
            grupoConsolidacion: req.params.grupoConsolidacion,
            referenciaModelo: { $ne: 'AnulacionOperacionMultiFinca' }
        }).setOptions({ omitirAislamientoFinca: true });
        await asegurarFincasOperativasPlan({ organizacionId: req.organizacionId, fincaIds: fincasGrupo });
        const resultado = await anularGrupoFinancieroMultiFinca({
            grupoConsolidacion: req.params.grupoConsolidacion,
            motivo: req.body.motivo,
            fincasAutorizadas: fincas,
            usuario: req.usuario
        });
        res.json({ mensaje: 'La operación multi-finca fue anulada mediante contrapartidas auditables.', ...resultado });
    } catch (error) {
        manejarError(res, error, 'No se pudo anular la operación multi-finca.');
    }
};

const getTraslados = async (req, res) => {
    try {
        const fincas = await fincasReporte(req);
        const ids = fincas.map((finca) => finca._id);
        const filtro = { $or: [{ fincaOrigen: { $in: ids } }, { fincaDestino: { $in: ids } }] };
        if (req.query.fechaInicio || req.query.fechaFin) {
            const { inicio, fin } = periodoReporte({ ...req.query, zonaHoraria: req.organizacion?.zonaHoraria });
            filtro.fecha = { $gte: inicio, $lte: fin };
        }
        const traslados = await TrasladoFinca.find(filtro)
            .populate('fincaOrigen', 'codigo nombre')
            .populate('fincaDestino', 'codigo nombre')
            .populate('registradoPor', 'nombre apellido')
            .sort({ fecha: -1 })
            .limit(200)
            .lean();
        res.json(traslados);
    } catch (error) {
        manejarError(res, error, 'No se pudo consultar el historial de traslados.');
    }
};

const getHistorialFincaAnimal = async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.animalId).select('_id diio identificadorFinca nombre fincaId').lean();
        if (!animal) return res.status(404).json({ mensaje: 'Animal no encontrado en la finca activa.' });
        const historial = await HistorialFincaAnimal.find({ animal: animal._id })
            .populate('fincaOrigen', 'codigo nombre')
            .populate('fincaDestino', 'codigo nombre')
            .populate('registradoPor', 'nombre apellido')
            .sort({ fecha: 1 })
            .lean();
        res.json({ animal, historial });
    } catch (error) {
        manejarError(res, error, 'No se pudo consultar el historial de finca del animal.');
    }
};

const crearTransferenciaInterna = async (req, res) => {
    try {
        const [destino] = await fincasMutables(req, [req.body.fincaDestino]);
        const resultado = await crearTransferenciaFinancieraInterna({
            fincaOrigenId: req.fincaId,
            fincaDestino: destino,
            datos: req.body,
            usuarioId: req.usuario.id
        });
        res.status(201).json({ mensaje: 'Transferencia interna registrada en ambas fincas.', ...resultado });
    } catch (error) {
        manejarError(res, error, 'No se pudo registrar la transferencia interna.');
    }
};

const registrarGastoCompartido = async (req, res) => {
    try {
        const fincas = await fincasMutables(req, (req.body.distribucion || []).map((item) => item.fincaId));
        const resultado = await crearGastoCompartido({ datos: req.body, fincasAutorizadas: fincas, usuarioId: req.usuario.id });
        res.status(201).json({ mensaje: 'Gasto distribuido entre las fincas.', ...resultado });
    } catch (error) {
        manejarError(res, error, 'No se pudo distribuir el gasto.');
    }
};

const getOperacionesFinancierasMultiFinca = async (req, res) => {
    try {
        const fincas = await fincasReporte(req);
        const ids = fincas.map((finca) => finca._id);
        const filtro = {
            fincaId: { $in: ids },
            alcanceFinanciero: { $in: ['TRANSFERENCIA_INTERNA', 'GASTO_COMPARTIDO'] }
        };
        if (req.query.fechaInicio || req.query.fechaFin) {
            const { inicio, fin } = periodoReporte({ ...req.query, zonaHoraria: req.organizacion?.zonaHoraria });
            filtro.fecha = { $gte: inicio, $lte: fin };
        }
        const movimientos = await MovimientoFinanciero.find(filtro)
            .setOptions({ omitirAislamientoFinca: true })
            .populate('fincaId', 'codigo nombre')
            .populate('fincaContraparte', 'codigo nombre')
            .sort({ fecha: -1 })
            .limit(300)
            .lean();
        res.json(movimientos);
    } catch (error) {
        manejarError(res, error, 'No se pudieron consultar las operaciones multi-finca.');
    }
};

const getMetas = async (req, res) => {
    try {
        const fincas = await fincasReporte(req);
        const ids = fincas.map((finca) => finca._id);
        const metas = await MetaConsolidacion.find({
            $or: [{ alcance: 'ORGANIZACION' }, { alcance: 'FINCA', finca: { $in: ids } }]
        }).populate('finca', 'codigo nombre').sort({ fechaInicio: -1 }).lean();
        res.json(metas);
    } catch (error) {
        manejarError(res, error, 'No se pudieron consultar las metas.');
    }
};

const guardarMeta = async (req, res) => {
    try {
        const membresia = await cargarMembresia(req);
        const fincas = await listarFincasAccesibles(membresia);
        const meta = await guardarMetaConsolidacion({ datos: req.body, fincasAutorizadas: fincas, usuarioId: req.usuario.id });
        res.status(201).json(meta);
    } catch (error) {
        manejarError(res, error, 'No se pudo guardar la meta.');
    }
};

const eliminarMeta = async (req, res) => {
    try {
        const fincas = await fincasReporte(req);
        const ids = fincas.map((finca) => finca._id);
        const meta = await MetaConsolidacion.findOneAndDelete({
            _id: req.params.id,
            $or: [{ alcance: 'ORGANIZACION' }, { alcance: 'FINCA', finca: { $in: ids } }]
        });
        if (!meta) return res.status(404).json({ mensaje: 'Meta no encontrada.' });
        res.json({ mensaje: 'Meta eliminada.' });
    } catch (error) {
        manejarError(res, error, 'No se pudo eliminar la meta.');
    }
};

const crearCierre = async (req, res) => {
    try {
        const fincas = await fincasReporte(req, req.body.fincaIds);
        const reporte = await obtenerReporteMultiFinca({
            fincas,
            fechaInicio: req.body.fechaInicio,
            fechaFin: req.body.fechaFin,
            especie: ['Bovino', 'Porcino'].includes(req.body.especie) ? req.body.especie : 'Todos',
            organizacionId: req.organizacionId,
            zonaHoraria: req.organizacion?.zonaHoraria
        });
        const cierre = await crearCierreConsolidado({ nombre: req.body.nombre, reporte, fincas, usuarioId: req.usuario.id });
        res.status(201).json({ mensaje: 'Período consolidado cerrado.', cierre });
    } catch (error) {
        manejarError(res, error, 'No se pudo cerrar el período.');
    }
};

const getCierres = async (req, res) => {
    try {
        const fincas = await fincasHistoricas(req);
        const autorizadas = new Set(fincas.map((finca) => String(finca._id)));
        const cierres = await CierreConsolidado.find().select('-datos').populate('fincas', 'codigo nombre').populate('cerradoPor', 'nombre apellido').sort({ fechaFin: -1 }).lean();
        res.json(cierres.filter((cierre) => cierre.fincas.every((finca) => autorizadas.has(String(finca?._id || finca)))));
    } catch (error) {
        manejarError(res, error, 'No se pudieron consultar los cierres.');
    }
};

const getCierre = async (req, res) => {
    try {
        const cierre = await CierreConsolidado.findById(req.params.id).populate('fincas', 'codigo nombre').populate('cerradoPor', 'nombre apellido').lean();
        if (!cierre) return res.status(404).json({ mensaje: 'Cierre no encontrado.' });
        await fincasHistoricas(req, cierre.fincas.map((finca) => String(finca?._id || finca)));
        res.json(cierre);
    } catch (error) {
        manejarError(res, error, 'No se pudo consultar el cierre.');
    }
};

const regenerarCierre = async (req, res) => {
    try {
        const cierre = await CierreConsolidado.findById(req.params.id);
        if (!cierre) return res.status(404).json({ mensaje: 'Cierre no encontrado.' });
        const fincas = await fincasReporte(req, cierre.fincas.map(String));
        if (fincas.length !== cierre.fincas.length) return res.status(404).json({ mensaje: 'Cierre no encontrado.' });
        const reporte = await obtenerReporteMultiFinca({
            fincas,
            fechaInicio: cierre.fechaInicio.toISOString().slice(0, 10),
            fechaFin: cierre.fechaFin.toISOString().slice(0, 10),
            especie: cierre.especie,
            organizacionId: req.organizacionId,
            zonaHoraria: req.organizacion?.zonaHoraria
        });
        cierre.datos = reporte;
        cierre.versionCalculo = 'historico-v2';
        cierre.regeneradoEn = new Date();
        cierre.regeneradoPor = req.usuario.id;
        await cierre.save();
        res.json({ mensaje: 'Cierre regenerado explícitamente con la fórmula histórica vigente.', cierre });
    } catch (error) {
        manejarError(res, error, 'No se pudo regenerar el cierre histórico.');
    }
};

const exportarCierre = async (req, res) => {
    try {
        const cierre = await CierreConsolidado.findById(req.params.id).populate('fincas', 'codigo nombre').lean();
        if (!cierre) return res.status(404).json({ mensaje: 'Cierre no encontrado.' });
        await fincasHistoricas(req, cierre.fincas.map((finca) => String(finca?._id || finca)));
        const formato = String(req.query.formato || 'xlsx').toLowerCase();
        if (!['xlsx', 'pdf'].includes(formato)) return res.status(400).json({ mensaje: 'Formato de exportación no permitido.' });
        const archivo = formato === 'pdf' ? await exportarCierrePdf(cierre) : exportarCierreExcel(cierre);
        res.setHeader('Content-Type', formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="cierre-historico-${cierre._id}.${formato}"`);
        return res.send(archivo);
    } catch (error) {
        return manejarError(res, error, 'No se pudo exportar el cierre histórico.');
    }
};

const getDetalleMetrica = async (req, res) => {
    try {
        const [finca] = await fincasReporte(req, [req.query.fincaId]);
        const { inicio, fin } = periodoReporte({ ...req.query, zonaHoraria: req.organizacion?.zonaHoraria });
        const base = { fincaId: finca._id };
        const especie = ['Bovino', 'Porcino'].includes(req.query.especie) ? req.query.especie : 'Todos';
        const porEspecie = filtroEspecie(especie);
        const opciones = { omitirAislamientoFinca: true };
        const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
        const limite = Math.min(100, Math.max(10, Number.parseInt(req.query.limite, 10) || 50));
        const salto = (pagina - 1) * limite;
        let datos;
        let total = 0;
        let totalMetrica = 0;
        let criterio = 'Coincide con el conjunto usado por el indicador consolidado.';
        switch (req.query.metrica) {
        case 'animales': {
            const poblacion = await obtenerPoblacionAFecha({ fincaId: finca._id, especie, fecha: fin });
            total = poblacion.length;
            totalMetrica = total;
            datos = poblacion.slice(salto, salto + limite).map((animal) => ({
                _id: animal._id, diio: animal.diio, identificadorFinca: animal.identificadorFinca,
                nombre: animal.nombre, especie: animal.especie || 'Bovino', sexo: animal.sexo,
                categoria: animal.categoria, objetivoProductivo: animal.objetivoProductivo,
                pesoActual: animal.pesoAlCorte, fechaPesoAlCorte: animal.fechaPesoAlCorte
            }));
            criterio = 'Animales presentes históricamente en la finca a la fecha final del reporte.';
            break;
        }
        case 'finanzas': {
            const filtro = { ...base, fecha: { $gte: inicio, $lte: fin }, excluirConsolidacion: { $ne: true } };
            [datos, total] = await Promise.all([
                MovimientoFinanciero.find(filtro).setOptions(opciones).select('fecha naturaleza categoria descripcion monto moneda alcanceFinanciero excluirConsolidacion').sort({ fecha: -1 }).skip(salto).limit(limite).lean(),
                MovimientoFinanciero.countDocuments(filtro).setOptions(opciones)
            ]);
            totalMetrica = total;
            criterio = 'Solo movimientos incluidos en consolidación; transferencias internas conservan su clasificación.';
            break;
        }
        case 'partos': {
            const filtro = { ...base, ...porEspecie, fechaPartoReal: { $gte: inicio, $lte: fin } };
            [datos, total] = await Promise.all([
                RegistroReproductivo.find(filtro).setOptions(opciones).select('animal especie fechaPartoReal resultadoParto').skip(salto).limit(limite).lean(),
                RegistroReproductivo.countDocuments(filtro).setOptions(opciones)
            ]);
            totalMetrica = total;
            break;
        }
        case 'destetes': {
            const detalle = await obtenerDetalleDestetesPorFinca({ inicio, fin, especie, fincaId: finca._id });
            total = detalle.length;
            totalMetrica = detalle.reduce((suma, item) => suma + Number(item.cantidad || 1), 0);
            datos = detalle.slice(salto, salto + limite);
            break;
        }
        case 'sanidad': {
            const filtro = { ...base, ...porEspecie, fechaAplicacion: { $gte: inicio, $lte: fin } };
            [datos, total] = await Promise.all([
                AplicacionSanitaria.find(filtro).setOptions(opciones).select('fechaAplicacion producto naturaleza animales responsable').skip(salto).limit(limite).lean(),
                AplicacionSanitaria.countDocuments(filtro).setOptions(opciones)
            ]);
            totalMetrica = total;
            break;
        }
        case 'tratamientos': {
            const filtro = { ...base, ...porEspecie, estado: 'Activo' };
            [datos, total] = await Promise.all([
                TratamientoSanitario.find(filtro).setOptions(opciones).select('motivo producto animales fechaInicio proximaAplicacion estado').skip(salto).limit(limite).lean(),
                TratamientoSanitario.countDocuments(filtro).setOptions(opciones)
            ]);
            totalMetrica = total;
            break;
        }
        default:
            return res.status(400).json({ mensaje: 'Métrica de detalle no permitida.' });
        }
        res.json({
            finca,
            metrica: req.query.metrica,
            datos,
            criterio,
            totalMetrica,
            paginacion: { pagina, limite, total, totalPaginas: Math.max(1, Math.ceil(total / limite)) }
        });
    } catch (error) {
        manejarError(res, error, 'No se pudo consultar el detalle.');
    }
};

const exportarReporte = async (req, res) => {
    try {
        const fincas = await fincasReporte(req);
        const reporte = await obtenerReporteMultiFinca({
            fincas,
            fechaInicio: req.query.fechaInicio,
            fechaFin: req.query.fechaFin,
            especie: ['Bovino', 'Porcino'].includes(req.query.especie) ? req.query.especie : 'Todos',
            organizacionId: req.organizacionId,
            zonaHoraria: req.organizacion?.zonaHoraria
        });
        const resumen = [{
            'Fecha inicio': new Date(reporte.filtros.fechaInicio),
            'Fecha fin': new Date(reporte.filtros.fechaFin),
            Especie: reporte.filtros.especie,
            Fincas: reporte.consolidado.fincas,
            'Animales activos': reporte.consolidado.animalesActivos,
            'Ingresos CRC': reporte.consolidado.monedas?.CRC?.ingresos || 0,
            'Egresos CRC': reporte.consolidado.monedas?.CRC?.egresos || 0,
            'Balance CRC': reporte.consolidado.monedas?.CRC?.balance || 0,
            'Ingresos USD': reporte.consolidado.monedas?.USD?.ingresos || 0,
            'Egresos USD': reporte.consolidado.monedas?.USD?.egresos || 0,
            'Balance USD': reporte.consolidado.monedas?.USD?.balance || 0,
            Traslados: reporte.consolidado.traslados,
            'Gastos compartidos': reporte.consolidado.gastosCompartidos
        }];
        const detalle = reporte.fincas.map((item) => ({
            Código: item.finca.codigo,
            Finca: item.finca.nombre,
            Activos: item.inventario.activos,
            Bovinos: item.inventario.bovinos,
            Porcinos: item.inventario.porcinos,
            'Peso promedio kg': item.inventario.pesoPromedio,
            'Ingresos CRC': item.finanzas.ingresos,
            'Egresos CRC': item.finanzas.egresos,
            'Balance CRC': item.finanzas.balance,
            'Transferencias recibidas CRC': item.finanzas.transferenciasEntrantes,
            'Transferencias enviadas CRC': item.finanzas.transferenciasSalientes,
            'Gastos compartidos CRC': item.finanzas.gastosCompartidos,
            'Ingresos USD': item.finanzas.monedas?.USD?.ingresos || 0,
            'Egresos USD': item.finanzas.monedas?.USD?.egresos || 0,
            'Balance USD': item.finanzas.monedas?.USD?.balance || 0,
            Partos: item.reproduccion.partos,
            Destetes: item.reproduccion.destetes,
            Aplicaciones: item.sanidad.aplicaciones,
            'Tratamientos activos': item.sanidad.tratamientosActivos,
            'Traslados entrada': item.traslados.entradas,
            'Traslados salida': item.traslados.salidas,
            Monedas: JSON.stringify(item.finanzas.monedas || {})
        }));
        const finanzasPorMoneda = reporte.fincas.flatMap((item) => Object.entries(item.finanzas.monedas || {}).map(([moneda, valores]) => ({
            Código: item.finca.codigo,
            Finca: item.finca.nombre,
            Moneda: moneda,
            Ingresos: valores.ingresos,
            Egresos: valores.egresos,
            Balance: valores.ingresos - valores.egresos,
            'Transferencias recibidas': valores.transferenciasEntrantes,
            'Transferencias enviadas': valores.transferenciasSalientes,
            'Gastos compartidos': valores.gastosCompartidos
        })));
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(resumen), 'Resumen');
        XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(detalle), 'Fincas');
        XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(finanzasPorMoneda), 'Finanzas por moneda');
        XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(reporte.evolucionMensual), 'Evolucion mensual');
        XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(reporte.metas.map((meta) => ({
            Nombre: meta.nombre, Alcance: meta.alcance, Finca: meta.finca?.nombre || 'Organización',
            Inicio: meta.fechaInicio, Fin: meta.fechaFin, Metas: JSON.stringify(meta.metas)
        }))), 'Metas');
        const archivo = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="consolidado-multifinca-${Date.now()}.xlsx"`);
        res.send(archivo);
    } catch (error) {
        manejarError(res, error, 'No se pudo exportar el consolidado.');
    }
};

module.exports = {
    anularGrupoFinanciero,
    crearCierre,
    crearTransferenciaInterna,
    eliminarMeta,
    exportarCierre,
    exportarReporte,
    getCierre,
    getCierres,
    getDetalleMetrica,
    getHistorialFincaAnimal,
    getMetas,
    getOperacionesFinancierasMultiFinca,
    getTraslados,
    regenerarCierre,
    guardarMeta,
    registrarGastoCompartido,
    trasladarAnimales
};
