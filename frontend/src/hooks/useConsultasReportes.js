import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { crearCargaReportes } from '../utils/cargaReportes.mjs';

export default function useConsultasReportes(tareas, seccionesActivas, contexto) {
  const [, renderizar] = useReducer((n) => n + 1, 0);
  const [revision, setRevision] = useState(0);
  const montado = useRef(false);
  const gestor = useRef(null);
  if (!gestor.current) gestor.current = crearCargaReportes(() => { if (montado.current) renderizar(); });
  const consultas = tareas.filter((t) => t.habilitada !== false).map((t) => ({
    ...t, firma: JSON.stringify([contexto, revision, t.parametros])
  }));
  const visibles = consultas.filter((t) => seccionesActivas.includes(t.seccion));
  const firma = JSON.stringify(visibles.map((t) => [t.id, t.firma]));
  useEffect(() => {
    montado.current = true;
    gestor.current.actualizar(visibles);
    return () => { montado.current = false; gestor.current.pausar(); };
  }, [firma]);
  const datos = Object.fromEntries(consultas.map((t) => [t.id, gestor.current.leer(t)?.datos ?? null]));
  const estados = visibles.map((t) => [t.id, gestor.current.leer(t)]);
  return {
    datos,
    cargando: estados.some(([, e]) => !e || e.cargando),
    errores: Object.fromEntries(estados.filter(([, e]) => e?.error).map(([id, e]) => [id, e.error])),
    actualizadoEn: estados.reduce((ultima, [, e]) => e?.actualizadoEn > ultima ? e.actualizadoEn : ultima, null),
    actualizar: useCallback(() => setRevision((n) => n + 1), [])
  };
}
