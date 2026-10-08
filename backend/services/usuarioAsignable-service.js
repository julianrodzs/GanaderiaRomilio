const { obtenerFincaActual, obtenerOrganizacionActual } = require('../context/organizacion-context');
const { Membresia } = require('../models/Membresia');

const ROLES_ASIGNABLES = {
    Sanidad: ['Administrador', 'Encargado', 'Veterinario'],
    Reproduccion: ['Administrador', 'Encargado', 'Veterinario'],
    IATF: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario'],
    ProtocolosEngorde: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario'],
    BandasPorcinas: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario'],
    Tareas: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario', 'Contador']
};

const obtenerRolesAsignables = (modulo) => ROLES_ASIGNABLES[modulo] || [];

const filtroAccesoFinca = (fincaId = obtenerFincaActual()) => (
    fincaId
        ? { $or: [{ accesoTodasFincas: true }, { fincas: fincaId }] }
        : {}
);

const listarUsuariosAsignables = async (modulo, organizacionId = obtenerOrganizacionActual()) => {
    const roles = obtenerRolesAsignables(modulo);
    if (!roles.length) return [];
    const membresias = await Membresia.find({
        organizacionId,
        estado: 'Activo',
        rol: { $in: roles },
        ...filtroAccesoFinca()
    }).populate({
        path: 'usuario',
        match: { estado: 'Activo' },
        select: 'nombre apellido correo estado'
    });

    return membresias
        .filter((item) => item.usuario)
        .map((item) => ({
            ...item.usuario.toObject(),
            rol: item.rol,
            estado: item.estado
        }))
        .sort((a, b) => `${a.nombre} ${a.apellido || ''}`.localeCompare(`${b.nombre} ${b.apellido || ''}`, 'es'));
};

const validarUsuarioAsignable = async (usuarioId, modulo) => {
    if (!usuarioId) {
        const error = new Error('Debe seleccionar un responsable para las tareas');
        error.status = 400;
        throw error;
    }

    const membresia = await Membresia.findOne({
        organizacionId: obtenerOrganizacionActual(),
        usuario: usuarioId,
        estado: 'Activo',
        rol: { $in: obtenerRolesAsignables(modulo) },
        ...filtroAccesoFinca()
    }).populate({
        path: 'usuario',
        match: { estado: 'Activo' },
        select: '_id nombre apellido correo estado'
    });

    if (!membresia?.usuario) {
        const error = new Error(`El usuario seleccionado no puede recibir tareas de ${modulo}`);
        error.status = 400;
        throw error;
    }

    return {
        ...membresia.usuario.toObject(),
        rol: membresia.rol,
        estado: membresia.estado
    };
};

module.exports = {
    ROLES_ASIGNABLES,
    listarUsuariosAsignables,
    obtenerRolesAsignables,
    validarUsuarioAsignable
};
