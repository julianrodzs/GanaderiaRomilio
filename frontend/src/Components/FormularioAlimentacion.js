import React, { useEffect, useState } from 'react';
import { obtenerCortesAlimentacion, obtenerRacionLote } from '../services/api';

import { etiquetaPropositoLote, PROPOSITOS_LOTE } from '../constants/objetivosProductivos';
const PROPOSITOS = PROPOSITOS_LOTE;
const ETAPAS = ['INICIO', 'DESARROLLO', 'ENGORDE', 'FINALIZACION', 'MANTENIMIENTO', 'REPRODUCCION', 'OTRA'];
const UNIDADES = ['KG', 'TONELADA', 'SACO', 'PACA', 'BALDE', 'CARRETA', 'OTRA'];
const TIPOS = ['FORRAJE', 'CONCENTRADO', 'GRANO', 'SUBPRODUCTO', 'MINERAL', 'SUPLEMENTO', 'OTRO'];
const hoyHora = () => new Date().toISOString().slice(0, 16);
const filaReal = () => ({ alimento: '', cantidadIngresada: '', unidadIngresada: 'KG', tipoMedicion: 'PESADA', presentacionId: '', factorConversionKg: '', sobranteKg: '' });
const Campo = ({ titulo, ancho, children }) => <label className={ancho ? 'campo-ancho' : ''}>{titulo}{children}</label>;

const inicializar = (tipo, especie, registro) => {
  if (registro && tipo === 'suministro') return { ...registro, fechaHora: registro.fechaHora?.slice(0, 16), motivoCorreccion: '', detalles: registro.detalles.map((x) => ({ alimento: x.alimento?._id || x.alimento, cantidadIngresada: x.cantidadIngresada, unidadIngresada: x.unidadIngresada, tipoMedicion: x.tipoMedicion, presentacionId: x.presentacionId || '', factorConversionKg: x.factorConversionKgSnapshot || '', sobranteKg: x.sobranteKg ?? '', origenTipo: x.origenTipo || '', origenReferenciaId: x.origenReferenciaId || '' })) };
  if (tipo === 'asignacion') return { racion: registro?._id || '', racionNombre: registro?.nombre || '', proposito: registro?.proposito || '', lote: '', fechaInicio: new Date().toISOString().slice(0, 10) };
  if (registro) {
    if (tipo === 'racion') return { ...registro, detalles: registro.detalles.map((x) => ({ ...x, alimento: x.alimento?._id || x.alimento })) };
    return { ...registro, presentaciones: registro.presentaciones || [] };
  }
  if (tipo === 'plan') return { nombre: '', especie, proposito: 'ENGORDE', etapa: 'ENGORDE', tipoManejoAlimenticio: 'MIXTO', descripcion: '', activo: true };
  if (tipo === 'racion') return { nombre: '', especie, proposito: 'ENGORDE', etapa: 'ENGORDE', descripcion: '', activo: true, detalles: [] };
  if (tipo === 'alimento') return { nombre: '', tipo: 'FORRAJE', descripcion: '', activo: true, presentaciones: [] };
  return { lote: '', fechaHora: hoyHora(), racion: '', detalles: [filaReal()], observaciones: '' };
};

