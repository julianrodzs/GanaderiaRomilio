const XLSX = require('xlsx');
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

const cargarMembresia = (req) => Membresia.findById(req.usuario.membresiaId);

const fincasReporte = async (req, fincaIds = req.query.fincaIds) => {
    const membresia = await cargarMembresia(req);
    return resolverFincasParaReporte({ membresia, organizacionId: req.organizacionId, fincaIds });
};

const manejarError = (res, error, mensaje) => res.status(error.status || 500).json({
    mensaje: error.message || mensaje,
    code: error.code
});

const trasladarAnimales = async (req, res) => {
    try {
        const [destino] = await fincasReporte(req, [req.body.fincaDestino]);
        const traslado = await trasladarAnimalesEntreFincas({
            fincaOrigenId: req.fincaId,
            fincaDestino: destino,
            animales: req.body.animales,
            fecha: req.body.fecha,
            motivo: req.body.motivo,
            observaciones: req.body.observaciones,
            usuarioId: req.usuario.id
        });
        res.status(201).json({ mensaje: `${traslado.animales.length} animal(es) trasladado(s).`, traslado });
    } catch (error) {
        manejarError(res, error, 'No se pudo completar el traslado entre fincas.');
    }
};

const getTraslados = async (req, res) => {
    try {
        const fincas = await fincasReporte(req);
        const ids = fincas.map((finca) => finca._id);
        const filtro = { $or: [{ fincaOrigen: { $in: ids } }, { fincaDestino: { $in: ids } }] };
        if (req.query.fechaInicio || req.query.fechaFin) {
            const { inicio, fin } = periodoReporte(req.query);
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
        const [destino] = await fincasReporte(req, [req.body.fincaDestino]);
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
        const fincas = await fincasReporte(req, (req.body.distribucion || []).map((item) => item.fincaId));
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
            const { inicio, fin } = periodoReporte(req.query);
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
            especie: ['Bovino', 'Porcino'].includes(req.body.especie) ? req.body.especie : 'Todos'
        });
        const cierre = await crearCierreConsolidado({ nombre: req.body.nombre, reporte, fincas, usuarioId: req.usuario.id });
        res.status(201).json({ mensaje: 'Período consolidado cerrado.', cierre });
    } catch (error) {
        manejarError(res, error, 'No se pudo cerrar el período.');
    }
};

const getCierres = async (req, res) => {
    try {
        const fincas = await fincasReporte(req);
        const autorizadas = new Set(fincas.map((finca) => String(finca._id)));
        const cierres = await CierreConsolidado.find().select('-datos').populate('fincas', 'codigo nombre').populate('cerradoPor', 'nombre apellido').sort({ fechaFin: -1 }).lean();
        res.json(cierres.filter((cierre) => cierre.fincas.every((finca) => autorizadas.has(String(finca._id)))));
    } catch (error) {
        manejarError(res, error, 'No se pudieron consultar los cierres.');
    }
};

const getCierre = async (req, res) => {
    try {
        const fincas = await fincasReporte(req);
        const autorizadas = new Set(fincas.map((finca) => String(finca._id)));
        const cierre = await CierreConsolidado.findById(req.params.id).populate('fincas', 'codigo nombre').populate('cerradoPor', 'nombre apellido').lean();
        if (!cierre || !cierre.fincas.every((finca) => autorizadas.has(String(finca._id)))) return res.status(404).json({ mensaje: 'Cierre no encontrado.' });
        res.json(cierre);
    } catch (error) {
        manejarError(res, error, 'No se pudo consultar el cierre.');
    }
};

const exportarCierre = async (req, res) => {
    try {
        const fincas = await fincasReporte(req);
        const autorizadas = new Set(fincas.map((finca) => String(finca._id)));
        const cierre = await CierreConsolidado.findById(req.params.id).populate('fincas', 'codigo nombre').lean();
        if (!cierre || !cierre.fincas.every((finca) => autorizadas.has(String(finca._id)))) {
            return res.status(404).json({ mensaje: 'Cierre no encontrado.' });
        }
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
        const { inicio, fin } = periodoReporte(req.query);
        const base = { fincaId: finca._id };
        const especie = ['Bovino', 'Porcino'].includes(req.query.especie) ? req.query.especie : 'Todos';
        const porEspecie = filtroEspecie(especie);
        const opciones = { omitirAislamientoFinca: true };
        let datos;
        switch (req.query.metrica) {
        case 'animales':
            datos = await Animal.find({ ...base, ...porEspecie, estado: 'Activo' }).setOptions(opciones).select('diio identificadorFinca nombre especie sexo categoria objetivoProductivo pesoActual').limit(200).lean();
            break;
        case 'finanzas':
            datos = await MovimientoFinanciero.find({ ...base, fecha: { $gte: inicio, $lte: fin } }).setOptions(opciones).select('fecha naturaleza categoria descripcion monto moneda alcanceFinanciero excluirConsolidacion').sort({ fecha: -1 }).limit(200).lean();
            break;
        case 'partos':
            datos = await RegistroReproductivo.find({ ...base, ...porEspecie, fechaPartoReal: { $gte: inicio, $lte: fin } }).setOptions(opciones).select('animal especie fechaPartoReal resultadoParto').limit(200).lean();
            break;
        case 'destetes':
            datos = (await obtenerDetalleDestetesPorFinca({ inicio, fin, especie, fincaId: finca._id })).slice(0, 200);
            break;
        case 'sanidad':
            datos = await AplicacionSanitaria.find({ ...base, ...porEspecie, fechaAplicacion: { $gte: inicio, $lte: fin } }).setOptions(opciones).select('fechaAplicacion producto naturaleza animales responsable').limit(200).lean();
            break;
        case 'tratamientos':
            datos = await TratamientoSanitario.find({ ...base, ...porEspecie, estado: 'Activo' }).setOptions(opciones).select('motivo producto animales fechaInicio proximaAplicacion estado').limit(200).lean();
            break;
        default:
            return res.status(400).json({ mensaje: 'Métrica de detalle no permitida.' });
        }
        res.json({ finca, metrica: req.query.metrica, datos });
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
            especie: ['Bovino', 'Porcino'].includes(req.query.especie) ? req.query.especie : 'Todos'
        });
        const resumen = [{
            'Fecha inicio': new Date(reporte.filtros.fechaInicio).toLocaleDateString('es-CR'),
            'Fecha fin': new Date(reporte.filtros.fechaFin).toLocaleDateString('es-CR'),
            Especie: reporte.filtros.especie,
            Fincas: reporte.consolidado.fincas,
            'Animales activos': reporte.consolidado.animalesActivos,
            Ingresos: reporte.consolidado.ingresos,
            Egresos: reporte.consolidado.egresos,
            Balance: reporte.consolidado.balance,
            Traslados: reporte.consolidado.traslados,
            'Gastos compartidos': reporte.consolidado.gastosCompartidos
        }];
        Object.entries(reporte.consolidado.monedas || {}).forEach(([moneda, valores]) => {
            resumen.push({
                'Fecha inicio': '', 'Fecha fin': '', Especie: '', Fincas: '', 'Animales activos': '',
                Ingresos: valores.ingresos, Egresos: valores.egresos, Balance: valores.balance,
                Traslados: '', 'Gastos compartidos': valores.gastosCompartidos, Moneda: moneda
            });
        });
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
    guardarMeta,
    registrarGastoCompartido,
    trasladarAnimales
};
