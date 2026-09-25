const Usuario = require('../models/Usuario');

const ROLES_ASIGNABLES = {
    Sanidad: ['Administrador', 'Encargado', 'Veterinario'],
    Reproduccion: ['Administrador', 'Encargado', 'Veterinario'],
    Tareas: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario', 'Contador']
};

const obtenerRolesAsignables = (modulo) => ROLES_ASIGNABLES[modulo] || [];

const listarUsuariosAsignables = (modulo) => {
    const roles = obtenerRolesAsignables(modulo);
    if (!roles.length) return [];
    return Usuario.find({ estado: 'Activo', rol: { $in: roles } })
        .select('nombre apellido correo rol estado')
        .sort({ nombre: 1, apellido: 1 });
};

const validarUsuarioAsignable = async (usuarioId, modulo) => {
    if (!usuarioId) {
        const error = new Error('Debe seleccionar un responsable para las tareas');
        error.status = 400;
        throw error;
    }

    const usuario = await Usuario.findOne({
        _id: usuarioId,
        estado: 'Activo',
        rol: { $in: obtenerRolesAsignables(modulo) }
    }).select('_id nombre apellido rol estado');

    if (!usuario) {
        const error = new Error(`El usuario seleccionado no puede recibir tareas de ${modulo}`);
        error.status = 400;
        throw error;
    }

    return usuario;
};

module.exports = {
    ROLES_ASIGNABLES,
    listarUsuariosAsignables,
    obtenerRolesAsignables,
    validarUsuarioAsignable
};
