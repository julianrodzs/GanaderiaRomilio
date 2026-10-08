import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { obtenerApariencia } from '../services/api';

const PREDETERMINADAS = {
  logo: '/assests/logo-romilio.png',
  dashboard: '/assests/mapa-potreros.png',
  potreros: '/assests/mapa-potreros.png'
};

const AparienciaContext = createContext(null);

export const AparienciaProvider = ({ children, contextoId = 'actual' }) => {
  const claveCache = `ganaderiaApariencia:${contextoId}`;
  const [estado, setEstado] = useState({
    logo: PREDETERMINADAS.logo,
    dashboard: PREDETERMINADAS.dashboard,
    potreros: PREDETERMINADAS.potreros,
    almacenamientoDisponible: false,
    cargando: true
  });

  const recargarApariencia = useCallback(async () => {
    try {
      const datos = await obtenerApariencia();
      const siguiente = {
        logo: datos.organizacion?.logo?.url || PREDETERMINADAS.logo,
        dashboard: datos.finca?.dashboard?.url || PREDETERMINADAS.dashboard,
        potreros: datos.finca?.potreros?.url || PREDETERMINADAS.potreros,
        almacenamientoDisponible: Boolean(datos.almacenamiento?.disponible),
        cargando: false
      };
      localStorage.setItem(claveCache, JSON.stringify(siguiente));
      setEstado(siguiente);
      return siguiente;
    } catch (error) {
      let cache = null;
      try { cache = JSON.parse(localStorage.getItem(claveCache) || 'null'); } catch (_error) { cache = null; }
      const siguiente = { ...PREDETERMINADAS, ...(cache || {}), cargando: false };
      setEstado(siguiente);
      return siguiente;
    }
  }, [claveCache]);

  useEffect(() => { recargarApariencia(); }, [recargarApariencia]);

  useEffect(() => {
    const actualizar = () => recargarApariencia();
    window.addEventListener('ganaderiaAparienciaActualizada', actualizar);
    return () => window.removeEventListener('ganaderiaAparienciaActualizada', actualizar);
  }, [recargarApariencia]);

  const valor = useMemo(() => ({ ...estado, recargarApariencia }), [estado, recargarApariencia]);
  return <AparienciaContext.Provider value={valor}>{children}</AparienciaContext.Provider>;
};

export const useApariencia = () => useContext(AparienciaContext) || {
  ...PREDETERMINADAS,
  almacenamientoDisponible: false,
  cargando: false,
  recargarApariencia: async () => PREDETERMINADAS
};
