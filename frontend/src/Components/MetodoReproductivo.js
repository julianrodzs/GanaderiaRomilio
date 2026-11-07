import React, { useEffect, useState } from 'react';
import catalogo from '../constants/metodosReproductivos.json';
import { etiquetaUsuarioConRol } from '../utils/usuarios';
import { crearClaveIdempotencia, operarMetodoReproductivo, obtenerTE } from '../services/api';
import { usePlan } from '../context/PlanContext';
import './MetodoReproductivo.css';

export const metodoDeRegistro = (r) => r.metodo || (r.campanaIATF || r.tipoInseminacion === 'IATF' || r.origenGestacion === 'IATF' ? 'IATF' : r.tipoRegistro === 'Monta' || r.origenGestacion === 'MONTA_NATURAL' ? 'MONTA_NATURAL' : r.tipoRegistro === 'Inseminación' || r.origenGestacion === 'IA_CONVENCIONAL' ? 'IA_CONVENCIONAL' : r.origenGestacion === 'TRANSFERENCIA_EMBRIONES' ? 'TRANSFERENCIA_EMBRIONES' : 'DESCONOCIDO');
export const EtiquetaMetodo = ({ registro }) => <span className={`metodo-badge metodo-${metodoDeRegistro(registro)}`}>{catalogo[metodoDeRegistro(registro)]?.nombre || 'Desconocido'}</span>;
const nombre = (a) => `${a.diio || a.identificadorFinca || '--'}${a.nombre ? ` · ${a.nombre}` : ''}`;
const hoy = () => new Date().toISOString().slice(0, 10);
const limpia = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
const opcionesAnimales = (lista) => lista.map((a) => <option key={a._id} value={a._id}>{nombre(a)}</option>);

