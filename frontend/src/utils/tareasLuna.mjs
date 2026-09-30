const normalizar = (valor = '') => String(valor)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

export const obtenerContextoLunarTarea = (tarea = {}) => {
  const tipo = normalizar(tarea.tipo);
  const moduloOrigen = normalizar(tarea.moduloOrigen);
  const categoria = normalizar(tarea.categoriaAutomatica);
  const actividadPotrero = normalizar(tarea.actividadPotrero);

  if (moduloOrigen === 'reproduccion' || tipo === 'reproduccion' || categoria.includes('reproduccion')) {
    return 'REPRODUCCION';
  }
  if (tipo === 'siembra' || categoria === 'siembra' || actividadPotrero === 'siembra') {
    return 'SIEMBRA';
  }
  return null;
};

export const esTareaConInfoLunar = (tarea) => Boolean(obtenerContextoLunarTarea(tarea));

