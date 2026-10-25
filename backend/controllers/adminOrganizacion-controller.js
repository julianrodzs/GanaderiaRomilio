const Finca = require('../models/Finca');
const { Membresia } = require('../models/Membresia');
const Organizacion = require('../models/Organizacion');
const {
    ErrorAprovisionamiento,
    aprovisionarOrganizacion
} = require('../services/aprovisionamientoOrganizacion-service');

const listarOrganizaciones = async (req, res) => {
    try {
        const organizaciones = await Organizacion.find({})
            .populate('fincaPrincipal', 'nombre codigo ubicacion lineasProductivas estado')
            .sort({ createdAt: -1 })
            .lean();

        const ids = organizaciones.map((item) => item._id);
        const [membresias, fincas] = await Promise.all([
            Membresia.aggregate([
                { $match: { organizacionId: { $in: ids }, estado: 'Activo' } },
                { $group: { _id: '$organizacionId', total: { $sum: 1 } } }
            ]),
            Finca.aggregate([
                { $match: { organizacionId: { $in: ids }, estado: 'Activa' } },
                { $group: { _id: '$organizacionId', total: { $sum: 1 } } }
            ]).option({ omitirAislamientoOrganizacion: true })
        ]);
        const usuariosPorOrganizacion = new Map(membresias.map((item) => [String(item._id), item.total]));
        const fincasPorOrganizacion = new Map(fincas.map((item) => [String(item._id), item.total]));

        res.json(organizaciones.map((organizacion) => ({
            ...organizacion,
            usuariosActivos: usuariosPorOrganizacion.get(String(organizacion._id)) || 0,
            fincasActivas: fincasPorOrganizacion.get(String(organizacion._id)) || 0
        })));
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al consultar las organizaciones', error: error.message });
    }
};

const crearOrganizacion = async (req, res) => {
    try {
        const resultado = await aprovisionarOrganizacion(req.body, req.usuarioPlataforma.id);
        req.auditoriaOrganizacionId = resultado.organizacion._id.toString();
        req.auditoriaEvento = 'Organización cliente creada';
        req.auditoriaDespues = {
            organizacionId: resultado.organizacion._id,
            plan: resultado.organizacion.plan?.codigo,
            fincaPrincipal: resultado.finca?._id
        };
        res.status(201).json({
            mensaje: 'Cliente SaaS creado correctamente.',
            ...resultado
        });
    } catch (error) {
        const status = error instanceof ErrorAprovisionamiento ? error.status : 500;
        res.status(status).json({
            mensaje: error instanceof ErrorAprovisionamiento
                ? error.message
                : 'No se pudo crear el cliente SaaS.',
            code: error.code,
            detalles: error.detalles,
            ...(process.env.NODE_ENV !== 'production' ? { error: error.message } : {})
        });
    }
};

const cambiarEstadoOrganizacion = async (req, res) => {
    try {
        const { estado } = req.body;
        if (!['Activa', 'Suspendida', 'Inactiva'].includes(estado)) {
            return res.status(400).json({ mensaje: 'Estado de organización no válido.' });
        }

        const anterior = await Organizacion.findById(req.params.id).select('estado plan.codigo').lean();
        if (!anterior) return res.status(404).json({ mensaje: 'Organización no encontrada.' });
        const organizacion = await Organizacion.findByIdAndUpdate(
            req.params.id,
            { $set: { estado } },
            { new: true, runValidators: true }
        ).populate('fincaPrincipal', 'nombre codigo');
        if (!organizacion) return res.status(404).json({ mensaje: 'Organización no encontrada.' });
        req.auditoriaOrganizacionId = organizacion._id.toString();
        req.auditoriaEvento = 'Estado de organización actualizado';
        req.auditoriaAntes = { estado: anterior.estado };
        req.auditoriaDespues = { estado: organizacion.estado };

        res.json({ mensaje: `Organización ${estado.toLowerCase()}.`, organizacion });
    } catch (error) {
        res.status(500).json({ mensaje: 'No se pudo cambiar el estado de la organización.', error: error.message });
    }
};

module.exports = {
    cambiarEstadoOrganizacion,
    crearOrganizacion,
    listarOrganizaciones
};
