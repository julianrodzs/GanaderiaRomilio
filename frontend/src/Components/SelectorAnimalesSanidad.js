import React, { useMemo, useState } from 'react';

const obtenerId = (animal) => animal?._id || animal;
const obtenerIdentificador = (animal) => animal?.diio || animal?.identificadorFinca || 'Sin identificación';

const SelectorAnimalesSanidad = ({ animales = [], seleccionados = [], onChange, disabled = false }) => {
  const [busqueda, setBusqueda] = useState('');
  const idsSeleccionados = useMemo(() => new Set((seleccionados || []).map(obtenerId).filter(Boolean)), [seleccionados]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const ultimosCuatro = texto.length === 4;

    return animales.filter((animal) => {
      if (!texto) return true;
      const identificador = obtenerIdentificador(animal).toLowerCase();
      const nombre = String(animal.nombre || '').toLowerCase();
      return identificador.includes(texto)
        || nombre.includes(texto)
        || (ultimosCuatro && identificador.endsWith(texto));
    }).slice(0, 60);
  }, [animales, busqueda]);

  const alternar = (animal) => {
    if (disabled) return;
    const id = obtenerId(animal);
    const nuevos = idsSeleccionados.has(id)
      ? [...idsSeleccionados].filter((seleccionado) => seleccionado !== id)
      : [...idsSeleccionados, id];
    onChange(nuevos);
  };

  return (
    <div className={`selector-animales-sanidad${disabled ? ' deshabilitado' : ''}`}>
      <div className="selector-animales-encabezado">
        <input
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar por DIIO, últimos 4 o nombre"
          disabled={disabled}
        />
        <span>{idsSeleccionados.size} seleccionado(s)</span>
      </div>

      <div className="selector-animales-lista">
        {visibles.map((animal) => {
          const id = obtenerId(animal);
          const activo = idsSeleccionados.has(id);
          return (
            <label key={id} className={activo ? 'seleccionado' : ''}>
              <input
                type="checkbox"
                checked={activo}
                onChange={() => alternar(animal)}
                disabled={disabled}
              />
              <span>
                <strong>{obtenerIdentificador(animal)}</strong>
                <small>{animal.nombre || animal.categoria || 'Sin nombre'}</small>
              </span>
            </label>
          );
        })}
        {!visibles.length && <p className="reporte-vacio">No hay animales que coincidan.</p>}
      </div>
    </div>
  );
};

export default SelectorAnimalesSanidad;
