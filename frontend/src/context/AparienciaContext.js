import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { obtenerApariencia } from '../services/api';
import { APARIENCIA_VACIA, normalizarApariencia } from '../utils/apariencia.mjs';

const AparienciaContext = createContext(null);

export const AparienciaProvider = ({ children, contextoId = 'actual' }) => {
  const claveCache = `ganaderiaApariencia:${contextoId}`;
  const generacion = useRef(0);
  const [estado, setEstado] = useState({
    ...APARIENCIA_VACIA,
    almacenamientoDisponible: false,
    cargando: true
  });

  const recargarApariencia = useCallback(async () => {
    const version = ++generacion.current;
    const sesionInicial = localStorage.getItem('ganaderiaSesion');
    const sigueVigente = () => version === generacion.current && Boolean(sesionInicial)
      && localStorage.getItem('ganaderiaSesion') === sesionInicial;
    try {
      const datos = await obtenerApariencia();
      if (!sigueVigente()) return APARIENCIA_VACIA;
      const siguiente = normalizarApariencia({
        logo: datos.organizacion?.logo?.url,
        dashboard: datos.finca?.dashboard?.url,
        potreros: datos.finca?.potreros?.url,
        almacenamientoDisponible: Boolean(datos.almacenamiento?.disponible)
      });
      try { localStorage.setItem(claveCache, JSON.stringify(siguiente)); } catch { /* Cache opcional. */ }
      setEstado(siguiente);
      return siguiente;
    } catch (error) {
      if (!sigueVigente()) return APARIENCIA_VACIA;
      let cache = null;
      try { cache = JSON.parse(localStorage.getItem(claveCache) || 'null'); } catch (_error) { cache = null; }
      const siguiente = normalizarApariencia(cache);
      setEstado(siguiente);
      return siguiente;
    }
  }, [claveCache]);

  useEffect(() => {
    recargarApariencia();
    return () => { generacion.current++; };
  }, [recargarApariencia]);

  useEffect(() => {
    const actualizar = () => recargarApariencia();
    const limpiar = () => { generacion.current++; setEstado({ ...APARIENCIA_VACIA, cargando: false }); };
    window.addEventListener('ganaderiaAparienciaActualizada', actualizar);
    window.addEventListener('ganaderiaSesionLimpiada', limpiar);
    return () => {
      window.removeEventListener('ganaderiaAparienciaActualizada', actualizar);
      window.removeEventListener('ganaderiaSesionLimpiada', limpiar);
    };
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
