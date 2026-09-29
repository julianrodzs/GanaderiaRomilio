import React from 'react';
import { useEffect } from 'react';
import { usePlan } from '../context/PlanContext';

const opcionesBase = [
  { valor: 'Bovino', etiqueta: 'Bovinos' },
  { valor: 'Porcino', etiqueta: 'Porcinos' }
];

const SelectorEspecie = ({ valor, onChange, incluirTodos = false }) => {
  const { plan, puedeUsarEspecie } = usePlan();
  const opciones = incluirTodos
    ? [{ valor: 'Todos', etiqueta: 'Todos' }, ...opcionesBase]
    : opcionesBase;
  const opcionesDisponibles = opciones.filter((opcion) => opcion.valor === 'Todos' || puedeUsarEspecie(opcion.valor));

  useEffect(() => {
    if (!plan || valor === 'Todos' || puedeUsarEspecie(valor)) return;
    if (plan.plan?.especiePlan) onChange(plan.plan.especiePlan);
  }, [plan, valor, onChange, puedeUsarEspecie]);

  return (
    <div className="selector-especie" role="tablist" aria-label="Selector de especie">
      {opcionesDisponibles.map((opcion) => (
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
