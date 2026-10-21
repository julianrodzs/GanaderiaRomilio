import { obtenerZonaHorariaActual, formatearFechaISOEnZona } from '../services/calendarioLunarService.mjs';

export const claveFechaTarea = (fecha, zona = obtenerZonaHorariaActual()) => {
  if (!fecha) return '';
  const instante = new Date(fecha);
  if (Number.isNaN(instante.getTime())) return '';
  return instante.toISOString().endsWith('T00:00:00.000Z')
    ? instante.toISOString().slice(0, 10) : formatearFechaISOEnZona(instante, zona);
};
export const formatearFechaTarea = (fecha) => {
  const clave = claveFechaTarea(fecha);
  return clave ? clave.split('-').reverse().join('/') : '--';
};
export const diasHastaFechaTarea = (fecha, ahora = new Date(), zona = obtenerZonaHorariaActual()) => {
  const clave = claveFechaTarea(fecha, zona);
  return clave ? (Date.parse(clave) - Date.parse(formatearFechaISOEnZona(ahora, zona))) / 86400000 : null;
};
export const esTareaEspecializada = (tarea = {}) => ['Sanidad', 'IATF', 'BandaPorcina', 'BandaReproductivaPorcina', 'ProtocoloEngorde'].includes(tarea.moduloOrigen)
  || ['IATF', 'BANDA_PORCINA', 'PROTOCOLO_ENGORDE'].includes(tarea.categoriaAutomatica);