export function CamposServicio({ datos, setDatos, animales, especie, usuarios = [], semenDisponible = [] }) {
  const { tieneFeature } = usePlan();
  const puedeBanco = tieneFeature('programaTransferencia');
  const [embriones, setEmbriones] = useState([]), [errorBanco, setErrorBanco] = useState('');
  useEffect(() => { let activo = true; if (datos.metodo === 'TRANSFERENCIA_EMBRIONES' && puedeBanco) obtenerTE('banco').then((l) => { if (activo) setEmbriones(l.filter((e) => e.stockReproductivo > 0)); }).catch((e) => { if (activo) setErrorBanco(e.message); }); return () => { activo = false; }; }, [datos.metodo, puedeBanco]);
  const cambiar = (e) => setDatos({ ...datos, [e.target.name]: e.target.value });
  const embrion = datos.embrion || { origenEmbrion: 'IN_VIVO', estadoEmbrion: 'FRESCO', moneda: 'CRC', edadDias: 7 };
  const cambiarEmbrion = (e) => setDatos({ ...datos, embrion: { ...embrion, [e.target.name]: e.target.value } });
  return <>
    <div className="form-grid">
      <label>Método reproductivo<select name="metodo" value={datos.metodo} onChange={(e) => setDatos({ metodo: e.target.value, claveIdempotencia: datos.claveIdempotencia })}>{Object.entries(catalogo).filter(([, c]) => c.especies.includes(especie)).map(([v, c]) => <option key={v} value={v}>{c.nombre}</option>)}</select></label>
      {datos.metodo === 'TRANSFERENCIA_EMBRIONES' && puedeBanco && <label>Embrión del banco<select name="loteEmbrionId" value={datos.loteEmbrionId || ''} onChange={cambiar}><option value="">Registro puntual sin inventario</option>{embriones.map((e) => <option key={e._id} value={e._id}>{e.codigoLote} · {e.estadoConservacion} · {e.stockReproductivo} disponibles</option>)}</select>{errorBanco && <span role="alert">{errorBanco}</span>}</label>}
      {datos.metodo === 'MONTA_NATURAL' && <label>Modalidad<select name="submodalidad" value={datos.submodalidad || 'CONTROLADA'} onChange={cambiar}><option value="CONTROLADA">Controlada</option><option value="LIBRE">Libre</option></select></label>}
      {datos.metodo !== 'DESCONOCIDO' && <label>Fecha del servicio<input type="date" name="fechaServicio" value={datos.fechaServicio || ''} onChange={cambiar} required={datos.metodo !== 'MONTA_NATURAL'} /></label>}
      {datos.metodo === 'MONTA_NATURAL' && datos.submodalidad === 'LIBRE' && !datos.fechaServicio && <>
        <label>Exposición desde<input type="date" name="fechaServicioDesde" value={datos.fechaServicioDesde || ''} onChange={cambiar} /></label>
        <label>Exposición hasta<input type="date" name="fechaServicioHasta" value={datos.fechaServicioHasta || ''} onChange={cambiar} required={Boolean(datos.fechaServicioDesde)} min={datos.fechaServicioDesde || undefined} /></label>
      </>}
      {datos.metodo !== 'DESCONOCIDO' && <>
        {['IA_CONVENCIONAL', 'IATF'].includes(datos.metodo) && semenDisponible.length > 0 && <><label>Semen del banco (opcional)<select value={datos.fichaSemenId ? `${datos.fichaSemenId}|${datos.monedaSemen || ''}` : ''} onChange={(e) => { const [fichaSemenId, monedaSemen] = e.target.value.split('|'); setDatos({ ...datos, fichaSemenId, monedaSemen }); }}><option value="">Semen externo / registro informativo</option>{semenDisponible.filter((s) => !s.especie || s.especie === especie).map((s) => <option key={`${s._id}|${s.moneda || ''}`} value={`${s._id}|${s.moneda || ''}`}>{s.toro || s.nombre} · DIIO {s.codigoToro || '--'} · {s.moneda} · {s.cantidadDisponible} disponibles</option>)}</select></label>{datos.fichaSemenId && <label>Pajuelas utilizadas<input type="number" name="cantidadPajuelas" min="1" step="1" value={datos.cantidadPajuelas || 1} onChange={cambiar} required /></label>}</>}
        {!datos.loteEmbrionId && <label>Semental de la finca<select name="toroId" value={datos.toroId || ''} onChange={cambiar}><option value="">Externo o desconocido</option>{opcionesAnimales(animales.filter((a) => a.sexo === 'Macho' && a.especie === especie))}</select></label>}
        {!datos.toroId && !datos.loteEmbrionId && <><label>Semental externo<input name="sementalExternoNombre" value={datos.sementalExternoNombre || ''} onChange={cambiar} /></label><label>DIIO del semental<input name="diioSemental" value={datos.diioSemental || ''} onChange={cambiar} /></label></>}
        <label>Responsable del servicio<select name="responsable" value={datos.responsable || ''} onChange={cambiar}><option value="">Responsable del seguimiento</option>{usuarios.map((u) => <option key={u._id} value={u._id}>{etiquetaUsuarioConRol(u)}</option>)}</select></label>
      </>}
    </div>
    {datos.metodo === 'TRANSFERENCIA_EMBRIONES' && !datos.loteEmbrionId && <fieldset className="metodo-fieldset"><legend>Embrión y madre genética</legend><div className="form-grid">
      <label>Donante de la finca<select name="donanteId" value={embrion.donanteId || ''} onChange={cambiarEmbrion}><option value="">Donante externa</option>{opcionesAnimales(animales.filter((a) => a.sexo === 'Hembra' && a.especie === 'Bovino'))}</select></label>
      {!embrion.donanteId && <><label>Donante externa<input name="donanteExternaNombre" value={embrion.donanteExternaNombre || ''} onChange={cambiarEmbrion} required /></label><label>DIIO de la donante<input name="donanteDiio" value={embrion.donanteDiio || ''} onChange={cambiarEmbrion} /></label><label>Registro de la donante<input name="donanteRegistro" value={embrion.donanteRegistro || ''} onChange={cambiarEmbrion} /></label><label>Raza de la donante<input name="donanteRaza" value={embrion.donanteRaza || ''} onChange={cambiarEmbrion} /></label></>}
      <label>Origen del embrión<select name="origenEmbrion" value={embrion.origenEmbrion} onChange={cambiarEmbrion}><option value="IN_VIVO">In vivo · Colecta de donante</option><option value="FIV">Fecundación in vitro (FIV)</option></select></label>
      <label>Estado<select name="estadoEmbrion" value={embrion.estadoEmbrion} onChange={cambiarEmbrion}>{['FRESCO', 'CONGELADO', 'VITRIFICADO'].map((v) => <option key={v}>{v}</option>)}</select></label>
      {['codigoEmbrion', 'proveedor', 'grado', 'estadio'].map((k) => <label key={k}>{({ codigoEmbrion: 'Código del embrión', proveedor: 'Proveedor', grado: 'Grado', estadio: 'Estadio' })[k]}<input name={k} value={embrion[k] || ''} onChange={cambiarEmbrion} /></label>)}
      <label>Edad del embrión (días)<input type="number" min="0" max="30" name="edadDias" value={embrion.edadDias} onChange={cambiarEmbrion} /></label>
      <label>Costo del embrión<input type="number" min="0" step="0.01" name="costo" value={embrion.costo ?? ''} onChange={cambiarEmbrion} /></label>
      <label>Moneda<select name="moneda" value={embrion.moneda} onChange={cambiarEmbrion}><option>CRC</option><option>USD</option></select></label>
    </div></fieldset>}
  </>;
}
export const limpiarServicio = (s) => {
  const limpio = limpia(s);
  if (limpio.embrion) limpio.embrion = limpia(limpio.embrion);
  if (limpio.toroId) { delete limpio.sementalExternoNombre; delete limpio.diioSemental; }
  if (limpio.embrion?.donanteId) delete limpio.embrion.donanteExternaNombre;
  if (limpio.metodo === 'TRANSFERENCIA_EMBRIONES' && !limpio.embrion) limpio.embrion = { origenEmbrion: 'IN_VIVO', estadoEmbrion: 'FRESCO', moneda: 'CRC', edadDias: 7 };
  return limpio;
};
export function CamposDiagnostico({ datos, setDatos }) {
  const cambiar = (e) => setDatos({ ...datos, [e.target.name]: e.target.value });
  return <div className="form-grid">
    <label>Fecha del diagnóstico<input type="date" name="fecha" value={datos.fecha} onChange={cambiar} required /></label>
    <label>Resultado<select name="resultado" value={datos.resultado} onChange={cambiar}><option value="PRENADA">Preñada</option><option value="VACIA">Vacía</option><option value="DUDOSA">Dudosa</option><option value="PENDIENTE">Pendiente</option></select></label>
    <label>Método del diagnóstico<select name="metodo" value={datos.metodo} onChange={cambiar}><option value="ECOGRAFIA">Ecografía</option><option value="PALPACION">Palpación</option><option value="LABORATORIO">Laboratorio</option><option value="OTRO">Otro</option></select></label>
    <label>Días de gestación estimados<input type="number" min="0" max="310" name="diasGestacionEstimados" value={datos.diasGestacionEstimados ?? ''} onChange={cambiar} /></label>
    <label>Parto probable<input type="date" name="fechaProbableParto" value={datos.fechaProbableParto || ''} onChange={cambiar} /></label>
  </div>;
}
export function FormularioMetodoReproductivo({ animales, registroInicial, especie, usuariosAsignables, onGuardar, onCancelar, guardando, error, sinServicio = false, semenDisponible = [] }) {
  const [animal, setAnimal] = useState(registroInicial?.animal?._id || '');
  const [asignadoA, setAsignadoA] = useState(registroInicial?.asignadoA?._id || registroInicial?.asignadoA || '');
  const [claveRegistro] = useState(crearClaveIdempotencia);
  const [servicio, setServicio] = useState({ metodo: sinServicio ? 'DESCONOCIDO' : 'MONTA_NATURAL', claveIdempotencia: crearClaveIdempotencia() });
  const [conDiagnostico, setConDiagnostico] = useState(sinServicio);
  const [diagnostico, setDiagnostico] = useState({ fecha: hoy(), resultado: 'PRENADA', metodo: 'ECOGRAFIA', claveIdempotencia: crearClaveIdempotencia() });
  const [conResultado, setConResultado] = useState(false);
  const [resultado, setResultado] = useState({ tipo: 'PARTO', fecha: hoy() });
  const [observaciones, setObservaciones] = useState(registroInicial?.observaciones || '');
  const editar = Boolean(registroInicial);
  return <section className="form-page"><div className="panel-title"><div><p className="eyebrow">Reproducción</p><h2>{editar ? 'Editar seguimiento reproductivo' : 'Nuevo registro reproductivo'}</h2></div><button type="button" className="boton-link" onClick={onCancelar}>Volver</button></div>
    <form className="form-card metodo-formulario" onSubmit={(e) => { e.preventDefault(); onGuardar({ animal, asignadoA, especie, observaciones, ...(!editar ? { metodo: servicio.metodo, claveIdempotencia: claveRegistro, ...(servicio.metodo !== 'DESCONOCIDO' ? { servicio: limpiarServicio(servicio) } : {}) } : {}), ...(conDiagnostico ? { diagnostico: limpia(diagnostico) } : {}), ...(conResultado ? { resultado } : {}) }); }}>
      {error && <div role="alert" className="alerta-formulario">{error}</div>}
      <div className="form-grid"><label>{servicio.metodo === 'TRANSFERENCIA_EMBRIONES' ? 'Receptora' : 'Hembra'}<select value={animal} onChange={(e) => setAnimal(e.target.value)} required disabled={editar}><option value="">Seleccionar hembra</option>{opcionesAnimales(animales.filter((a) => a.sexo === 'Hembra' && a.especie === especie && (a.estado === 'Activo' || a._id === animal)))}</select></label>
        <label>Responsable del seguimiento<select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} required><option value="">Seleccionar responsable</option>{usuariosAsignables.map((u) => <option key={u._id} value={u._id}>{etiquetaUsuarioConRol(u)}</option>)}</select></label></div>
      {!editar && <CamposServicio datos={servicio} setDatos={setServicio} animales={animales.filter((a) => a._id !== animal)} especie={especie} usuarios={usuariosAsignables} semenDisponible={semenDisponible} />}
      <label className="metodo-check"><input type="checkbox" checked={conDiagnostico} onChange={(e) => setConDiagnostico(e.target.checked)} />Registrar diagnóstico</label>
      {conDiagnostico && <CamposDiagnostico datos={diagnostico} setDatos={setDiagnostico} />}
      <label className="metodo-check"><input type="checkbox" checked={conResultado} onChange={(e) => setConResultado(e.target.checked)} />Registrar resultado</label>
{conResultado && <div className="form-grid"><label>Resultado<select value={resultado.tipo} onChange={(e) => setResultado({ ...resultado, tipo: e.target.value })}>{['PARTO', 'PERDIDA_GESTACIONAL', 'REABSORCION', 'ABORTO', 'OTRO'].map((v) => <option key={v} value={v}>{({ PARTO: 'Parto', REABSORCION: 'Reabsorción', PERDIDA_GESTACIONAL: 'Pérdida gestacional', ABORTO: 'Aborto', OTRO: 'Otro' })[v]}</option>)}</select></label><label>Fecha real<input type="date" value={resultado.fecha} onChange={(e) => setResultado({ ...resultado, fecha: e.target.value })} required /></label></div>}
      <label>Observaciones<textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></label>
      <div className="modal-actions"><button type="button" className="boton-link" onClick={onCancelar}>Cancelar</button><button className="boton-primario compacto" disabled={guardando || (!editar && servicio.metodo === 'DESCONOCIDO' && !conDiagnostico && !conResultado)}>Guardar registro</button></div>
    </form></section>;
}
export function HistorialMetodo({ registro, animales, usuarios, soloLectura, onCerrar, onActualizar, semenDisponible = [] }) {
  const [accion, setAccion] = useState('');
  const [servicio, setServicio] = useState({ metodo: 'MONTA_NATURAL', claveIdempotencia: crearClaveIdempotencia() });
  const [diagnostico, setDiagnostico] = useState({ fecha: hoy(), resultado: 'PRENADA', metodo: 'ECOGRAFIA', claveIdempotencia: crearClaveIdempotencia() });
  const [error, setError] = useState(''); const [ocupado, setOcupado] = useState(false);
  const operar = async (tipo, datos) => { setOcupado(true); setError(''); try { await operarMetodoReproductivo(registro._id, tipo, datos); await onActualizar(); onCerrar(); } catch (e) { setError(e.message); } finally { setOcupado(false); } };
  const eventos = [...(registro.servicios || []).map((s) => ({ fecha: s.fechaServicio || s.fechaServicioDesde, titulo: catalogo[s.metodo]?.nombre, texto: s.fechaServicio ? '' : 'Fecha de servicio desconocida o en rango', servicio: s })), ...(registro.historialDiagnosticos || []).map((d) => ({ fecha: d.fecha, titulo: `Diagnóstico: ${d.resultado}`, texto: d.metodo || '' })), ...(registro.resultado?.tipo ? [{ fecha: registro.resultado.fecha, titulo: `Resultado: ${registro.resultado.tipo}` }] : [])].sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));
  return <div className="modal-backdrop"><section className="modal-panel metodo-modal" role="dialog" aria-modal="true" aria-label="Historial reproductivo"><div className="panel-title"><h2>Historial reproductivo</h2><button type="button" className="boton-link" onClick={onCerrar}>Cerrar</button></div><EtiquetaMetodo registro={registro} />
    {error && <div role="alert" className="alerta-formulario">{error}</div>}
    {registro.estadoAtribucion === 'INCIERTA' && <div className="alerta-formulario"><strong>Origen de la gestación incierto</strong>{(registro.servicios || []).filter((s) => registro.serviciosCandidatos?.includes(s._id)).map((s) => <div key={s._id}>{catalogo[s.metodo]?.nombre} · {s.fechaServicio?.slice(0, 10) || 'Fecha desconocida'} {!soloLectura && <button disabled={ocupado} type="button" onClick={() => operar('atribucion', { servicioId: s._id })}>Confirmar este servicio</button>}</div>)}</div>}
    <ol className="metodo-timeline">{eventos.map((ev, i) => <li key={i}><time>{ev.fecha?.slice(0, 10) || 'Sin fecha exacta'}</time><strong>{ev.titulo}</strong><span>{ev.texto}</span>{ev.servicio?.embrion && <span>Receptora: {nombre(registro.animal)} · Donante: {animales.find((a) => a._id === ev.servicio.embrion.donanteId)?.nombre || ev.servicio.embrion.donanteExternaNombre || ev.servicio.embrion.donanteId} · Padre: {animales.find((a) => a._id === ev.servicio.toroId)?.nombre || ev.servicio.sementalExternoNombre || ev.servicio.diioSemental || '--'}</span>}</li>)}</ol>
    {!soloLectura && registro.estadoCiclo === 'Activo' && !registro.fechaPartoReal && <div className="metodo-acciones" role="group" aria-label="Registro del ciclo reproductivo"><button type="button" aria-pressed={accion === 'servicios'} disabled={ocupado} onClick={() => setAccion('servicios')}>Registrar servicio / repaso</button><button type="button" aria-pressed={accion === 'diagnosticos'} disabled={ocupado} onClick={() => setAccion('diagnosticos')}>Registrar diagnóstico</button></div>}
    {accion && <form className="metodo-seguimiento" onSubmit={(e) => { e.preventDefault(); operar(accion, accion === 'servicios' ? limpiarServicio(servicio) : limpia(diagnostico)); }}>
      {accion === 'servicios' ? <CamposServicio datos={servicio} setDatos={setServicio} animales={animales} especie={registro.especie} usuarios={usuarios} semenDisponible={semenDisponible} /> : <CamposDiagnostico datos={diagnostico} setDatos={setDiagnostico} />}
      <div className="modal-actions"><button type="button" className="boton-secundario" disabled={ocupado} onClick={() => setAccion('')}>Cancelar</button><button className="boton-primario compacto" disabled={ocupado}>Guardar</button></div>
    </form>}
  </section></div>;
}