const FormularioAlimentacion = ({ configuracion, especie, alimentos, lotes, planes, onGuardar, onCerrar }) => {
  const { tipo, registro, loteId } = configuracion;
  const [form, setForm] = useState(() => inicializar(tipo, especie, registro));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [cortes, setCortes] = useState([]);

  const seleccionarLote = async (id) => {
    const lote = lotes.find((item) => item._id === id);
    let asignacion = null;
    if (id) try { asignacion = await obtenerRacionLote(id); } catch (_) { /* lote sin ración */ }
    const detalles = asignacion?.racion?.detalles?.map((x) => ({ ...filaReal(), alimento: x.alimento?._id || x.alimento, cantidadIngresada: x.baseCalculo === 'POR_ANIMAL_DIA' ? Number(x.cantidad || 0) * Number(lote?.cantidadAnimales || 0) : x.cantidad || '', unidadIngresada: x.unidad, tipoMedicion: ['KG', 'TONELADA'].includes(x.unidad) ? 'PESADA' : 'POR_PRESENTACION', presentacionId: x.presentacion || '' })) || [filaReal()];
    setForm((actual) => ({ ...actual, lote: id, planNombre: lote?.planAlimentacionActual?.nombre || '', racion: asignacion?.racion?._id || '', racionNombre: asignacion?.racion?.nombre || '', detalles }));
  };
  useEffect(() => { if (tipo === 'suministro' && loteId && lotes.length) seleccionarLote(loteId); }, [loteId, lotes.length]);
  useEffect(() => { if (tipo === 'suministro') obtenerCortesAlimentacion().then(setCortes).catch(() => setCortes([])); }, [tipo]);

  const enviar = async (e) => {
    e.preventDefault(); setGuardando(true); setError('');
    try {
      let valor = form;
      if (tipo === 'racion') valor = { ...form, detalles: form.detalles.map((x) => ({ ...x, cantidad: x.baseCalculo === 'LIBRE_ACCESO' ? 0 : Number(x.cantidad), presentacion: x.presentacion || undefined })) };
      if (tipo === 'alimento') valor = { ...form, presentaciones: form.presentaciones.map((x) => ({ ...x, cantidadBaseKg: Number(x.cantidadBaseKg) })) };
      if (tipo === 'suministro') valor = { ...form, detalles: form.detalles.map((x) => ({ ...x, cantidadIngresada: Number(x.cantidadIngresada), presentacionId: x.presentacionId || null, factorConversionKg: x.factorConversionKg === '' ? undefined : Number(x.factorConversionKg), sobranteKg: x.sobranteKg === '' ? null : Number(x.sobranteKg) })) };
      await onGuardar(tipo, valor);
    } catch (err) { setError(err.message); setGuardando(false); }
  };
  const cambiarFila = (campo, indice, cambio) => setForm({ ...form, [campo]: form[campo].map((x, i) => i === indice ? { ...x, ...cambio } : x) });
  const titulo = { plan: form._id ? 'Editar plan' : 'Nuevo plan', racion: form._id ? 'Editar ración' : 'Nueva ración', alimento: form._id ? 'Editar alimento' : 'Nuevo alimento', suministro: 'Registrar alimentación', asignacion: 'Asignar ración a lote' }[tipo];

  return <section className="vista-tabla lote-formulario suministro-form"><div className="panel-title"><div><p className="eyebrow">Alimentación</p><h2>{titulo}</h2></div><button className="boton-link" type="button" onClick={onCerrar}>Volver</button></div><form className="formulario-grid" onSubmit={enviar}>
    {['plan', 'racion'].includes(tipo) && <><Campo titulo="Nombre"><input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Campo><Campo titulo="Especie"><select value={form.especie} onChange={(e) => setForm({ ...form, especie: e.target.value })}><option>Bovino</option><option>Porcino</option></select></Campo><Campo titulo="Propósito"><select value={form.proposito} onChange={(e) => setForm({ ...form, proposito: e.target.value })}>{PROPOSITOS.map((x) => <option key={x} value={x}>{etiquetaPropositoLote(x)}</option>)}</select></Campo><Campo titulo="Etapa"><select value={form.etapa} onChange={(e) => setForm({ ...form, etapa: e.target.value })}>{ETAPAS.map((x) => <option key={x}>{x}</option>)}</select></Campo></>}
    {tipo === 'plan' && <Campo titulo="Tipo de manejo"><select value={form.tipoManejoAlimenticio || ''} onChange={(e) => setForm({ ...form, tipoManejoAlimenticio: e.target.value || null })}><option value="">Sin definir</option><option value="PASTOREO">Pastoreo</option><option value="CORTE_ACARREO">Corte y acarreo</option><option value="ESTABULADO">Estabulado</option><option value="MIXTO">Mixto</option></select></Campo>}
    {tipo === 'racion' && <Campo titulo="Plan relacionado (opcional)"><select value={form.planAlimentacion?._id || form.planAlimentacion || ''} onChange={(e) => setForm({ ...form, planAlimentacion: e.target.value || null })}><option value="">Sin plan específico</option>{planes.filter((x) => x.especie === form.especie && x.proposito === form.proposito).map((x) => <option key={x._id} value={x._id}>{x.nombre} · {x.etapa}</option>)}</select></Campo>}
    {tipo === 'alimento' && <><Campo titulo="Nombre"><input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Campo><Campo titulo="Tipo"><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map((x) => <option key={x}>{x}</option>)}</select></Campo></>}
    {tipo === 'asignacion' && <><Campo titulo="Ración"><input value={form.racionNombre} disabled /></Campo><Campo titulo="Lote compatible"><select required value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })}><option value="">Seleccionar</option>{lotes.filter((x) => x.proposito === form.proposito).map((x) => <option key={x._id} value={x._id}>{x.codigo} · {x.nombre}</option>)}</select></Campo><Campo titulo="Desde"><input required type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} /></Campo></>}
    {tipo === 'suministro' && <><Campo titulo="Lote"><select required value={form.lote} onChange={(e) => seleccionarLote(e.target.value)}><option value="">Seleccionar</option>{lotes.map((x) => <option key={x._id} value={x._id}>{x.codigo} · {x.nombre} · {x.cantidadAnimales || 0} animales</option>)}</select></Campo><Campo titulo="Fecha y hora"><input required type="datetime-local" value={form.fechaHora} onChange={(e) => setForm({ ...form, fechaHora: e.target.value })} /></Campo><div className="campo-ancho suministro-contexto"><span>Plan: <strong>{form.planNombre || 'Sin plan'}</strong></span><span>Ración: <strong>{form.racionNombre || 'Registro libre'}</strong></span><span>Las cantidades por animal se precargan para el total actual del lote.</span></div></>}
    {tipo === 'racion' && <EditorRacion form={form} setForm={setForm} alimentos={alimentos} cambiarFila={cambiarFila} />}
    {tipo === 'alimento' && <EditorPresentaciones form={form} setForm={setForm} cambiarFila={cambiarFila} />}
    {tipo === 'suministro' && <EditorSuministro form={form} setForm={setForm} alimentos={alimentos} cortes={cortes} cambiarFila={cambiarFila} />}
    {['plan', 'racion', 'alimento'].includes(tipo) && <Campo titulo="Descripción" ancho><textarea value={form.descripcion || ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Campo>}
    {['plan', 'racion', 'alimento'].includes(tipo) && <label className="check-line"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Disponible para nuevas operaciones</label>}
    {tipo === 'suministro' && <Campo titulo="Observaciones" ancho><textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></Campo>}
    {tipo === 'suministro' && form._id && <Campo titulo="Motivo de la corrección" ancho><textarea required value={form.motivoCorreccion} onChange={(e) => setForm({ ...form, motivoCorreccion: e.target.value })} /></Campo>}
    {error && <p className="mensaje-error campo-ancho">{error}</p>}<div className="acciones-formulario campo-ancho"><button type="button" className="boton-secundario" onClick={onCerrar}>Cancelar</button><button className="boton-primario" disabled={guardando}>{guardando ? 'Guardando...' : tipo === 'suministro' ? 'Registrar suministro' : 'Guardar'}</button></div>
  </form></section>;
};

