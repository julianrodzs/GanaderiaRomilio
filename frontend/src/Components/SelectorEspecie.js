import React from 'react';
import { useEffect } from 'react';
import { usePlan } from '../context/PlanContext';

const opcionesBase = [
  { valor: 'Bovino', etiqueta: 'Bovinos' },
  { valor: 'Porcino', etiqueta: 'Porcinos' }
];

const SelectorEspecie = ({ valor, onChange, incluirTodos = false }) => {
  const { plan, puedeUsarEspecie } = usePlan();
  const permiteTodas = !plan || plan.plan?.modoEspecies === 'AMBAS';
  const opciones = incluirTodos
    ? [{ valor: 'Todos', etiqueta: 'Todos' }, ...opcionesBase]
    : opcionesBase;
  const opcionesDisponibles = opciones.filter((opcion) => (
    opcion.valor === 'Todos' ? permiteTodas : puedeUsarEspecie(opcion.valor)
  ));

  useEffect(() => {
    if (!plan) return;
    const especiePlan = plan.plan?.especiePlan;
    if (valor === 'Todos' && !permiteTodas && especiePlan) {
      onChange(especiePlan);
      return;
    }
    if (valor !== 'Todos' && !puedeUsarEspecie(valor) && especiePlan) onChange(especiePlan);
  }, [plan, valor, onChange, puedeUsarEspecie, permiteTodas]);

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
