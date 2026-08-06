import React from 'react';

const opcionesBase = [
  { valor: 'Bovino', etiqueta: 'Bovinos' },
  { valor: 'Porcino', etiqueta: 'Porcinos' }
];

const SelectorEspecie = ({ valor, onChange, incluirTodos = false }) => {
  const opciones = incluirTodos
    ? [{ valor: 'Todos', etiqueta: 'Todos' }, ...opcionesBase]
    : opcionesBase;

  return (
    <div className="selector-especie" role="tablist" aria-label="Selector de especie">
      {opciones.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          className={valor === opcion.valor ? 'activo' : ''}
          onClick={() => onChange(opcion.valor)}
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  );
};

export default SelectorEspecie;
