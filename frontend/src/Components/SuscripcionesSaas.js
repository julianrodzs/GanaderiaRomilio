import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { actualizarSuscripcionSaas, anularPagoSaas, crearClaveIdempotencia, obtenerMisPagos, obtenerPagosSaas, registrarPagoSaas } from '../services/api';
import { ESTADOS_SUSCRIPCION, METODOS_PAGO, PLANES_SUSCRIPCION, fechaSuscripcion, fechaCampo, montoSuscripcion, previsualizarVencimiento } from '../utils/suscripciones.mjs';
import './SuscripcionesSaas.css';
import { usePaginacionControlada } from './PaginacionTabla';

export const EstadoSuscripcion = ({ suscripcion }) => <span className={`suscripcion-badge suscripcion-${suscripcion?.estadoSuscripcion || 'PENDIENTE'}`}>{suscripcion?.vigenciaPendiente ? 'Vigencia por configurar' : ESTADOS_SUSCRIPCION[suscripcion?.estadoSuscripcion] || 'Por configurar'}</span>;

export const DialogoSuscripcion = ({ titulo, onCerrar, children }) => {
  const ref = useRef(null), id = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="suscripcion-dialogo" aria-labelledby={id} onCancel={(e) => { e.preventDefault(); onCerrar(); }}>
    <header><h2 id={id}>{titulo}</h2><button type="button" className="boton-link" onClick={onCerrar} aria-label="Cerrar diálogo">Cerrar</button></header>{children}
  </dialog>;
};

export const HistorialPagosSuscripcion = ({ organizacion = null, alActualizar }) => {
  const [datos, setDatos] = useState(null), [error, setError] = useState('');
  const { pagina, setPagina } = usePaginacionControlada(`suscripcion-pagos:${organizacion?._id || 'cliente'}`);
  const [cargando, setCargando] = useState(true), [anulando, setAnulando] = useState(null), [motivo, setMotivo] = useState(''), [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { setDatos(await (organizacion ? obtenerPagosSaas(organizacion._id, pagina) : obtenerMisPagos(pagina))); }
    catch (e) { setError(e.message); } finally { setCargando(false); }
  }, [organizacion?._id, pagina]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (datos && pagina > datos.totalPaginas) setPagina(datos.totalPaginas); }, [datos, pagina]);
  const anular = async (e) => {
    e.preventDefault(); setOcupado(true); setError('');
    try { await anularPagoSaas(organizacion._id, anulando._id, motivo); setAnulando(null); setMotivo(''); await cargar(); await alActualizar?.(); }
    catch (err) { setError(err.message); } finally { setOcupado(false); }
  };
  return <section className="suscripcion-historial">
    {error && <p role="alert" className="alerta-formulario">{error}</p>}
    {cargando && <p role="status">Cargando pagos...</p>}
    {!cargando && datos && <><div className="tabla-scroll"><table><thead><tr><th>Fecha</th><th>Plan / método</th><th>Comprobante</th><th>Monto</th><th>Período cubierto</th><th>Estado</th>{organizacion && <th>Acciones</th>}</tr></thead><tbody>
      {datos.pagos.map((p) => <tr key={p._id}><td>{fechaSuscripcion(p.fechaPago)}</td><td>{PLANES_SUSCRIPCION[p.plan]}<small>{METODOS_PAGO[p.metodoPago]}</small></td><td>{p.referenciaComprobante || '--'}</td><td className="suscripcion-numero">{montoSuscripcion(p.monto, p.moneda)}<small>{p.moneda}</small></td><td>{fechaSuscripcion(p.periodoCubiertoInicio)}<small>al {fechaSuscripcion(p.periodoCubiertoFin)}</small></td><td>{p.estado === 'ANULADO' ? 'Anulado' : 'Registrado'}{p.motivoAnulacion && <small>{p.motivoAnulacion}</small>}</td>{organizacion && <td>{p.estado === 'REGISTRADO' && <button type="button" className="boton-peligro compacto" onClick={() => { setAnulando(p); setError(''); }}>Anular</button>}</td>}</tr>)}
      {!datos.pagos.length && <tr><td colSpan={organizacion ? 7 : 6}>No hay pagos registrados.</td></tr>}
    </tbody></table></div><div className="suscripcion-paginacion"><span>{datos.total} pagos · Página {datos.pagina} de {datos.totalPaginas}</span><button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina(pagina - 1)} aria-label="Página anterior">←</button><button type="button" disabled={pagina >= datos.totalPaginas || cargando} onClick={() => setPagina(pagina + 1)} aria-label="Página siguiente">→</button></div></>}
    {anulando && <form onSubmit={anular} className="suscripcion-anulacion"><h3>Anular pago de {montoSuscripcion(anulando.monto, anulando.moneda)}</h3><label>Motivo de anulación<textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required maxLength={2000} /></label><div className="form-actions"><button type="button" disabled={ocupado} onClick={() => setAnulando(null)}>Cancelar</button><button type="submit" className="boton-peligro" disabled={ocupado || !motivo.trim()}>{ocupado ? 'Anulando...' : 'Confirmar anulación'}</button></div></form>}
  </section>;
};

