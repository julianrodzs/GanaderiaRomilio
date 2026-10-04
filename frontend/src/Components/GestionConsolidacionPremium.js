import React, { useEffect, useState } from 'react';
import {
  crearCierreMultiFinca,
  descargarCierreMultiFinca,
  descargarReporteMultiFinca,
  eliminarMetaMultiFinca,
  guardarMetaMultiFinca,
  obtenerCierresMultiFinca,
  obtenerCierreMultiFinca,
  obtenerMetasMultiFinca
} from '../services/api';

const camposMeta = [
  ['animalesActivos', 'Animales activos'], ['pesoPromedioKg', 'Peso promedio kg'],
  ['ingresos', 'Ingresos'], ['egresosMaximos', 'Egresos máximos'], ['balance', 'Balance'],
  ['partos', 'Partos'], ['destetes', 'Destetes'], ['aplicacionesSanitarias', 'Aplicaciones sanitarias']
];

const GestionConsolidacionPremium = ({ fincas, seleccionadas, fechaInicio, fechaFin, especie, datos, puedeConfigurar, onActualizar }) => {
  const [metas, setMetas] = useState([]);
  const [cierres, setCierres] = useState([]);
  const [cierreDetalle, setCierreDetalle] = useState(null);
  const [meta, setMeta] = useState({ alcance: 'ORGANIZACION', finca: '', nombre: '', fechaInicio, fechaFin, metas: {} });
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);

  const cargar = async () => {
    try {
      const [metasData, cierresData] = await Promise.all([obtenerMetasMultiFinca(), obtenerCierresMultiFinca()]);
      setMetas(metasData); setCierres(cierresData);
    } catch (err) { setError(err.message); }
  };
  useEffect(() => { cargar(); }, []);
  useEffect(() => { setMeta((actual) => ({ ...actual, fechaInicio, fechaFin })); }, [fechaInicio, fechaFin]);

  const exportar = async () => {
    try {
      setProcesando(true); setError('');
      const archivo = await descargarReporteMultiFinca({ fechaInicio, fechaFin, especie: especie === 'Todos' ? '' : especie, fincaIds: seleccionadas.join(',') });
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a'); enlace.href = url; enlace.download = `consolidado-multifinca-${fechaInicio}-${fechaFin}.xlsx`; enlace.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  };

  const cerrarPeriodo = async () => {
    const nombre = window.prompt('Nombre del cierre:', `Cierre ${fechaInicio} a ${fechaFin}`);
    if (!nombre) return;
    try {
      setProcesando(true); setError('');
      await crearCierreMultiFinca({ nombre, fechaInicio, fechaFin, especie, fincaIds: seleccionadas });
      setMensaje('El período quedó guardado como una fotografía inmutable.'); await cargar();
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  };

  const guardarMeta = async (evento) => {
    evento.preventDefault();
    try {
      setProcesando(true); setError('');
      await guardarMetaMultiFinca(meta); setMensaje('Meta guardada.');
      setMeta((actual) => ({ ...actual, nombre: '', metas: {} })); await cargar(); await onActualizar?.();
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  };

  const borrarMeta = async (id) => {
    if (!window.confirm('¿Eliminar esta meta? Los cierres históricos no cambiarán.')) return;
    try { await eliminarMetaMultiFinca(id); await cargar(); await onActualizar?.(); } catch (err) { setError(err.message); }
  };

  const verCierre = async (id) => {
    try {
      setProcesando(true); setError('');
      setCierreDetalle(await obtenerCierreMultiFinca(id));
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  };

  const exportarCierre = async (formato) => {
    try {
      setProcesando(true); setError('');
      const archivo = await descargarCierreMultiFinca(cierreDetalle._id, formato);
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `cierre-${cierreDetalle.nombre}.${formato}`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  };

  const numero = (valor) => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(Number(valor || 0));

  return (
    <section className="gestion-consolidacion">
      <div className="acciones-consolidacion">
        <button className="boton-secundario" type="button" onClick={exportar} disabled={procesando || !seleccionadas.length}>Descargar Excel</button>
        {puedeConfigurar && <button className="boton-primario" type="button" onClick={cerrarPeriodo} disabled={procesando || !seleccionadas.length}>Cerrar período</button>}
      </div>
      {error && <div className="alerta-formulario">{error}</div>}
      {mensaje && <p className="form-message">{mensaje}</p>}

      {(datos?.evolucionMensual || []).length > 0 && (
        <section className="consolidacion-subpanel"><div className="panel-title compacto"><div><p className="eyebrow">Evolución</p><h3>Resultado mensual por finca</h3></div></div>
          <div className="tabla-scroll tabla-dinamica"><table><thead><tr><th>Período</th><th>Finca</th><th>Moneda</th><th>Ingresos</th><th>Egresos</th><th>Balance</th></tr></thead><tbody>{datos.evolucionMensual.map((item) => { const finca = fincas.find((f) => f._id === item.fincaId); return <tr key={`${item.fincaId}-${item.moneda}-${item.anio}-${item.mes}`}><td>{String(item.mes).padStart(2, '0')}/{item.anio}</td><td>{finca?.nombre || '--'}</td><td>{item.moneda}</td><td>{item.ingresos}</td><td>{item.egresos}</td><td>{item.balance}</td></tr>; })}</tbody></table></div>
        </section>
      )}

      {puedeConfigurar && (
        <form className="consolidacion-subpanel meta-consolidacion-form" onSubmit={guardarMeta}>
          <div className="panel-title compacto"><div><p className="eyebrow">Objetivos</p><h3>Nueva meta del período</h3></div></div>
          <div className="form-grid">
            <label>Alcance<select value={meta.alcance} onChange={(e) => setMeta((actual) => ({ ...actual, alcance: e.target.value, finca: '' }))}><option value="ORGANIZACION">Organización</option><option value="FINCA">Finca</option></select></label>
            {meta.alcance === 'FINCA' && <label>Finca<select required value={meta.finca} onChange={(e) => setMeta((actual) => ({ ...actual, finca: e.target.value }))}><option value="">Seleccionar</option>{fincas.map((finca) => <option key={finca._id} value={finca._id}>{finca.codigo} · {finca.nombre}</option>)}</select></label>}
            <label>Nombre<input required value={meta.nombre} onChange={(e) => setMeta((actual) => ({ ...actual, nombre: e.target.value }))} /></label>
            <label>Desde<input required type="date" value={meta.fechaInicio} onChange={(e) => setMeta((actual) => ({ ...actual, fechaInicio: e.target.value }))} /></label>
            <label>Hasta<input required type="date" value={meta.fechaFin} onChange={(e) => setMeta((actual) => ({ ...actual, fechaFin: e.target.value }))} /></label>
          </div>
          <div className="metas-valores-grid">{camposMeta.map(([campo, etiqueta]) => <label key={campo}>{etiqueta}<input min={campo === 'balance' ? undefined : '0'} step="0.01" type="number" value={meta.metas[campo] || ''} onChange={(e) => setMeta((actual) => ({ ...actual, metas: { ...actual.metas, [campo]: e.target.value } }))} /></label>)}</div>
          <button className="boton-primario" type="submit" disabled={procesando}>Guardar meta</button>
        </form>
      )}

      <div className="consolidacion-dos-columnas">
        <section className="consolidacion-subpanel"><h3>Metas vigentes</h3>{metas.length ? metas.map((item) => <article className="meta-consolidacion-item" key={item._id}><div><strong>{item.nombre}</strong><span>{item.alcance === 'FINCA' ? item.finca?.nombre : 'Toda la organización'} · {new Date(item.fechaInicio).toLocaleDateString('es-CR')} a {new Date(item.fechaFin).toLocaleDateString('es-CR')}</span></div>{puedeConfigurar && <button className="boton-secundario compacto peligro" type="button" onClick={() => borrarMeta(item._id)}>Eliminar</button>}</article>) : <p className="reporte-vacio">Sin metas definidas.</p>}</section>
        <section className="consolidacion-subpanel"><h3>Cierres históricos</h3>{cierres.length ? cierres.map((item) => <article className="meta-consolidacion-item" key={item._id}><div><strong>{item.nombre}</strong><span>{new Date(item.fechaInicio).toLocaleDateString('es-CR')} a {new Date(item.fechaFin).toLocaleDateString('es-CR')} · {item.fincas.length} finca(s)</span></div><div className="acciones-tabla"><span className="estado-badge activo">Cerrado</span><button type="button" onClick={() => verCierre(item._id)} disabled={procesando}>Ver</button></div></article>) : <p className="reporte-vacio">Sin períodos cerrados.</p>}</section>
      </div>

      {cierreDetalle && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(evento) => evento.target === evento.currentTarget && setCierreDetalle(null)}>
          <section className="modal-panel detalle-consolidacion-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-cierre-historico">
            <div className="panel-title">
              <div><p className="eyebrow">Cierre histórico</p><h2 id="titulo-cierre-historico">{cierreDetalle.nombre}</h2></div>
              <button className="boton-link" type="button" onClick={() => setCierreDetalle(null)}>Cerrar</button>
            </div>
            <p>{new Date(cierreDetalle.fechaInicio).toLocaleDateString('es-CR')} a {new Date(cierreDetalle.fechaFin).toLocaleDateString('es-CR')} · {cierreDetalle.especie}</p>
            <div className="acciones-consolidacion">
              <button className="boton-secundario compacto" type="button" onClick={() => exportarCierre('xlsx')} disabled={procesando}>Descargar Excel</button>
              <button className="boton-secundario compacto" type="button" onClick={() => exportarCierre('pdf')} disabled={procesando}>Descargar PDF</button>
            </div>
            <div className="reportes-metricas">
              <article><span>Fincas</span><strong>{numero(cierreDetalle.datos?.consolidado?.fincas)}</strong></article>
              <article><span>Animales activos</span><strong>{numero(cierreDetalle.datos?.consolidado?.animalesActivos)}</strong></article>
              <article><span>Ingresos</span><strong>{numero(cierreDetalle.datos?.consolidado?.ingresos)}</strong></article>
              <article><span>Egresos</span><strong>{numero(cierreDetalle.datos?.consolidado?.egresos)}</strong></article>
              <article><span>Balance</span><strong>{numero(cierreDetalle.datos?.consolidado?.balance)}</strong></article>
            </div>
            <div className="tabla-scroll tabla-dinamica">
              <table><thead><tr><th>Finca</th><th>Activos</th><th>Peso promedio</th><th>Ingresos</th><th>Egresos</th><th>Balance</th></tr></thead>
                <tbody>{(cierreDetalle.datos?.fincas || []).map((item) => <tr key={item.finca?._id || item.finca?.codigo}><td>{item.finca?.codigo} · {item.finca?.nombre}</td><td>{numero(item.inventario?.activos)}</td><td>{item.inventario?.pesoPromedio == null ? '--' : `${numero(item.inventario.pesoPromedio)} kg`}</td><td>{numero(item.finanzas?.ingresos)}</td><td>{numero(item.finanzas?.egresos)}</td><td>{numero(item.finanzas?.balance)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default GestionConsolidacionPremium;
