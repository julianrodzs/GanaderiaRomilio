import React, { useState } from 'react';
import InfoLunarFecha from './InfoLunarFecha';
import ProximasFasesLunares from './ProximasFasesLunares';

const SelectorFechaConLuna = ({
  etiqueta = 'Fecha programada',
  name = 'fechaProgramada',
  value,
  onChange,
  required = false,
  mostrarLuna = false,
  className = ''
}) => {
  const [mostrarFases, setMostrarFases] = useState(false);

  return (
    <div className={`selector-fecha-lunar ${className}`.trim()}>
      <label>
        {etiqueta}
        <input
          name={name}
          type="date"
          value={value || ''}
          onChange={(evento) => onChange(evento.target.value)}
          required={required}
        />
      </label>
      {mostrarLuna && (
        <div className="selector-fecha-lunar-info">
          <InfoLunarFecha fecha={value} />
          <div className="selector-fecha-lunar-acciones">
            <button className="boton-link" type="button" onClick={() => setMostrarFases((actual) => !actual)}>
              {mostrarFases ? 'Ocultar fases' : 'Ver fases próximas'}
            </button>
            <span
              className="ayuda-lunar"
              title="Las fases lunares se muestran únicamente como información de planificación. La aplicación no recomienda modificar prácticas reproductivas con base en la fase lunar."
              aria-label="Información sobre el calendario lunar"
            >i</span>
          </div>
          {mostrarFases && <ProximasFasesLunares fechaBase={value || new Date()} onSeleccionar={onChange} />}
        </div>
      )}
    </div>
  );
};

export default SelectorFechaConLuna;