const EditorRacion = ({ form, setForm, alimentos, cambiarFila }) => <div className="campo-ancho subpanel-form">
  <div className="panel-title"><h3>Componentes planificados</h3><button type="button" className="boton-secundario" onClick={() => setForm({ ...form, detalles: [...form.detalles, { alimento: '', cantidad: '', unidad: 'KG', baseCalculo: 'POR_LOTE_DIA' }] })}>+ Componente</button></div>
  {form.detalles.map((x, i) => {
    const alimento = alimentos.find((item) => item._id === x.alimento);
    const presentaciones = (alimento?.presentaciones || []).filter((item) => item.activo && item.unidad === x.unidad);
    return <div className="fila-componentes" key={x._id || i}>
      <select required value={x.alimento} onChange={(e) => cambiarFila('detalles', i, { alimento: e.target.value, presentacion: '' })}><option value="">Alimento...</option>{alimentos.filter((a) => a.activo).map((a) => <option key={a._id} value={a._id}>{a.nombre}</option>)}</select>
      <input type="number" min="0" step="0.001" disabled={x.baseCalculo === 'LIBRE_ACCESO'} placeholder="Cantidad" value={x.cantidad ?? ''} onChange={(e) => cambiarFila('detalles', i, { cantidad: e.target.value })} />
      <select value={x.unidad} onChange={(e) => cambiarFila('detalles', i, { unidad: e.target.value, presentacion: '' })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select>
      {!['KG', 'TONELADA'].includes(x.unidad) && presentaciones.length > 0 && <select required value={x.presentacion || ''} onChange={(e) => cambiarFila('detalles', i, { presentacion: e.target.value })}><option value="">Presentación...</option>{presentaciones.map((item) => <option key={item._id} value={item._id}>{item.nombre} · {item.cantidadBaseKg} kg</option>)}</select>}
      <select value={x.baseCalculo} onChange={(e) => cambiarFila('detalles', i, { baseCalculo: e.target.value })}><option value="POR_ANIMAL_DIA">Por animal/día</option><option value="POR_LOTE_DIA">Por lote/día</option><option value="LIBRE_ACCESO">Libre acceso</option><option value="OTRO">Otro</option></select>
      <button type="button" className="boton-peligro" onClick={() => setForm({ ...form, detalles: form.detalles.filter((_, n) => n !== i) })}>Quitar</button>
    </div>;
  })}
</div>;

const EditorPresentaciones = ({ form, setForm, cambiarFila }) => <div className="campo-ancho subpanel-form"><div className="panel-title"><h3>Presentaciones y conversión</h3><button type="button" className="boton-secundario" onClick={() => setForm({ ...form, presentaciones: [...form.presentaciones, { nombre: '', unidad: 'SACO', cantidadBaseKg: '', estimada: false, activo: true }] })}>+ Presentación</button></div>{form.presentaciones.map((x, i) => <div className="fila-componentes" key={x._id || i}><input required placeholder="Saco de 40 kg" value={x.nombre} onChange={(e) => cambiarFila('presentaciones', i, { nombre: e.target.value })} /><select value={x.unidad} onChange={(e) => cambiarFila('presentaciones', i, { unidad: e.target.value })}>{UNIDADES.slice(2).map((u) => <option key={u}>{u}</option>)}</select><input required type="number" min="0.001" step="0.001" placeholder="kg por unidad" value={x.cantidadBaseKg} onChange={(e) => cambiarFila('presentaciones', i, { cantidadBaseKg: e.target.value })} /><label className="check-line"><input type="checkbox" checked={x.estimada} onChange={(e) => cambiarFila('presentaciones', i, { estimada: e.target.checked })} /> Estimada</label>{x._id ? <button type="button" className={x.activo ? 'boton-peligro' : 'boton-secundario'} onClick={() => cambiarFila('presentaciones', i, { activo: !x.activo })}>{x.activo ? 'Desactivar' : 'Activar'}</button> : <button type="button" className="boton-peligro" onClick={() => setForm({ ...form, presentaciones: form.presentaciones.filter((_, n) => n !== i) })}>Quitar</button>}</div>)}</div>;

const EditorSuministro = ({ form, setForm, alimentos, cortes, cambiarFila }) => <div className="campo-ancho subpanel-form"><div className="panel-title"><div><h3>Alimentos realmente suministrados</h3><p className="texto-ayuda">El sobrante es opcional; sin todos los sobrantes no se calcula consumo.</p></div><button type="button" className="boton-secundario" onClick={() => setForm({ ...form, detalles: [...form.detalles, filaReal()] })}>+ Otro alimento</button></div>{form.detalles.map((x, i) => { const alimento = alimentos.find((a) => a._id === x.alimento); const presentaciones = (alimento?.presentaciones || []).filter((p) => p.activo && p.unidad === x.unidadIngresada); return <div className="detalle-suministro" key={i}><select required value={x.alimento} onChange={(e) => cambiarFila('detalles', i, { alimento: e.target.value, presentacionId: '' })}><option value="">Alimento...</option>{alimentos.filter((a) => a.activo).map((a) => <option key={a._id} value={a._id}>{a.nombre}</option>)}</select><input required type="number" min="0.001" step="0.001" placeholder="Cantidad" value={x.cantidadIngresada} onChange={(e) => cambiarFila('detalles', i, { cantidadIngresada: e.target.value })} /><select value={x.unidadIngresada} onChange={(e) => cambiarFila('detalles', i, { unidadIngresada: e.target.value, presentacionId: '' })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select><select value={x.tipoMedicion} onChange={(e) => cambiarFila('detalles', i, { tipoMedicion: e.target.value })}><option value="PESADA">Pesada</option><option value="POR_PRESENTACION">Por presentación</option><option value="ESTIMADA">Estimada</option></select>{!['KG', 'TONELADA'].includes(x.unidadIngresada) && (presentaciones.length ? <select required value={x.presentacionId} onChange={(e) => cambiarFila('detalles', i, { presentacionId: e.target.value })}><option value="">Presentación...</option>{presentaciones.map((p) => <option key={p._id} value={p._id}>{p.nombre} · {p.cantidadBaseKg} kg</option>)}</select> : <input required type="number" min="0.001" step="0.001" placeholder="kg por unidad" value={x.factorConversionKg} onChange={(e) => cambiarFila('detalles', i, { factorConversionKg: e.target.value })} />)}<input type="number" min="0" step="0.001" placeholder="Sobrante kg" value={x.sobranteKg} onChange={(e) => cambiarFila('detalles', i, { sobranteKg: e.target.value })} /><select value={x.origenTipo || ''} onChange={(e) => cambiarFila('detalles', i, { origenTipo: e.target.value || null, origenReferenciaId: '' })}><option value="">Sin origen</option><option value="CORTE_FORRAJE">Corte de forraje</option><option value="OTRO">Otro</option></select>{x.origenTipo === 'CORTE_FORRAJE' && <select required value={x.origenReferenciaId || ''} onChange={(e) => cambiarFila('detalles', i, { origenReferenciaId: e.target.value })}><option value="">Seleccionar corte</option>{cortes.map((c) => <option key={c._id} value={c._id}>{new Date(c.fechaCorte).toLocaleDateString('es-CR')} · {c.potrero?.nombre || 'Sin potrero'}</option>)}</select>}<button type="button" className="boton-peligro" disabled={form.detalles.length === 1} onClick={() => setForm({ ...form, detalles: form.detalles.filter((_, n) => n !== i) })}>Quitar</button></div>; })}</div>;

export default FormularioAlimentacion;
