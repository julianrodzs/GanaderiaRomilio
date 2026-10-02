import React, { useMemo, useState } from 'react';

const normalizarBusqueda = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

export const etiquetaAnimalCompleta = (animal) => {
  if (!animal) return 'Sin identificar';
  const identificadores = [animal.diio, animal.identificadorFinca]
    .filter(Boolean)
    .filter((valor, indice, lista) => lista.indexOf(valor) === indice);
  return [identificadores.join(' / ') || 'Sin identificador', animal.nombre]
    .filter(Boolean)
    .join(' - ');
};

const SelectorAnimalBuscable = ({
  animales = [],
  value = '',
  onChange,
  name,
  titulo,
  textoVacio = 'Sin animal registrado',
  placeholder = 'Buscar por DIIO, identificador o nombre',
  disabled = false,
  required = false
}) => {
  const [busqueda, setBusqueda] = useState('');
  const opciones = useMemo(() => {
    const termino = normalizarBusqueda(busqueda);
    return [...animales]
      .filter((animal) => {
        if (!termino || String(animal._id) === String(value)) return true;
        return normalizarBusqueda([
          animal.diio,
          animal.identificadorFinca,
          animal.nombre
        ].filter(Boolean).join(' ')).includes(termino);
      })
      .sort((a, b) => etiquetaAnimalCompleta(a).localeCompare(etiquetaAnimalCompleta(b), 'es'));
  }, [animales, busqueda, value]);

  return (
    <label className="selector-animal-buscable">
      {titulo}
      <input
        type="search"
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <select name={name} value={value} onChange={onChange} disabled={disabled} required={required}>
        <option value="">{textoVacio}</option>
        {opciones.map((animal) => (
          <option key={animal._id} value={animal._id}>{etiquetaAnimalCompleta(animal)}</option>
        ))}
      </select>
      {!disabled && <small>{opciones.length} resultado(s)</small>}
    </label>
  );
};

export default SelectorAnimalBuscable;
