const crypto = require('crypto');
const {
    confirmarImportacionExcel,
    generarPlantillaExcel,
    procesarExcelPreview
} = require('../services/importarExcel-service');
const Animal = require('../models/Animal');
const CatalogoFinanciero = require('../models/CatalogoFinanciero');
const ImportacionExcel = require('../models/ImportacionExcel');

const importarCtrl = {};

const obtenerCatalogosActivos = async () => {
    const catalogos = await CatalogoFinanciero.find({ activo: true }).select('tipo nombre').sort({ nombre: 1 }).lean();
    return {
        categorias: catalogos.filter((item) => item.tipo === 'categoria').map((item) => item.nombre),
        destinosUso: catalogos.filter((item) => item.tipo === 'destinoUso').map((item) => item.nombre)
    };
};

const crearHash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

importarCtrl.descargarPlantilla = async (req, res) => {
    try {
        const catalogos = await obtenerCatalogosActivos();
        const buffer = generarPlantillaExcel(catalogos);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="plantilla-importacion-ganaderia.xlsx"');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo generar la plantilla', error: error.message });
    }
};

importarCtrl.previewExcel = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ mensaje: 'Debes subir un archivo .xlsx en el campo archivo' });

        const hashArchivo = crearHash(req.file.buffer);
        const importacionConfirmada = await ImportacionExcel.exists({
            hashArchivo,
            usuario: req.usuario?.id,
            estado: { $in: ['Confirmada', 'Confirmada con errores'] }
        });
        if (importacionConfirmada) {
            return res.status(409).json({
                mensaje: 'Este mismo archivo ya fue confirmado anteriormente. Modifica el archivo o revisa el historial antes de volver a importarlo.'
            });
        }

        const [catalogosFinancieros, diios, identificadores] = await Promise.all([
            obtenerCatalogosActivos(),
            Animal.distinct('diio', { diio: { $nin: [null, ''] } }),
            Animal.distinct('identificadorFinca', { identificadorFinca: { $nin: [null, ''] } })
        ]);
        const resultado = await procesarExcelPreview(req.file.buffer, {
            catalogosFinancieros,
            diiosExistentes: [...diios, ...identificadores]
        });
        const importacion = await ImportacionExcel.create({
            archivo: req.file.originalname,
            versionPlantilla: resultado.versionPlantilla,
            hashArchivo,
            estado: resultado.valido ? 'Pendiente' : 'Con errores',
            modulosSolicitados: resultado.hojasDetectadas.filter((item) => item.reconocida).map((item) => item.nombre),
            hojasDetectadas: resultado.hojasDetectadas,
            resumenDetectado: resultado.resumen,
            registros: resultado.registros,
            errores: resultado.errores,
            advertencias: resultado.advertencias,
            usuario: req.usuario?.id
        });
        const { registros, ...respuesta } = resultado;
        res.json({
            ...respuesta,
            importacionId: importacion._id,
            puedeConfirmar: resultado.valido
        });
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al validar el archivo Excel', error: error.message });
    }
};

importarCtrl.confirmarExcel = async (req, res) => {
    try {
        const { importacionId, modo = 'crear_actualizar' } = req.body || {};
        if (!importacionId) return res.status(400).json({ mensaje: 'La vista previa es obligatoria antes de confirmar.' });
        if (!['crear_actualizar', 'solo_crear'].includes(modo)) return res.status(400).json({ mensaje: 'Modo de importación no permitido.' });

        const importacion = await ImportacionExcel.findOne({ _id: importacionId, usuario: req.usuario?.id });
        if (!importacion) return res.status(404).json({ mensaje: 'Vista previa no encontrada.' });
        if (importacion.estado === 'Con errores') return res.status(409).json({ mensaje: 'Corrige los errores del archivo y genera una nueva vista previa.' });
        if (importacion.estado !== 'Pendiente') return res.status(409).json({ mensaje: 'Esta importación ya fue confirmada.' });

        const respuesta = await confirmarImportacionExcel(
            { registros: importacion.registros },
            { modo, usuarioId: req.usuario?.id }
        );
        const tieneErrores = Object.values(respuesta.resultado).some((item) => item.errores?.length);
        importacion.estado = tieneErrores ? 'Confirmada con errores' : 'Confirmada';
        importacion.modo = modo;
        importacion.resultado = respuesta.resultado;
        importacion.confirmadaAt = new Date();
        await importacion.save();

        res.status(201).json({
            ...respuesta,
            importacionId: importacion._id,
            estado: importacion.estado,
            hojasDetectadas: importacion.hojasDetectadas,
            resumenDetectado: importacion.resumenDetectado,
            advertencias: importacion.advertencias
        });
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al confirmar la importación', error: error.message });
    }
};

module.exports = importarCtrl;
