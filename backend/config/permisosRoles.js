const ROLES = ['Administrador', 'Encargado', 'Trabajador', 'Veterinario', 'Contador', 'Consulta'];

const TODOS_LOS_ROLES = [...ROLES];

const permisosPorModulo = {
    dashboard: {
        ver: ['Administrador']
    },
    tareas: {
        verTodas: ['Administrador', 'Encargado'],
        gestionar: ['Administrador', 'Encargado'],
        verAsignadas: TODOS_LOS_ROLES,
        completarAsignadas: TODOS_LOS_ROLES
    },
    importar: {
        gestionar: ['Administrador']
    },
    inventario: {
        ver: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario', 'Consulta'],
        gestionar: ['Administrador', 'Encargado']
    },
    camadas: {
        ver: ['Administrador', 'Encargado', 'Veterinario', 'Consulta'],
        gestionar: ['Administrador', 'Encargado', 'Veterinario']
    },
    pesajes: {
        ver: ['Administrador', 'Encargado', 'Veterinario', 'Consulta'],
        gestionar: ['Administrador', 'Encargado', 'Veterinario'],
        eliminar: ['Administrador']
    },
    potreros: {
        ver: ['Administrador', 'Encargado', 'Trabajador', 'Consulta'],
        gestionar: ['Administrador', 'Encargado']
    },
    sanidad: {
        ver: ['Administrador', 'Encargado', 'Veterinario', 'Consulta'],
        gestionar: ['Administrador', 'Encargado', 'Veterinario'],
        eliminar: ['Administrador']
    },
    reproduccion: {
        ver: ['Administrador', 'Encargado', 'Veterinario', 'Consulta'],
        gestionar: ['Administrador', 'Encargado', 'Veterinario'],
        eliminar: ['Administrador']
    },
    compras: {
        ver: ['Administrador', 'Encargado', 'Contador', 'Consulta'],
        gestionar: ['Administrador', 'Encargado'],
        eliminar: ['Administrador']
    },
    ventas: {
        ver: ['Administrador', 'Encargado', 'Contador', 'Consulta'],
        gestionar: ['Administrador', 'Encargado'],
        eliminar: ['Administrador']
    },
    finanzas: {
        ver: ['Administrador', 'Contador'],
        gestionar: ['Administrador', 'Contador'],
        administrarCatalogos: ['Administrador']
    },
    reportes: {
        ver: ['Administrador', 'Contador', 'Consulta']
    },
    drone: {
        ver: ['Administrador', 'Encargado'],
        gestionar: ['Administrador', 'Encargado'],
        eliminar: ['Administrador']
    },
    usuarios: {
        gestionar: ['Administrador']
    }
};

const obtenerRolesPermiso = (permiso) => {
    const [modulo, accion] = String(permiso || '').split('.');
    return permisosPorModulo[modulo]?.[accion] || [];
};

const rolTienePermiso = (rol, permiso) => {
    if (rol === 'Administrador') return true;
    return obtenerRolesPermiso(permiso).includes(rol);
};

module.exports = {
    ROLES,
    permisosPorModulo,
    obtenerRolesPermiso,
    rolTienePermiso
};
