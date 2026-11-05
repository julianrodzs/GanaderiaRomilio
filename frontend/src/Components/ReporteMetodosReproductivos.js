import React, { useEffect, useState } from 'react';
import { obtenerPartosMetodo, obtenerIndicadoresMetodo } from '../services/api';
import { EtiquetaMetodo } from './MetodoReproductivo';
import catalogo from '../constants/metodosReproductivos.json';
import { ContenidoPaginado } from './PaginacionTabla';
import { usePlan } from '../context/PlanContext';
import UpgradeMessage from './UpgradeMessage';
import { ATRIBUCIONES } from '../utils/etiquetasReportes.mjs';
import './Reportes.css';

const numero = (v) => v == null ? 'Sin datos' : Number(v).toLocaleString('es-CR', { maximumFractionDigits: 1 });
export const AtribucionReporte = ({ estado }) => {
  const etiqueta = ATRIBUCIONES[estado] || { texto: 'Sin datos', clase: 'sin-servicio' };
  return <span className={`atribucion-badge atribucion-${etiqueta.clase}`}>{etiqueta.texto}</span>;
};
export const TablaPartosMetodo = ({ partos }) => <ContenidoPaginado datos={partos} clavePaginacion="partos-metodo">
  {(filas) => <div className="tabla-scroll" tabIndex="0" role="region" aria-label="Partos por método reproductivo">
    <table><thead><tr><th scope="col">Fecha real</th><th scope="col">Animal</th><th scope="col">Método</th><th scope="col">Atribución</th></tr></thead>
      <tbody>{filas.map((p) => <tr key={p._id}>
        <td>{new Date(p.fecha).toLocaleDateString('es-CR', { timeZone: 'UTC' })}</td>
        <td>{p.animal?.diio || p.animal?.identificadorFinca || '--'} {p.animal?.nombre}</td>
        <td><EtiquetaMetodo registro={p} /></td><td><AtribucionReporte estado={p.estadoAtribucion} /></td>
      </tr>)}</tbody>
    </table>
  </div>}
</ContenidoPaginado>;

export function IndicadoresMetodo({ indicadores, especie }) {
  const filas = (indicadores.porMetodo || []).filter((m) => especie === 'Todos' || catalogo[m.metodo]?.especies.includes(especie));
  const sinServicio = filas.reduce((n, m) => n + Number(m.partosSinServicio || 0), 0);
  return <section className="reporte-metodos-indicadores">
    <h3>Indicadores por método</h3>
    <div className="tabla-scroll" tabIndex="0" role="region" aria-label="Indicadores por método">
      <table><thead><tr><th scope="col">Método</th>{['Partos registrados', 'Servicios', 'Preñeces atribuidas', 'Preñez / servicios', 'Servicios / concepción', 'Intervalo partos (días)', 'Pérdidas'].map((t) => <th scope="col" className="reporte-numero" key={t}>{t}</th>)}</tr></thead>
        <tbody>{filas.map((m) => <tr key={m.metodo}>
          <td><EtiquetaMetodo registro={m} /></td>
          <td className="reporte-numero">{numero(m.partos)}</td>
          <td className="reporte-numero">{numero(m.servicios)}</td><td className="reporte-numero">{numero(m.prenecesAtribuidas)}</td>
          <td className="reporte-numero">{numero(m.tasaPrenez)}{m.tasaPrenez == null ? '' : '%'}</td><td className="reporte-numero">{numero(m.serviciosPorConcepcion)}</td>
          <td className="reporte-numero">{numero(m.intervaloEntrePartosDias)}</td><td className="reporte-numero">{numero(m.perdidas)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="reporte-metodos-resumen"><span className="reporte-ia-chip">IA total: <strong>{numero(indicadores.iaTotal)}</strong></span></div>
    {sinServicio > 0 && <p className="reporte-cobertura-metodos">{numero(sinServicio)} parto(s) del período tienen un método declarado, pero no un servicio registrado. Se cuentan como partos, no como servicios ni preñeces atribuidas.</p>}
    <p className="reporte-metodos-nota">Cohorte de servicios del período. Preñeces atribuidas confirmadas; las atribuciones inciertas no se acreditan a un método. Sin denominador se muestra sin datos.</p>
    <p className="reporte-metodos-nota">Los partos corresponden a su fecha real; los servicios, a la fecha de monta o inseminación. Un parto de este período puede provenir de un servicio anterior.</p>
  </section>;
}

export default function ReporteMetodosReproductivos({ especie, fechaInicio, fechaFin }) {
  const [metodo, setMetodo] = useState('');
  const [partos, setPartos] = useState([]), [indicadores, setIndicadores] = useState(null);
  const [error, setError] = useState(''), [cargando, setCargando] = useState(true);
  const { tieneFeature } = usePlan();
  const avanzado = tieneFeature('analiticaProductiva');
  const metodoValido = !metodo || especie === 'Todos' || catalogo[metodo]?.especies.includes(especie) ? metodo : '';
  useEffect(() => {
    let activo = true; setError(''); setPartos([]); setIndicadores(null); setCargando(true);
    const filtros = { ...(especie !== 'Todos' ? { especie } : {}), fechaInicio, fechaFin, metodo: metodoValido };
    Promise.allSettled([obtenerPartosMetodo(filtros), avanzado ? obtenerIndicadoresMetodo(filtros) : Promise.resolve(null)]).then(([p, i]) => {
      if (!activo) return;
      if (p.status === 'fulfilled') setPartos(p.value.partos || []);
      if (i.status === 'fulfilled') setIndicadores(i.value);
      setError([p, i].filter((r) => r.status === 'rejected').map((r) => r.reason.message).join(' '));
      setCargando(false);
    });
    return () => { activo = false; };
  }, [especie, fechaInicio, fechaFin, metodoValido, avanzado]);
  return <section className="reporte-panel reporte-metodos">
    <div className="panel-title"><div><p className="eyebrow">Reproducción</p><h3>Partos por método reproductivo</h3></div>
      <label className="reporte-metodos-filtro">Método<select value={metodoValido} onChange={(e) => setMetodo(e.target.value)}><option value="">Todos</option>{Object.entries(catalogo).filter(([, c]) => especie === 'Todos' || c.especies.includes(especie)).map(([v, c]) => <option key={v} value={v}>{c.nombre}</option>)}</select></label>
    </div>
    <p className="reporte-metodos-nota">Partos reales registrados en el período; puede haber antecedentes de vida no registrados.</p>
    {error && <div role="alert" className="alerta-formulario">{error}</div>}
    {cargando && <p role="status">Cargando métodos reproductivos...</p>}
    <TablaPartosMetodo partos={partos} />
    {!cargando && !partos.length && <p className="reporte-vacio">Sin partos registrados en este período.</p>}
    {indicadores && <IndicadoresMetodo indicadores={indicadores} especie={especie} />}
    {!avanzado && <UpgradeMessage feature="analiticaProductiva" titulo="Indicadores por método" pregunta="¿Cómo se comparan la preñez, los servicios y las pérdidas entre métodos reproductivos?" etiqueta="Analítica reproductiva" />}
  </section>;
}
