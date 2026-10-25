const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { autorizarPermiso } = require('../middleware/auth');
const ConteoDrone = require('../models/ConteoDrone');
const ArchivoMultimedia = require('../models/ArchivoMultimedia');
const { obtenerImagenR2 } = require('../services/almacenamientoR2-service');
const {
    CATEGORIAS_ARCHIVO,
    directorioOrganizacion
} = require('../middleware/uploadOrganizacion');

const router = Router();

router.get('/r2/:id', async (req, res, next) => {
    try {
        const archivo = await ArchivoMultimedia.findOne({ _id: req.params.id, activo: true, visibilidad: 'PRIVADO' }).lean();
        if (!archivo) return res.status(404).json({ mensaje: 'Archivo no encontrado' });
        const autorizadas = new Set((req.usuario?.fincas || []).map(String));
        if (archivo.fincaId && !req.usuario?.accesoTodasFincas && !autorizadas.has(String(archivo.fincaId))) {
            return res.status(404).json({ mensaje: 'Archivo no encontrado' });
        }
        const objeto = await obtenerImagenR2(archivo.clave);
        res.setHeader('Content-Type', objeto.ContentType || archivo.mimeType || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
        if (typeof objeto.Body?.pipe === 'function') return objeto.Body.pipe(res);
        const bytes = await objeto.Body?.transformToByteArray?.();
        if (!bytes) return res.status(404).json({ mensaje: 'Archivo no encontrado' });
        return res.send(Buffer.from(bytes));
    } catch (error) {
        return next(error);
    }
});

router.get('/:categoria/:archivo', autorizarPermiso('drone.ver'), async (req, res, next) => {
    try {
    const { categoria, archivo } = req.params;
    if (!CATEGORIAS_ARCHIVO.has(categoria) || path.basename(archivo) !== archivo) {
        return res.status(400).json({ mensaje: 'Ruta de archivo no válida' });
    }

    const url = `/api/archivos/${categoria}/${archivo}`;
    const conteo = await ConteoDrone.findOne({
        $or: [{ imagenOriginalUrl: url }, { imagenProcesadaUrl: url }]
    }).setOptions({ omitirAislamientoFinca: true }).select('fincaId').lean();
    if (!conteo) return res.status(404).json({ mensaje: 'Archivo no encontrado' });
    const fincasAutorizadas = (req.usuario?.fincas || []).map(String);
    if (!req.usuario?.accesoTodasFincas && !fincasAutorizadas.includes(String(conteo.fincaId))) {
        return res.status(404).json({ mensaje: 'Archivo no encontrado' });
    }

    let ruta = path.join(directorioOrganizacion(req.organizacionId, categoria), archivo);
    const slugInicial = process.env.ORGANIZACION_INICIAL_SLUG || 'ganaderia-romilio';
    if (!fs.existsSync(ruta) && req.organizacion?.slug === slugInicial) {
        ruta = path.join(__dirname, '..', 'uploads', categoria, archivo);
    }
    if (!fs.existsSync(ruta)) return res.status(404).json({ mensaje: 'Archivo no encontrado' });

    res.setHeader('Cache-Control', 'private, max-age=300');
        return res.sendFile(ruta);
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
