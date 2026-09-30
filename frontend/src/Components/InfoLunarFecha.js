import React, { useMemo } from 'react';
import {
  mostrarInformacionLunarActual,
  obtenerInfoLunar
} from '../services/calendarioLunarService.mjs';

const InfoLunarFecha = ({ fecha, compacta = false, mostrarIluminacion = true }) => {
  const info = useMemo(() => obtenerInfoLunar(fecha), [fecha]);
  if (!fecha || !info || !mostrarInformacionLunarActual()) return null;

  return (
    <div className={compacta ? 'info-lunar info-lunar-compacta' : 'info-lunar'}>
      <span className="info-lunar-icono" aria-hidden="true">{info.icono}</span>
      <span>
        <strong>{info.fase}</strong>
        {mostrarIluminacion && <small>Iluminación {Math.round(info.iluminacionPorcentaje)} %</small>}
      </span>
    </div>
  );
};

export default InfoLunarFecha;

