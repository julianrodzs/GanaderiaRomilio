const {
    confirmarImportacionExcel,
    procesarExcelPreview
} = require('../services/importarExcel-service');
const ImportacionExcel = require('../models/ImportacionExcel');

const importarCtrl = {};

const leerModulos = (req) => {
    const valor = req.body?.modulos;

    if (!valor) return undefined;

    try {
        const parseado = JSON.parse(valor);
        return Array.isArray(parseado) ? parseado : valor;
    } catch (error) {
        return valor;
    }
};

importarCtrl.previewExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ mensaje: 'Debes subir un archivo .xlsx en el campo archivo' });
        }

        const resultado = procesarExcelPreview(req.file.buffer, { modulos: leerModulos(req) });
        res.json(resultado);
    } catch (error) {
        res.status(400).json({
            mensaje: 'Error al procesar el archivo Excel',
            error: error.message
        });
    }
};

importarCtrl.confirmarExcel = async (req, res) => {
    try {
        const resultado = await confirmarImportacionExcel(req.body, { modulos: req.body?.modulos });
        res.status(201).json(resultado);
    } catch (error) {
        res.status(400).json({
            mensaje: 'Error al confirmar la importacion',
            error: error.message
        });
    }
};

importarCtrl.importarExcelDirecto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ mensaje: 'Debes subir un archivo .xlsx en el campo archivo' });
        }

        const modulos = leerModulos(req);
        const vistaPrevia = procesarExcelPreview(req.file.buffer, { modulos });
        const resultado = await confirmarImportacionExcel({
            registros: vistaPrevia.registros,
            modulos: vistaPrevia.modulosSeleccionados
        });

        await ImportacionExcel.create({
            archivo: req.file.originalname,
            modulosSolicitados: vistaPrevia.modulosSeleccionados,
            hojasDetectadas: vistaPrevia.hojasDetectadas,
            resumenDetectado: vistaPrevia.resumen,
            resultado: resultado.resultado,
            advertencias: vistaPrevia.advertencias,
            usuario: req.usuario?.id
        });

        res.status(201).json({
            mensaje: 'Archivo importado correctamente',
            modulosSeleccionados: vistaPrevia.modulosSeleccionados,
            hojasDetectadas: vistaPrevia.hojasDetectadas,
            resumenDetectado: vistaPrevia.resumen,
            resultado: resultado.resultado,
            advertencias: vistaPrevia.advertencias
        });
    } catch (error) {
        res.status(400).json({
            mensaje: 'Error al importar el archivo Excel',
            error: error.message
        });
    }
};

module.exports = importarCtrl;
