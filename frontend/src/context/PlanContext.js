import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { obtenerPlanActual } from '../services/api';

const PlanContext = createContext(null);

export const PlanProvider = ({ children }) => {
  const [estado, setEstado] = useState({ plan: null, cargando: true, error: '' });

  const recargarPlan = async () => {
    setEstado((actual) => ({ ...actual, cargando: true, error: '' }));
    try {
      const datos = await obtenerPlanActual();
      setEstado({ plan: datos, cargando: false, error: '' });
      return datos;
    } catch (error) {
      setEstado({ plan: null, cargando: false, error: error.message });
      return null;
    }
  };

  useEffect(() => {
    recargarPlan();
  }, []);

  const valor = useMemo(() => ({
    ...estado,
    recargarPlan,
    tieneFeature: (feature) => Boolean(estado.plan?.funcionalidades?.[feature]),
    puedeUsarEspecie: (especie) => {
      if (!estado.plan || estado.plan.plan?.modoEspecies === 'AMBAS') return true;
      return estado.plan.plan?.especiePlan === especie;
    }
  }), [estado]);

  return <PlanContext.Provider value={valor}>{children}</PlanContext.Provider>;
};

export const usePlan = () => useContext(PlanContext) || {
  plan: null,
  cargando: false,
  error: '',
  recargarPlan: async () => null,
  tieneFeature: () => true,
  puedeUsarEspecie: () => true
};
