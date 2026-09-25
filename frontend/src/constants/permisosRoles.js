export const ROLES = ['Administrador', 'Encargado', 'Trabajador', 'Veterinario', 'Contador', 'Consulta'];

export const permisosPorModulo = {
  Dashboard: ['Administrador'],
  Tareas: ['Administrador', 'Encargado'],
  'Mis tareas': ['Trabajador', 'Veterinario', 'Contador', 'Consulta'],
  Importar: ['Administrador'],
  Inventario: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario', 'Consulta'],
  Pesajes: ['Administrador', 'Encargado', 'Veterinario', 'Consulta'],
  Potreros: ['Administrador', 'Encargado', 'Trabajador', 'Consulta'],
  Sanidad: ['Administrador', 'Encargado', 'Veterinario', 'Consulta'],
  Reproduccion: ['Administrador', 'Encargado', 'Veterinario', 'Consulta'],
  Compras: ['Administrador', 'Encargado', 'Contador', 'Consulta'],
  Ventas: ['Administrador', 'Encargado', 'Contador', 'Consulta'],
  Finanzas: ['Administrador', 'Contador'],
  Reportes: ['Administrador', 'Contador', 'Consulta'],
  Drone: ['Administrador', 'Encargado'],
  Usuarios: ['Administrador'],
  Notificaciones: ['Administrador', 'Encargado', 'Trabajador', 'Veterinario', 'Contador', 'Consulta']
};

export const rolesGestionPorModulo = {
  Tareas: ['Administrador', 'Encargado'],
  Inventario: ['Administrador', 'Encargado'],
  Pesajes: ['Administrador', 'Encargado', 'Veterinario'],
  Potreros: ['Administrador', 'Encargado'],
  Sanidad: ['Administrador', 'Encargado', 'Veterinario'],
  Reproduccion: ['Administrador', 'Encargado', 'Veterinario'],
  Compras: ['Administrador', 'Encargado'],
  Ventas: ['Administrador', 'Encargado'],
  Finanzas: ['Administrador', 'Contador'],
  Drone: ['Administrador', 'Encargado'],
  Usuarios: ['Administrador']
};

export const puedeAccederModulo = (rol, modulo) => {
  if (modulo === 'Mis tareas') return (permisosPorModulo[modulo] || []).includes(rol);
  if (rol === 'Administrador') return true;
  return (permisosPorModulo[modulo] || []).includes(rol);
};

export const puedeGestionarModulo = (rol, modulo) => {
  if (rol === 'Administrador') return true;
  return (rolesGestionPorModulo[modulo] || []).includes(rol);
};
