import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { obtenerApariencia } from '../services/api';
import { APARIENCIA_VACIA, normalizarApariencia } from '../utils/apariencia.mjs';

const AparienciaContext = createContext(null);

export const AparienciaProvider = ({ children, contextoId = 'actual' }) => {
  const claveCache = `ganaderiaApariencia:${contextoId}`;
  const [estado, setEstado] = useState({
    ...APARIENCIA_VACIA,
    almacenamientoDisponible: false,
    cargando: true
  });

  const recargarApariencia = useCallback(async () => {
    try {
      const datos = await obtenerApariencia();
      const siguiente = normalizarApariencia({
        logo: datos.organizacion?.logo?.url,
        dashboard: datos.finca?.dashboard?.url,
        potreros: datos.finca?.potreros?.url,
        almacenamientoDisponible: Boolean(datos.almacenamiento?.disponible)
      });
      localStorage.setItem(claveCache, JSON.stringify(siguiente));
      setEstado(siguiente);
      return siguiente;
    } catch (error) {
      let cache = null;
      try { cache = JSON.parse(localStorage.getItem(claveCache) || 'null'); } catch (_error) { cache = null; }
      const siguiente = normalizarApariencia(cache);
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
  ...APARIENCIA_VACIA,
  almacenamientoDisponible: false,
  cargando: false,
  recargarApariencia: async () => APARIENCIA_VACIA
};
