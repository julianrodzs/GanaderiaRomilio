import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { obtenerPlanActual } from '../services/api';

const PlanContext = createContext(null);

export const PlanProvider = ({ children }) => {
  const [estado, setEstado] = useState({ plan: null, cargando: true, error: '' });

  const recargarPlan = useCallback(async () => {
    setEstado((actual) => ({ ...actual, cargando: true, error: '' }));
    try {
      const datos = await obtenerPlanActual();
      setEstado({ plan: datos, cargando: false, error: '' });
      return datos;
    } catch (error) {
      setEstado({ plan: null, cargando: false, error: error.message });
      return null;
    }
  }, []);

  useEffect(() => {
    recargarPlan();
  }, [recargarPlan]);

  useEffect(() => {
    const actualizar = () => recargarPlan();
    const alVolver = () => {
      if (document.visibilityState === 'visible') recargarPlan();
    };
    window.addEventListener('ganaderiaPlanActualizado', actualizar);
    window.addEventListener('focus', actualizar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('ganaderiaPlanActualizado', actualizar);
      window.removeEventListener('focus', actualizar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [recargarPlan]);

  const valor = useMemo(() => {
    const capacidadDisponible = (recurso, cantidad = 1) => {
      const limite = estado.plan?.limites?.[recurso];
      const actual = estado.plan?.uso?.[`${recurso}Actuales`] ?? 0;
      const vigente = Boolean(estado.plan?.plan?.vigente);
      const permitido = vigente && (limite === null || limite === undefined || actual + cantidad <= limite);
      return {
        permitido,
        actual,
        limite,
        restante: limite === null || limite === undefined ? null : Math.max(limite - actual, 0),
        mensaje: !vigente
          ? 'La suscripción no está vigente.'
          : permitido ? '' : `La cuota de ${recurso} del plan está agotada.`
      };
    };

    return {
      ...estado,
      recargarPlan,
      capacidadDisponible,
      tieneFeature: (feature) => Boolean(estado.plan?.plan?.vigente && estado.plan?.funcionalidades?.[feature]),
      puedeUsarEspecie: (especie) => {
      if (!estado.plan?.plan?.vigente) return false;
      if (estado.plan.plan?.modoEspecies === 'AMBAS') return true;
      return estado.plan.plan?.especiePlan === especie;
      }
    };
  }, [estado, recargarPlan]);

  return <PlanContext.Provider value={valor}>{children}</PlanContext.Provider>;
};

export const usePlan = () => useContext(PlanContext) || {
  plan: null,
  cargando: false,
  error: '',
  recargarPlan: async () => null,
  capacidadDisponible: () => ({ permitido: false, actual: 0, limite: 0, restante: 0, mensaje: 'No se pudo consultar el plan.' }),
  tieneFeature: () => false,
  puedeUsarEspecie: () => false
};
