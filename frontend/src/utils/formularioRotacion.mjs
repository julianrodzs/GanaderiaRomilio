import { claveFechaCalendario as fechaInput } from './fechasCalendario.mjs';

export const hoyRotacion = (zonaHoraria = 'America/Costa_Rica', ahora = new Date()) => {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(ahora).map(({ type, value }) => [type, value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
};

export const normalizarFormularioRotacion = (rotacion, hoy = hoyRotacion()) => ({
  potrero: String(rotacion?.potrero?._id || rotacion?.potrero || ''),
  lote: rotacion?.lote || '',
  fechaEntrada: fechaInput(rotacion?.fechaEntrada) || hoy,
  fechaSalida: fechaInput(rotacion?.fechaSalida),
  numeroAnimales: rotacion?.numeroAnimales ?? '',
  estado: rotacion?.estado || (fechaInput(rotacion?.fechaEntrada) > hoy
    ? 'Planificada'
    : rotacion?.fechaSalida && fechaInput(rotacion.fechaSalida) <= hoy ? 'Finalizada' : 'Activa'),
  observaciones: rotacion?.observaciones || ''
});

export const prepararEnvioRotacion = (formulario) => ({
  ...normalizarFormularioRotacion(formulario),
  fechaSalida: fechaInput(formulario.fechaSalida) || null,
  numeroAnimales: formulario.numeroAnimales === '' ? null : Number(formulario.numeroAnimales)
});
