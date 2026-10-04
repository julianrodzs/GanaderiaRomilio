const fs = require('fs');
const path = require('path');
const multer = require('multer');

const CATEGORIAS_ARCHIVO = new Set(['conteo-drone']);

const validarCategoria = (categoria) => {
    if (!CATEGORIAS_ARCHIVO.has(categoria)) {
        throw new Error('Categoría de archivo no válida');
    }
    return categoria;
};

const directorioOrganizacion = (organizacionId, categoria) => path.join(
    __dirname,
    '..',
    'uploads',
    String(organizacionId),
    validarCategoria(categoria)
);

const crearUploadOrganizacion = ({ categoria, limiteMb, tiposPermitidos }) => {
    validarCategoria(categoria);

    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            if (!req.organizacionId) return cb(new Error('Organización no disponible para almacenar el archivo'));
            const destino = directorioOrganizacion(req.organizacionId, categoria);
            fs.mkdirSync(destino, { recursive: true });
            cb(null, destino);
        },
        filename: (req, file, cb) => {
            const extension = path.extname(file.originalname).toLowerCase();
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
        }
    });

    return multer({
        storage,
        limits: { fileSize: limiteMb * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (!tiposPermitidos(file)) return cb(new Error('Tipo de archivo no permitido'));
            cb(null, true);
        }
    });
};

const urlArchivoOrganizacion = (categoria, archivo) => (
    archivo ? `/api/archivos/${validarCategoria(categoria)}/${path.basename(archivo.filename)}` : undefined
);

module.exports = {
    CATEGORIAS_ARCHIVO,
    crearUploadOrganizacion,
    directorioOrganizacion,
    urlArchivoOrganizacion
};
