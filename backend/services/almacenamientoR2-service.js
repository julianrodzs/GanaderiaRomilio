const crypto = require('crypto');
const path = require('path');
const { DeleteObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSIONES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

const obtenerConfiguracionR2 = () => {
    const configuracion = {
        accountId: String(process.env.R2_ACCOUNT_ID || '').trim(),
        accessKeyId: String(process.env.R2_ACCESS_KEY_ID || '').trim(),
        secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY || '').trim(),
        bucket: String(process.env.R2_BUCKET || '').trim(),
        publicUrl: String(process.env.R2_PUBLIC_URL || '').trim().replace(/\/$/, ''),
        endpoint: String(process.env.R2_ENDPOINT || '').trim().replace(/\/$/, '')
    };
    configuracion.disponible = Boolean(
        configuracion.accountId
        && configuracion.accessKeyId
        && configuracion.secretAccessKey
        && configuracion.bucket
        && configuracion.publicUrl
    );
    return configuracion;
};

const validarArchivoImagen = (archivo) => {
    if (!archivo?.buffer?.length) {
        const error = new Error('Selecciona una imagen para continuar.');
        error.status = 400;
        throw error;
    }
    if (!MIME_PERMITIDOS.has(archivo.mimetype)) {
        const error = new Error('La imagen debe estar en formato JPG, PNG o WebP.');
        error.status = 415;
        throw error;
    }
    const esJpeg = archivo.buffer.length >= 3
        && archivo.buffer[0] === 0xff && archivo.buffer[1] === 0xd8 && archivo.buffer[2] === 0xff;
    const esPng = archivo.buffer.length >= 8
        && archivo.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const esWebp = archivo.buffer.length >= 12
        && archivo.buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && archivo.buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    const firmaValida = (archivo.mimetype === 'image/jpeg' && esJpeg)
        || (archivo.mimetype === 'image/png' && esPng)
        || (archivo.mimetype === 'image/webp' && esWebp);
    if (!firmaValida) {
        const error = new Error('El contenido del archivo no coincide con un JPG, PNG o WebP válido.');
        error.status = 415;
        throw error;
    }
    return archivo;
};

const segmentoSeguro = (valor) => String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const construirClave = ({ organizacionId, fincaId, uso, archivo }) => {
    const extension = EXTENSIONES[archivo.mimetype] || path.extname(archivo.originalname).toLowerCase();
    const alcance = fincaId ? `fincas/${fincaId}` : 'organizacion';
    const nombre = segmentoSeguro(path.basename(archivo.originalname, path.extname(archivo.originalname))) || 'imagen';
    return `organizaciones/${organizacionId}/${alcance}/${segmentoSeguro(uso)}/${nombre}-${crypto.randomUUID()}${extension}`;
};

const construirUrlPublica = (publicUrl, clave) => (
    `${String(publicUrl || '').replace(/\/$/, '')}/${clave.split('/').map(encodeURIComponent).join('/')}`
);

let cliente;
let firmaCliente = '';
const obtenerCliente = (configuracion) => {
    const firma = `${configuracion.accountId}:${configuracion.accessKeyId}:${configuracion.endpoint}`;
    if (!cliente || firmaCliente !== firma) {
        cliente = new S3Client({
            region: 'auto',
            endpoint: configuracion.endpoint || `https://${configuracion.accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: configuracion.accessKeyId,
                secretAccessKey: configuracion.secretAccessKey
            }
        });
        firmaCliente = firma;
    }
    return cliente;
};

const subirImagenR2 = async ({ archivo, organizacionId, fincaId, uso }) => {
    validarArchivoImagen(archivo);
    const configuracion = obtenerConfiguracionR2();
    if (!configuracion.disponible) {
        const error = new Error('Cloudflare R2 todavía no está configurado. Se mantienen las imágenes predeterminadas.');
        error.status = 503;
        error.code = 'R2_NO_CONFIGURADO';
        throw error;
    }
    const clave = construirClave({ organizacionId, fincaId, uso, archivo });
    await obtenerCliente(configuracion).send(new PutObjectCommand({
        Bucket: configuracion.bucket,
        Key: clave,
        Body: archivo.buffer,
        ContentType: archivo.mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
            organizacion: String(organizacionId),
            ...(fincaId ? { finca: String(fincaId) } : {}),
            uso
        }
    }));
    return {
        proveedor: 'R2',
        clave,
        url: construirUrlPublica(configuracion.publicUrl, clave)
    };
};

const eliminarImagenR2 = async (clave) => {
    if (!clave) return false;
    const configuracion = obtenerConfiguracionR2();
    if (!configuracion.disponible) {
        const error = new Error('Cloudflare R2 no está configurado para eliminar el archivo.');
        error.status = 503;
        error.code = 'R2_NO_CONFIGURADO';
        throw error;
    }
    await obtenerCliente(configuracion).send(new DeleteObjectCommand({
        Bucket: configuracion.bucket,
        Key: clave
    }));
    return true;
};

module.exports = {
    MIME_PERMITIDOS,
    construirClave,
    construirUrlPublica,
    eliminarImagenR2,
    obtenerConfiguracionR2,
    subirImagenR2,
    validarArchivoImagen
};
