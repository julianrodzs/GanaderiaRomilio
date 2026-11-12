// Solo para dias de negocio almacenados como fechas UTC, no para instantes de auditoria.
export const claveFechaCalendario = (valor) => {
  if (valor === null || valor === undefined || valor === '') return '';
  let fecha;
  if (valor instanceof Date) {
    fecha = valor;
  } else if (typeof valor === 'string') {
    const partes = valor.match(/^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/);
    if (!partes) return '';
    const dia = new Date(`${partes[1]}T00:00:00.000Z`);
    if (Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== partes[1]) return '';
    const iso = valor.includes('T') && !/(Z|[+-]\d{2}:\d{2})$/.test(valor) ? `${valor}Z` : valor;
    fecha = new Date(iso);
  } else {
    return '';
  }
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toISOString().slice(0, 10);
};

export const formatearFechaCalendario = (valor) => {
  const clave = claveFechaCalendario(valor);
  return clave ? clave.split('-').reverse().join('/') : '--';
};