export const CamposPagoSuscripcion = ({ datos, onChange }) => {
  const campo = (clave, valor) => onChange({ ...datos, [clave]: valor });
  return <div className="suscripcion-form-grid">
    <label>Método<select value={datos.metodoPago} onChange={(e) => campo('metodoPago', e.target.value)}>{Object.entries(METODOS_PAGO).filter(([k]) => k !== 'STRIPE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label>Moneda<select value={datos.moneda} onChange={(e) => campo('moneda', e.target.value)}><option>CRC</option><option>USD</option></select></label>
    <label>Monto<input type="number" value={datos.monto} onChange={(e) => campo('monto', e.target.value)} min="0.01" step="0.01" max="1000000000000" required /></label>
    <label>Número de comprobante<input value={datos.referenciaComprobante} onChange={(e) => campo('referenciaComprobante', e.target.value)} maxLength={200} required={['SINPE_MOVIL', 'TRANSFERENCIA_IBAN'].includes(datos.metodoPago)} /></label>
    <label>Meses cubiertos<select value={datos.mesesCubiertos} onChange={(e) => campo('mesesCubiertos', Number(e.target.value))}>{[1, 3, 6, 12].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'mes' : 'meses'}</option>)}</select></label>
    <label>Fin personalizado (opcional)<input type="date" value={datos.fechaFinPersonalizada || ''} onChange={(e) => campo('fechaFinPersonalizada', e.target.value)} /></label>
    <label className="suscripcion-ancho">Notas<textarea value={datos.notas} onChange={(e) => campo('notas', e.target.value)} maxLength={2000} /></label>
  </div>;
};
export const pagoInicialVacio = () => ({ metodoPago: 'SINPE_MOVIL', moneda: 'CRC', monto: '', referenciaComprobante: '', mesesCubiertos: 1, notas: '', claveIdempotencia: crearClaveIdempotencia() });

