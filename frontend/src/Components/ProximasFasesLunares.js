import React, { useMemo } from 'react';
import {
  mostrarInformacionLunarActual,
  obtenerProximasFases,
  obtenerZonaHorariaActual
} from '../services/calendarioLunarService.mjs';

const formatearFecha = (fecha, zonaHoraria) => new Intl.DateTimeFormat('es-CR', {
  timeZone: zonaHoraria,
  day: 'numeric',
  month: 'short'
}).format(fecha);

const ProximasFasesLunares = ({ fechaBase, onSeleccionar }) => {
  const zonaHoraria = obtenerZonaHorariaActual();
  const fases = useMemo(() => obtenerProximasFases(fechaBase || new Date(), zonaHoraria), [fechaBase, zonaHoraria]);
  if (!mostrarInformacionLunarActual()) return null;

  const seleccionar = (fase) => {
    if (!onSeleccionar) return;
    if (window.confirm(`¿Usar ${formatearFecha(fase.fecha, zonaHoraria)} como fecha programada?`)) {
      onSeleccionar(fase.fechaLocal);
    }
  };

  return (
    <div className="fases-lunares-lista">
      {fases.map((fase) => {
        const contenido = (
          <>
            <span aria-hidden="true">{fase.icono}</span>
            <strong>{fase.fase}</strong>
            <small>{formatearFecha(fase.fecha, zonaHoraria)}</small>
          </>
        );
        return onSeleccionar ? (
          <button type="button" key={`${fase.faseCodigo}-${fase.fechaLocal}`} onClick={() => seleccionar(fase)}>
            {contenido}
          </button>
        ) : (
          <div key={`${fase.faseCodigo}-${fase.fechaLocal}`}>{contenido}</div>
        );
      })}
    </div>
  );
};

export default ProximasFasesLunares;

