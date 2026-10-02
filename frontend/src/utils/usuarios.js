export const nombreUsuario = (usuario, fallback = '--') => {
  if (!usuario) return fallback;
  return [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || usuario.correo || fallback;
};

export const etiquetaUsuarioConRol = (usuario, fallback = '--') => {
  const nombre = nombreUsuario(usuario, fallback);
  return usuario?.rol ? `${nombre} · ${usuario.rol}` : nombre;
};