export const GestionSuscripcionSaas = ({ organizacion: org, tipo, onCerrar, alActualizar }) => {
  const [pago, setPago] = useState(pagoInicialVacio), [error, setError] = useState(''), [ocupado, setOcupado] = useState(false);
  const [ajuste, setAjuste] = useState({ plan: org.plan.codigo, especiePlan: org.plan.especiePlan || 'Bovino',
    estadoSuscripcion: ['ACTIVA', 'PRUEBA', 'SUSPENDIDA', 'CANCELADA'].includes(org.suscripcion?.estadoSuscripcion) ? org.suscripcion.estadoSuscripcion : 'ACTIVA',
    fechaProximoVencimiento: fechaCampo(org.suscripcion?.fechaProximoVencimiento), diasPrueba: '', diasGracia: org.diasGracia ?? 5, notasFacturacion: org.notasFacturacion || '' });
  const guardar = async (e) => {
    e.preventDefault(); setOcupado(true); setError('');
    try {
      if (tipo === 'pago') await registrarPagoSaas(org._id, { ...pago, monto: Number(pago.monto), ...(pago.fechaFinPersonalizada ? {} : { fechaFinPersonalizada: undefined }) });
      else await actualizarSuscripcionSaas(org._id, { ...ajuste, revision: org.revisionSuscripcion || 0,
        diasPrueba: ajuste.estadoSuscripcion === 'PRUEBA' && ajuste.diasPrueba ? Number(ajuste.diasPrueba) : undefined, diasGracia: Number(ajuste.diasGracia),
        fechaProximoVencimiento: ajuste.fechaProximoVencimiento || undefined, especiePlan: ajuste.plan === 'ESENCIAL' ? ajuste.especiePlan : undefined });
      await alActualizar(); onCerrar();
    } catch (err) { setError(err.data?.detalles ? `${err.message} ${err.data.detalles.map((d) => d.mensaje || `${d.recurso}: ${d.actual} actuales / ${d.limite} permitidos`).join(' · ')}` : err.message); } finally { setOcupado(false); }
  };
  const campo = (k, v) => setAjuste((a) => ({ ...a, [k]: v }));
  return <DialogoSuscripcion titulo={`${tipo === 'pago' ? 'Registrar pago / renovar' : tipo === 'ajuste' ? 'Cambiar plan / vigencia' : 'Historial de pagos'} · ${org.nombre}`} onCerrar={() => !ocupado && onCerrar()}>
    {tipo === 'historial' ? <HistorialPagosSuscripcion organizacion={org} alActualizar={alActualizar} /> : <form onSubmit={guardar}>
      {tipo === 'pago' ? <><div className="suscripcion-form-grid"><label>Plan a renovar<select value={pago.planOpcional || org.plan.codigo} onChange={(e) => setPago((p) => ({ ...p, planOpcional: e.target.value, especiePlan: e.target.value === 'ESENCIAL' ? p.especiePlan || org.plan.especiePlan || 'Bovino' : undefined }))}>{Object.entries(PLANES_SUSCRIPCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>{pago.planOpcional === 'ESENCIAL' && <label>Especie del plan<select value={pago.especiePlan || 'Bovino'} onChange={(e) => setPago((p) => ({ ...p, especiePlan: e.target.value }))}><option>Bovino</option><option>Porcino</option></select></label>}</div><CamposPagoSuscripcion datos={pago} onChange={setPago} /><p className="suscripcion-preview">Nueva vigencia estimada hasta: <strong>{fechaSuscripcion(previsualizarVencimiento(org, pago.mesesCubiertos, pago.fechaFinPersonalizada))}</strong></p></> : <div className="suscripcion-form-grid">
        <label>Plan<select value={ajuste.plan} onChange={(e) => campo('plan', e.target.value)}>{Object.entries(PLANES_SUSCRIPCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {ajuste.plan === 'ESENCIAL' && <label>Especie<select value={ajuste.especiePlan} onChange={(e) => campo('especiePlan', e.target.value)}><option>Bovino</option><option>Porcino</option></select></label>}
        <label>Estado<select value={ajuste.estadoSuscripcion} onChange={(e) => campo('estadoSuscripcion', e.target.value)}>{['ACTIVA', 'PRUEBA', 'SUSPENDIDA', 'CANCELADA'].map((k) => <option key={k} value={k}>{ESTADOS_SUSCRIPCION[k]}</option>)}</select></label>
        <label>Vencimiento<input type="date" value={ajuste.fechaProximoVencimiento} onChange={(e) => campo('fechaProximoVencimiento', e.target.value)} required={!ajuste.diasPrueba} /></label>
        {ajuste.estadoSuscripcion === 'PRUEBA' && <label>Días adicionales de prueba<input type="number" value={ajuste.diasPrueba} onChange={(e) => campo('diasPrueba', e.target.value)} min="1" max="365" /></label>}
        <label>Días de gracia<input type="number" value={ajuste.diasGracia} onChange={(e) => campo('diasGracia', e.target.value)} min="0" max="60" required /></label>
        <label className="suscripcion-ancho">Notas de facturación<textarea value={ajuste.notasFacturacion} onChange={(e) => campo('notasFacturacion', e.target.value)} maxLength={2000} /></label>
      </div>}
      {error && <p role="alert" className="alerta-formulario">{error}</p>}
      <div className="form-actions"><button type="button" disabled={ocupado} onClick={onCerrar}>Cancelar</button><button type="submit" className="boton-primario" disabled={ocupado}>{ocupado ? 'Guardando...' : tipo === 'pago' ? 'Registrar pago' : 'Guardar cambios'}</button></div>
    </form>}
  </DialogoSuscripcion>;
};
