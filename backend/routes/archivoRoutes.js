const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const {
    CATEGORIAS_ARCHIVO,
    directorioOrganizacion
} = require('../middleware/uploadOrganizacion');

const router = Router();

router.get('/:categoria/:archivo', (req, res) => {
    const { categoria, archivo } = req.params;
    if (!CATEGORIAS_ARCHIVO.has(categoria) || path.basename(archivo) !== archivo) {
        return res.status(400).json({ mensaje: 'Ruta de archivo no válida' });
    }

    let ruta = path.join(directorioOrganizacion(req.organizacionId, categoria), archivo);
    const slugInicial = process.env.ORGANIZACION_INICIAL_SLUG || 'ganaderia-romilio';
    if (!fs.existsSync(ruta) && req.organizacion?.slug === slugInicial) {
        ruta = path.join(__dirname, '..', 'uploads', categoria, archivo);
    }
    if (!fs.existsSync(ruta)) return res.status(404).json({ mensaje: 'Archivo no encontrado' });

    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(ruta);
});

module.exports = router;
