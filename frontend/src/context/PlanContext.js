import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { obtenerPlanActual } from '../services/api';
import '../Components/SuscripcionesSaas.css';

const PlanContext = createContext(null);

export const PlanProvider = ({ children }) => {
  const [estado, setEstado] = useState({ plan: null, cargando: true, error: '' });
  const peticionRef = useRef(null);
  const ultimaConsultaRef = useRef(0);

  const recargarPlan = useCallback(() => {
    if (peticionRef.current) return peticionRef.current;
    ultimaConsultaRef.current = Date.now();
    // Un refresco no debe desmontar FeatureGate ni volver a cargar sus modulos.
    setEstado((actual) => ({ ...actual, cargando: !actual.plan, error: '' }));
    const peticion = (async () => {
      try {
        const datos = await obtenerPlanActual();
        setEstado((actual) => ({
          plan: JSON.stringify(actual.plan) === JSON.stringify(datos) ? actual.plan : datos,
          cargando: false,
          error: ''
        }));
        return datos;
      } catch (error) {
        setEstado({ plan: null, cargando: false, error: error.message });
        return null;
      }
    })().finally(() => {
      if (peticionRef.current === peticion) peticionRef.current = null;
    });
    peticionRef.current = peticion;
    return peticion;
  }, []);

  useEffect(() => {
    recargarPlan();
  }, [recargarPlan]);

  useEffect(() => {
    const actualizar = () => { if (document.visibilityState !== 'hidden' && navigator.onLine !== false) recargarPlan(); };
    const alVolver = () => {
      if (Date.now() - ultimaConsultaRef.current >= 60_000) actualizar();
    };
    window.addEventListener('ganaderiaPlanActualizado', actualizar);
    window.addEventListener('focus', alVolver);
    window.addEventListener('online', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('ganaderiaPlanActualizado', actualizar);
      window.removeEventListener('focus', alVolver);
      window.removeEventListener('online', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [recargarPlan]);

  const funcionalidadesClave = JSON.stringify(estado.plan?.funcionalidades || {});
  const funcionalidades = useMemo(() => JSON.parse(funcionalidadesClave), [funcionalidadesClave]);
  const vigente = Boolean(estado.plan?.plan?.vigente);
  const tieneFeature = useCallback((feature) => Boolean(vigente && funcionalidades[feature]), [vigente, funcionalidades]);
  const modoEspecies = estado.plan?.plan?.modoEspecies;
  const especiePlan = estado.plan?.plan?.especiePlan;
  const puedeUsarEspecie = useCallback((especie) => vigente && (modoEspecies === 'AMBAS' || especiePlan === especie), [vigente, modoEspecies, especiePlan]);

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
      tieneFeature,
      puedeUsarEspecie
    };
  }, [estado, recargarPlan, tieneFeature, puedeUsarEspecie]);

  const suscripcion = estado.plan?.suscripcion;
  const aviso = suscripcion?.estadoSuscripcion === 'EN_GRACIA' ? 'Renovación pendiente: la suscripción está en período de gracia. Coordina el pago desde Mi plan.'
    : suscripcion?.estadoSuscripcion === 'VENCIDA' ? 'La suscripción venció. Los datos se conservan; solicita la renovación desde Mi plan para volver a registrar cambios.' : '';
  return <PlanContext.Provider value={valor}>{aviso && <div role="status" className="suscripcion-banner">{aviso}</div>}{children}</PlanContext.Provider>;
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
