const formatearFechaInput = (fecha) => {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

export const obtenerRangoMesActual = () => {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  const mesTexto = String(mes + 1).padStart(2, '0');

  return {
    fechaInicio: `${anio}-${mesTexto}-01`,
    fechaFin: `${anio}-${mesTexto}-${String(ultimoDia).padStart(2, '0')}`
  };
};

export const obtenerRangoUltimosAnios = (cantidadAnios = 2) => {
  const hoy = new Date();
  const inicio = new Date(hoy);
  inicio.setFullYear(inicio.getFullYear() - cantidadAnios);

  return {
    fechaInicio: formatearFechaInput(inicio),
    fechaFin: formatearFechaInput(hoy)
  };
};

export const fechaEnRango = (fecha, rango) => {
  if (!fecha) return false;

  const fechaTexto = new Date(fecha).toISOString().slice(0, 10);

  if (rango.fechaInicio && fechaTexto < rango.fechaInicio) return false;
  if (rango.fechaFin && fechaTexto > rango.fechaFin) return false;

  return true;
};
