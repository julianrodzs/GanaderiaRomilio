const ArchivoMultimedia = require('../models/ArchivoMultimedia');
const Finca = require('../models/Finca');
const Organizacion = require('../models/Organizacion');
const { obtenerConfiguracionR2, subirImagenR2, eliminarImagenR2 } = require('./almacenamientoR2-service');

const IMAGENES_PREDETERMINADAS = Object.freeze({
    logo: '',
    dashboard: '',
    potreros: ''
});

const serializarImagen = (archivo, predeterminada) => ({
    id: archivo?._id || null,
    url: archivo?.url || predeterminada,
    personalizada: Boolean(archivo?._id),
    nombreOriginal: archivo?.nombreOriginal || null,
    mimeType: archivo?.mimeType || null,
    tamanoBytes: archivo?.tamanoBytes || null
});

const buscarOrganizacion = (organizacionId) => Organizacion.findOne({ _id: organizacionId })
    .populate('branding.logo');

const buscarFinca = (fincaId, organizacionId) => Finca.findOne({ _id: fincaId, organizacionId })
    .populate('imagenes.dashboard imagenes.potreros');

const serializarFinca = (finca) => ({
    id: finca._id,
    codigo: finca.codigo,
    nombre: finca.nombre,
    dashboard: serializarImagen(finca.imagenes?.dashboard, IMAGENES_PREDETERMINADAS.dashboard),
    potreros: serializarImagen(finca.imagenes?.potreros, IMAGENES_PREDETERMINADAS.potreros),
    comparteImagen: Boolean(
        finca.imagenes?.dashboard?._id
        && String(finca.imagenes.dashboard._id) === String(finca.imagenes?.potreros?._id || '')
    )
});

const estadoAlmacenamiento = () => ({
    proveedor: 'Cloudflare R2',
    disponible: obtenerConfiguracionR2().disponible,
    formatos: ['JPG', 'PNG', 'WebP'],
    maximoMb: 8
});

const obtenerAparienciaActual = async ({ organizacionId, fincaId }) => {
    const [organizacion, finca] = await Promise.all([
        buscarOrganizacion(organizacionId),
        buscarFinca(fincaId, organizacionId)
    ]);
    if (!organizacion || !finca) {
        const error = new Error('No se pudo resolver la apariencia de la finca activa.');
        error.status = 404;
        throw error;
    }
    return {
        almacenamiento: estadoAlmacenamiento(),
        predeterminadas: IMAGENES_PREDETERMINADAS,
        organizacion: {
            id: organizacion._id,
            nombre: organizacion.nombre,
            logo: serializarImagen(organizacion.branding?.logo, IMAGENES_PREDETERMINADAS.logo)
        },
        finca: serializarFinca(finca)
    };
};

const obtenerConfiguracionApariencia = async ({ organizacionId }) => {
    const [organizacion, fincas] = await Promise.all([
        buscarOrganizacion(organizacionId),
        Finca.find({ organizacionId }).populate('imagenes.dashboard imagenes.potreros').sort({ estado: 1, nombre: 1 })
    ]);
    if (!organizacion) {
        const error = new Error('Organización no encontrada.'); error.status = 404; throw error;
    }
    return {
        almacenamiento: estadoAlmacenamiento(),
        predeterminadas: IMAGENES_PREDETERMINADAS,
        organizacion: {
            id: organizacion._id,
            nombre: organizacion.nombre,
            logo: serializarImagen(organizacion.branding?.logo, IMAGENES_PREDETERMINADAS.logo)
        },
        fincas: fincas.map(serializarFinca)
    };
};

const asegurarFinca = async (fincaId, organizacionId) => {
    const finca = await Finca.findOne({ _id: fincaId, organizacionId });
    if (!finca) {
        const error = new Error('La finca no pertenece a la organización activa.'); error.status = 404; throw error;
    }
    return finca;
};

const crearArchivo = async ({ archivo, organizacionId, fincaId = null, uso, usuarioId }) => {
    const almacenamiento = await subirImagenR2({ archivo, organizacionId, fincaId, uso });
    return ArchivoMultimedia.create({
        organizacionId,
        fincaId,
        uso,
        ...almacenamiento,
        nombreOriginal: archivo.originalname,
        mimeType: archivo.mimetype,
        tamanoBytes: archivo.size,
        creadoPor: usuarioId
    });
};

