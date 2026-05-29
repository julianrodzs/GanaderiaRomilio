const {
    confirmarImportacionExcel,
    procesarExcelPreview
} = require('../services/importarExcel-service');

const importarCtrl = {};

importarCtrl.previewExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ mensaje: 'Debes subir un archivo .xlsx en el campo archivo' });
        }

        const resultado = procesarExcelPreview(req.file.buffer);
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
        const resultado = await confirmarImportacionExcel(req.body);
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

        const vistaPrevia = procesarExcelPreview(req.file.buffer);
        const resultado = await confirmarImportacionExcel({ registros: vistaPrevia.registros });

        res.status(201).json({
            mensaje: 'Archivo importado correctamente',
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
