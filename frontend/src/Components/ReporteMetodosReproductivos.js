import React, { useEffect, useState } from 'react';
import { obtenerPartosMetodo, obtenerIndicadoresMetodo } from '../services/api';
import { EtiquetaMetodo } from './MetodoReproductivo';
import catalogo from '../constants/metodosReproductivos.json';
import { ContenidoPaginado } from './PaginacionTabla';
import { usePlan } from '../context/PlanContext';

export default function ReporteMetodosReproductivos({ especie, fechaInicio, fechaFin }) {
  const [metodo, setMetodo] = useState(''); const [partos, setPartos] = useState([]); const [indicadores, setIndicadores] = useState(null); const [error, setError] = useState('');
  const { tieneFeature } = usePlan();
  const avanzado = tieneFeature('analiticaProductiva');
  useEffect(() => {
    let activo = true; setError(''); setPartos([]); setIndicadores(null);
    const filtros = { ...(especie !== 'Todos' ? { especie } : {}), fechaInicio, fechaFin, metodo };
    Promise.all([obtenerPartosMetodo(filtros), avanzado ? obtenerIndicadoresMetodo(filtros) : null]).then(([p, i]) => { if (activo) { setPartos(p.partos); setIndicadores(i); } }).catch((e) => { if (activo) setError(e.message); });
    return () => { activo = false; };
  }, [especie, fechaInicio, fechaFin, metodo, avanzado]);
  const numero = (v) => v == null ? '--' : Number(v).toLocaleString('es-CR', { maximumFractionDigits: 1 });
  return <section className="reporte-panel"><div className="panel-title"><div><p className="eyebrow">Reproducción</p><h3>Partos por método reproductivo</h3></div><label>Método<select value={metodo} onChange={(e) => setMetodo(e.target.value)}><option value="">Todos</option>{Object.entries(catalogo).filter(([, c]) => especie === 'Todos' || c.especies.includes(especie)).map(([v, c]) => <option key={v} value={v}>{c.nombre}</option>)}</select></label></div>
    <p>Partos reales registrados en el período; puede haber antecedentes de vida no registrados.</p>
    {error && <div role="alert" className="alerta-formulario">{error}</div>}
    <ContenidoPaginado datos={partos} clavePaginacion="partos-metodo">{(filas) => <div className="tabla-scroll"><table><thead><tr><th>Fecha real</th><th>Animal</th><th>Método</th><th>Atribución</th></tr></thead><tbody>{filas.map((p) => <tr key={p._id}><td>{new Date(p.fecha).toLocaleDateString('es-CR', { timeZone: 'UTC' })}</td><td>{p.animal?.diio || p.animal?.identificadorFinca} {p.animal?.nombre}</td><td><EtiquetaMetodo registro={p} /></td><td>{p.estadoAtribucion}</td></tr>)}</tbody></table></div>}</ContenidoPaginado>
    {indicadores && <><h3>Indicadores por método</h3><div className="tabla-scroll"><table><thead><tr><th>Método</th><th>Servicios</th><th>Preñeces atribuidas</th><th>Preñez / servicios</th><th>Servicios / concepción</th><th>Intervalo partos (días)</th><th>Pérdidas</th></tr></thead><tbody>{indicadores.porMetodo.filter((m) => especie === 'Todos' || catalogo[m.metodo].especies.includes(especie)).map((m) => <tr key={m.metodo}><td>{m.nombre}</td><td>{numero(m.servicios)}</td><td>{numero(m.prenecesAtribuidas)}</td><td>{numero(m.tasaPrenez)}{m.tasaPrenez == null ? '' : '%'}</td><td>{numero(m.serviciosPorConcepcion)}</td><td>{numero(m.intervaloEntrePartosDias)}</td><td>{numero(m.perdidas)}</td></tr>)}</tbody></table></div><p>IA total: {numero(indicadores.iaTotal)}</p><small>{indicadores.criterio}</small></>}
  </section>;
}