const limpiarImagenSinReferencias = async (archivoId, organizacionId) => {
    if (!archivoId) return;
    try {
        const anterior = await ArchivoMultimedia.findOne({
            _id: archivoId, organizacionId, activo: true, visibilidad: 'PUBLICO',
            uso: { $in: ['LOGO_ORGANIZACION', 'DASHBOARD_FINCA', 'POTREROS_FINCA'] }
        }).lean();
        if (!anterior || !anterior.clave.startsWith(`organizaciones/${organizacionId}/`)) return;
        const logoEnUso = await Organizacion.exists({ _id: organizacionId, 'branding.logo': anterior._id });
        const imagenEnUso = await Finca.exists({ organizacionId, $or: [
            { 'imagenes.dashboard': anterior._id }, { 'imagenes.potreros': anterior._id }
        ] });
        if (logoEnUso || imagenEnUso) return;
        await eliminarImagenR2(anterior.clave);
        await ArchivoMultimedia.updateOne({ _id: anterior._id, organizacionId }, { $set: { activo: false } });
    } catch (error) {
        console.warn('No se pudo limpiar una imagen de apariencia reemplazada; se conserva su metadata para revision.', {
            archivoId: String(archivoId), codigo: error.code || 'R2_CLEANUP_FAILED'
        });
    }
};

const subirLogoOrganizacion = async ({ archivo, organizacionId, usuarioId }) => {
    const nuevo = await crearArchivo({ archivo, organizacionId, uso: 'LOGO_ORGANIZACION', usuarioId });
    let anterior;
    try {
        anterior = await Organizacion.findOneAndUpdate({ _id: organizacionId }, { $set: { 'branding.logo': nuevo._id } }, { new: false });
        if (!anterior) throw Object.assign(new Error('Organizacion no encontrada.'), { status: 404 });
    } catch (error) { await limpiarImagenSinReferencias(nuevo._id, organizacionId); throw error; }
    await limpiarImagenSinReferencias(anterior.branding?.logo, organizacionId);
    return obtenerConfiguracionApariencia({ organizacionId });
};

const CAMPOS_FINCA = {
    dashboard: { campo: 'imagenes.dashboard', uso: 'DASHBOARD_FINCA' },
    potreros: { campo: 'imagenes.potreros', uso: 'POTREROS_FINCA' }
};

const subirImagenFinca = async ({ tipo, archivo, fincaId, organizacionId, usuarioId }) => {
    const definicion = CAMPOS_FINCA[tipo];
    if (!definicion) {
        const error = new Error('Tipo de imagen de finca no válido.'); error.status = 400; throw error;
    }
    const finca = await asegurarFinca(fincaId, organizacionId);
    const nuevo = await crearArchivo({ archivo, organizacionId, fincaId: finca._id, uso: definicion.uso, usuarioId });
    let anterior;
    try {
        anterior = await Finca.findOneAndUpdate({ _id: finca._id, organizacionId }, { $set: { [definicion.campo]: nuevo._id } }, { new: false });
        if (!anterior) throw Object.assign(new Error('Finca no encontrada.'), { status: 404 });
    } catch (error) { await limpiarImagenSinReferencias(nuevo._id, organizacionId); throw error; }
    await limpiarImagenSinReferencias(anterior.imagenes?.[tipo], organizacionId);
    return obtenerConfiguracionApariencia({ organizacionId });
};

const reutilizarDashboardEnPotreros = async ({ fincaId, organizacionId }) => {
    const finca = await asegurarFinca(fincaId, organizacionId);
    // No reutilizar una referencia que otra peticion acaba de reemplazar.
    const anterior = await Finca.findOneAndUpdate({ _id: finca._id, organizacionId,
        'imagenes.dashboard': finca.imagenes?.dashboard || null,
        'imagenes.potreros': finca.imagenes?.potreros || null
    }, { $set: { 'imagenes.potreros': finca.imagenes?.dashboard || null } }, { new: false });
    if (!anterior) throw Object.assign(new Error('Las imagenes cambiaron. Actualiza la pagina e intenta nuevamente.'), { status: 409 });
    await limpiarImagenSinReferencias(anterior.imagenes?.potreros, organizacionId);
    return obtenerConfiguracionApariencia({ organizacionId });
};

const restaurarImagen = async ({ alcance, tipo, fincaId, organizacionId }) => {
    if (alcance === 'organizacion' && tipo === 'logo') {
        const anterior = await Organizacion.findOneAndUpdate({ _id: organizacionId }, { $set: { 'branding.logo': null } }, { new: false });
        await limpiarImagenSinReferencias(anterior?.branding?.logo, organizacionId);
        return obtenerConfiguracionApariencia({ organizacionId });
    }
    const definicion = CAMPOS_FINCA[tipo];
    if (alcance !== 'finca' || !definicion) {
        const error = new Error('Imagen solicitada no válida.'); error.status = 400; throw error;
    }
    const finca = await asegurarFinca(fincaId, organizacionId);
    const anterior = await Finca.findOneAndUpdate({ _id: finca._id, organizacionId }, { $set: { [definicion.campo]: null } }, { new: false });
    await limpiarImagenSinReferencias(anterior?.imagenes?.[tipo], organizacionId);
    return obtenerConfiguracionApariencia({ organizacionId });
};

module.exports = {
    IMAGENES_PREDETERMINADAS,
    limpiarImagenSinReferencias,
    obtenerAparienciaActual,
    obtenerConfiguracionApariencia,
    restaurarImagen,
    reutilizarDashboardEnPotreros,
    subirImagenFinca,
    subirLogoOrganizacion
};
