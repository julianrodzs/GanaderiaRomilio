import React, { memo, useEffect, useId, useState } from 'react';
import { SECCIONES_REPORTES, leerPreferenciasReportes, contarReportes, preferenciasIniciales } from '../utils/seccionesReportes.mjs';
import './Reportes.css';

// Congelar las props ocultas conserva los formularios sin consultar fechas nuevas hasta reabrir.
const ContenidoSeccion = memo(({ bloques }) => bloques.map((b) => <React.Fragment key={b.id}>{b.contenido}</React.Fragment>),
  (anterior, siguiente) => !siguiente.activa || anterior.bloques === siguiente.bloques);

export default function ReportesPorSecciones({ bloques, clavePersistencia, onCambiarSecciones }) {
  const [preferencias, setPreferencias] = useState(() => {
    try { return leerPreferenciasReportes(window.sessionStorage, clavePersistencia); } catch { return preferenciasIniciales(); }
  });
  const [visitadas, setVisitadas] = useState(() => preferencias.abiertas.filter((id) => preferencias.seleccion === 'todas' || preferencias.seleccion === id));
  const prefijo = useId();
  useEffect(() => {
    try { window.sessionStorage.setItem(clavePersistencia, JSON.stringify({ version: 1, ...preferencias })); } catch { /* Preferencias opcionales en navegadores restringidos. */ }
    const activas = preferencias.abiertas.filter((id) => preferencias.seleccion === 'todas' || preferencias.seleccion === id);
    setVisitadas((actuales) => [...new Set([...actuales, ...activas])]);
    onCambiarSecciones?.(activas);
  }, [preferencias, clavePersistencia, onCambiarSecciones]);
  const seleccionar = (id) => setPreferencias((p) => ({ seleccion: id, abiertas: id === 'todas' ? p.abiertas : [...new Set([...p.abiertas, id])] }));
  const alternar = (id) => setPreferencias((p) => ({ ...p, abiertas: p.abiertas.includes(id) ? p.abiertas.filter((s) => s !== id) : [...p.abiertas, id] }));
  return <div className="reportes-organizados">
    <div className="reportes-navegacion">
      <nav className="reportes-accesos" aria-label="Secciones de reportes">
        {[{ id: 'todas', corto: 'Todas las secciones' }, ...SECCIONES_REPORTES].map((s) => <button key={s.id} type="button" aria-pressed={preferencias.seleccion === s.id} onClick={() => seleccionar(s.id)}>{s.corto}</button>)}
      </nav>
      <div className="reportes-acciones-secciones">
        <button type="button" onClick={() => setPreferencias({ seleccion: 'todas', abiertas: SECCIONES_REPORTES.map((s) => s.id) })}>Expandir todas</button>
        <button type="button" onClick={() => setPreferencias((p) => ({ ...p, abiertas: [] }))}>Contraer todas</button>
      </div>
    </div>
    {SECCIONES_REPORTES.map((s) => {
      const items = bloques.filter((b) => b.seccion === s.id && b.visible !== false);
      const conteo = contarReportes(items), abierta = preferencias.abiertas.includes(s.id);
      const control = `${prefijo}-${s.id}`;
      return <section key={s.id} className="reportes-seccion" data-seccion={s.id} hidden={preferencias.seleccion !== 'todas' && preferencias.seleccion !== s.id}>
        <h2 className="reportes-seccion-titulo"><button id={`${control}-titulo`} type="button" className="reportes-seccion-cabecera" aria-expanded={abierta} aria-controls={control} onClick={() => alternar(s.id)}>
          <span className="reportes-seccion-textos"><span>{s.nombre}</span><small>{s.resumen}</small></span>
          <span className="reportes-seccion-conteo">{conteo.disponibles} disponibles{conteo.total > conteo.disponibles && <small>{conteo.total - conteo.disponibles} requieren otro plan</small>}</span>
          <span className={`reportes-chevron${abierta ? ' abierto' : ''}`} aria-hidden="true">▸</span>
        </button></h2>
        <div id={control} role="region" aria-labelledby={`${control}-titulo`} aria-hidden={!abierta} inert={!abierta} className={`reportes-seccion-cuerpo${abierta ? ' abierto' : ''}`}>
          <div className="reportes-seccion-recorte"><div className="reportes-seccion-contenido">
            {(visitadas.includes(s.id) || (abierta && (preferencias.seleccion === 'todas' || preferencias.seleccion === s.id))) && <ContenidoSeccion activa={abierta && (preferencias.seleccion === 'todas' || preferencias.seleccion === s.id)} bloques={items} />}
          </div></div>
        </div>
      </section>;
    })}
  </div>;
}
