import React, { useEffect, useMemo, useState } from 'react';
import {
  agregarAnimalesLote,
  asignarPlanLote,
  actualizarLote,
  cambiarEtapaLote,
  cambiarPotreroLote,
  cerrarLote,
  crearLote,
  moverAnimalesLote,
  obtenerHistorialAlimentacionLote,
  obtenerHistorialLote,
  obtenerLote,
  obtenerLotes,
  obtenerPlanesAlimentacion,
  obtenerPotreros,
  obtenerUsuariosAsignables,
  programarTareaLote,
  registrarPesajesLote,
  retirarAnimalesLote
} from '../services/api';
import TablaDinamica from './TablaDinamica';
import { etiquetaObjetivoProductivo, etiquetaPropositoLote, PROPOSITOS_LOTE } from '../constants/objetivosProductivos';
import { usePlan } from '../context/PlanContext';

const PROPOSITOS = PROPOSITOS_LOTE;
const ETAPAS = ['INGRESO', 'ADAPTACION', 'DESARROLLO', 'ENGORDE', 'FINALIZACION', 'LISTO_VENTA', 'MANTENIMIENTO', 'OTRA'];
const OBJETIVO_POR_PROPOSITO = { ENGORDE: 'ENGORDE', REPRODUCCION: 'REPRODUCCION', REEMPLAZO: 'REEMPLAZO' };
const hoy = () => new Date().toISOString().slice(0, 10);
const etiquetaAnimal = (animal) => [animal.diio || animal.identificadorFinca, animal.nombre].filter(Boolean).join(' - ');

const Lotes = ({ especie, animales = [], soloLectura = false, onNavegar }) => {
  const { tieneFeature } = usePlan();
  const incluyeAnalitica = tieneFeature('analiticaProductiva');
  const [lotes, setLotes] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [historialPlanes, setHistorialPlanes] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [potreros, setPotreros] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [seleccionadosActuales, setSeleccionadosActuales] = useState([]);
  const [loteDestino, setLoteDestino] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [accion, setAccion] = useState(null);
  const [datosAccion, setDatosAccion] = useState({});
  const [formulario, setFormulario] = useState({ codigo: '', nombre: '', especie, proposito: 'ENGORDE', etapaOperativa: '', fechaInicio: hoy(), pesoObjetivoKg: '', gmdObjetivoKgDia: '', ubicacionActual: '', descripcion: '' });

  const cargar = async () => {
    try { setError(''); setLotes(await obtenerLotes({ especie })); } catch (err) { setError(err.message); }
  };

  useEffect(() => {
    setFormulario((actual) => ({ ...actual, especie }));
    setDetalle(null);
    cargar();
    obtenerPotreros().then(setPotreros).catch(() => setPotreros([]));
    if (!soloLectura) obtenerUsuariosAsignables('Tareas').then(setUsuarios).catch(() => setUsuarios([]));
  }, [especie]);

  const abrirDetalle = async (lote) => {
    try {
      const [datos, movimientos, alimentacion, planesDisponibles] = await Promise.all([
        obtenerLote(lote._id),
        obtenerHistorialLote(lote._id),
        obtenerHistorialAlimentacionLote(lote._id),
        obtenerPlanesAlimentacion({ especie: lote.especie, proposito: lote.proposito, activo: true })
      ]);
      setDetalle(datos);
      setHistorial(movimientos);
      setHistorialPlanes(alimentacion);
      setPlanes(planesDisponibles);
      setSeleccionados([]);
      setSeleccionadosActuales([]);
      setLoteDestino('');
    } catch (err) { setError(err.message); }
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true); setError('');
      const datos = {
        ...formulario,
        pesoObjetivoKg: formulario.pesoObjetivoKg === '' ? undefined : Number(formulario.pesoObjetivoKg),
        ...(incluyeAnalitica ? { gmdObjetivoKgDia: formulario.gmdObjetivoKgDia === '' ? undefined : Number(formulario.gmdObjetivoKgDia) } : {})
      };
      if (formulario._id) await actualizarLote(formulario._id, datos);
      else await crearLote(datos);
      setMostrarFormulario(false);
      setFormulario({ codigo: '', nombre: '', especie, proposito: 'ENGORDE', etapaOperativa: '', fechaInicio: hoy(), pesoObjetivoKg: '', gmdObjetivoKgDia: '', ubicacionActual: '', descripcion: '' });
      await cargar();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };

  const candidatos = useMemo(() => animales.filter((animal) => animal.estado === 'Activo'
    && (!OBJETIVO_POR_PROPOSITO[detalle?.proposito] || animal.objetivoProductivo === OBJETIVO_POR_PROPOSITO[detalle.proposito])
    && !detalle?.animales?.some((actual) => actual._id === animal._id)), [animales, detalle]);

  const agregar = async () => {
    if (!seleccionados.length) return;
    try {
      await agregarAnimalesLote(detalle._id, { animales: seleccionados, fechaEntrada: new Date(), motivoEntrada: 'Asignación manual' });
      await abrirDetalle(detalle);
      await cargar();
    } catch (err) { setError(err.message); }
  };

  const asignarPlan = async (plan) => {
    if (!plan) return;
    try { await asignarPlanLote(detalle._id, { plan }); await abrirDetalle(detalle); await cargar(); } catch (err) { setError(err.message); }
  };

  const mover = async () => {
    if (!seleccionadosActuales.length || !loteDestino) return;
    try {
      await moverAnimalesLote(loteDestino, { animales: seleccionadosActuales, loteDestino, motivoEntrada: `Movimiento desde ${detalle.codigo}` });
      await abrirDetalle(detalle); await cargar();
    } catch (err) { setError(err.message); }
  };

  const retirar = async () => {
    if (!seleccionadosActuales.length || !window.confirm('Los animales seleccionados quedarán sin lote. ¿Continuar?')) return;
    try {
      await retirarAnimalesLote(detalle._id, { animales: seleccionadosActuales, motivoSalida: 'Salida manual del lote' });
      await abrirDetalle(detalle); await cargar();
    } catch (err) { setError(err.message); }
  };

  const cerrar = async () => {
    const tieneAnimales = detalle.animales?.length > 0;
    if (tieneAnimales && !window.confirm('Los animales quedarán sin lote. ¿Deseas cerrar el lote?')) return;
    try {
      await cerrarLote(detalle._id, { accionAnimales: tieneAnimales ? 'SIN_LOTE' : undefined, motivo: 'Cierre manual del lote' });
      setDetalle(null);
      await cargar();
    } catch (err) { setError(err.message); }
  };

  const cambiarEtapa = async (etapaOperativa) => {
    try { await cambiarEtapaLote(detalle._id, { etapaOperativa }); await abrirDetalle(detalle); await cargar(); } catch (err) { setError(err.message); }
  };

  const abrirAccion = (tipo) => {
    const iniciales = {
      pesajes: { fecha: hoy(), observaciones: '', pesajes: (detalle.animales || []).map((animal) => ({ animal: animal._id, peso: '' })) },
      tarea: { titulo: '', tipo: 'Pesaje', prioridad: 'Media', fechaProgramada: hoy(), asignadoA: usuarios[0]?._id || '', descripcion: '' },
      potrero: { potrero: '', fechaEntrada: hoy(), observaciones: '' }
    };
    setDatosAccion(iniciales[tipo] || {}); setAccion(tipo);
  };

  const ejecutarAccion = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true); setError('');
      if (accion === 'pesajes') await registrarPesajesLote(detalle._id, datosAccion);
      if (accion === 'tarea') await programarTareaLote(detalle._id, datosAccion);
      if (accion === 'potrero') await cambiarPotreroLote(detalle._id, datosAccion);
      setAccion(null); await abrirDetalle(detalle); await cargar();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };

  const navegarConLote = (modulo) => {
    sessionStorage.setItem('ganaderiaAccionLote', JSON.stringify({ modulo, loteId: detalle._id, codigoLote: detalle.codigo, especie: detalle.especie, animales: detalle.animales.map((animal) => animal._id) }));
    onNavegar?.(modulo);
  };

  const columnas = [
    { id: 'codigo', label: 'Código', accessor: (lote) => lote.codigo, render: (lote) => <button className="tabla-link" type="button" onClick={() => abrirDetalle(lote)}>{lote.codigo}</button> },
    { id: 'nombre', label: 'Nombre', accessor: (lote) => lote.nombre },
    { id: 'proposito', label: 'Propósito', accessor: (lote) => etiquetaPropositoLote(lote.proposito) },
    { id: 'etapa', label: 'Etapa', accessor: (lote) => lote.etapaOperativa || 'Sin etapa' },
    { id: 'cantidadAnimales', label: 'Animales', accessor: (lote) => lote.cantidadAnimales || 0 },
    { id: 'pesoPromedio', label: 'Peso promedio', accessor: (lote) => lote.resumen?.pesoPromedioActual ?? 'Sin datos', render: (lote) => lote.resumen?.pesoPromedioActual != null ? `${lote.resumen.pesoPromedioActual} kg` : '—' },
    { id: 'potrero', label: 'Potrero', accessor: (lote) => lote.ubicacionActual?.nombre || 'Sin potrero' },
    { id: 'plan', label: 'Plan actual', accessor: (lote) => lote.planAlimentacionActual?.nombre || 'Sin plan' },
    { id: 'estado', label: 'Estado', accessor: (lote) => lote.estado }
  ];

  if (mostrarFormulario) return (
    <section className="vista-tabla lote-formulario">
      <div className="panel-title"><div><p className="eyebrow">Inventario</p><h2>{formulario._id ? 'Editar lote' : 'Nuevo lote'}</h2></div><button className="boton-link" type="button" onClick={() => setMostrarFormulario(false)}>Volver</button></div>
      <form className="formulario-grid" onSubmit={guardar}>
        <label>Código<input value={formulario.codigo} onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value.toUpperCase() })} required /></label>
        <label>Nombre<input value={formulario.nombre} onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} required /></label>
        <label>Especie<input value={especie} disabled /></label>
        <label>Propósito<select value={formulario.proposito} onChange={(e) => setFormulario({ ...formulario, proposito: e.target.value })}>{PROPOSITOS.map((item) => <option key={item} value={item}>{etiquetaPropositoLote(item)}</option>)}</select></label>
        <label>Etapa operativa<select value={formulario.etapaOperativa || ''} onChange={(e) => setFormulario({ ...formulario, etapaOperativa: e.target.value })}><option value="">Sin etapa</option>{ETAPAS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Fecha de inicio<input type="date" value={formulario.fechaInicio} onChange={(e) => setFormulario({ ...formulario, fechaInicio: e.target.value })} required /></label>
        <label>Peso objetivo (kg)<input type="number" min="0" value={formulario.pesoObjetivoKg} onChange={(e) => setFormulario({ ...formulario, pesoObjetivoKg: e.target.value })} /></label>
         {incluyeAnalitica && <label>GMD objetivo (kg/día)<input type="number" min="0" step="0.01" value={formulario.gmdObjetivoKgDia} onChange={(e) => setFormulario({ ...formulario, gmdObjetivoKgDia: e.target.value })} /></label>}
        {!formulario._id && <label>Ubicación inicial<select value={formulario.ubicacionActual} onChange={(e) => setFormulario({ ...formulario, ubicacionActual: e.target.value })}><option value="">Sin potrero asociado</option>{potreros.map((potrero) => <option key={potrero._id} value={potrero._id}>{potrero.codigo} · {potrero.nombre}</option>)}</select></label>}
        <label className="campo-ancho">Descripción<textarea value={formulario.descripcion} onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })} /></label>
        <div className="acciones-formulario campo-ancho"><button type="button" className="boton-secundario" onClick={() => setMostrarFormulario(false)}>Cancelar</button><button className="boton-primario" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar lote'}</button></div>
      </form>
      {error && <p className="mensaje-error">{error}</p>}
    </section>
  );

  return (
    <>
      <TablaDinamica titulo={`Lotes de ${especie.toLowerCase()}s`} subtitulo="Inventario" columnas={columnas} datos={lotes} error={error} filtros={[{ id: 'proposito', accessor: (lote) => lote.proposito }, { id: 'etapa', accessor: (lote) => lote.etapaOperativa || 'Sin etapa' }, { id: 'estado', accessor: (lote) => lote.estado }, { id: 'potrero', accessor: (lote) => lote.ubicacionActual?.nombre || 'Sin potrero' }]} textoAgregar="Nuevo lote" onAgregar={soloLectura ? undefined : () => { setFormulario({ codigo: '', nombre: '', especie, proposito: 'ENGORDE', etapaOperativa: '', fechaInicio: hoy(), pesoObjetivoKg: '', gmdObjetivoKgDia: '', ubicacionActual: '', descripcion: '' }); setMostrarFormulario(true); }} onEditar={soloLectura ? undefined : (lote) => { setFormulario({ ...lote, fechaInicio: lote.fechaInicio?.slice(0, 10) || hoy(), pesoObjetivoKg: lote.pesoObjetivoKg ?? '', gmdObjetivoKgDia: lote.gmdObjetivoKgDia ?? '', ubicacionActual: lote.ubicacionActual?._id || lote.ubicacionActual || '' }); setMostrarFormulario(true); }} mostrarAcciones={!soloLectura} />
      {detalle && <div className="modal-backdrop"><section className="modal-panel detalle-lote-panel">
        <div className="panel-title"><div><p className="eyebrow">Lote {detalle.codigo}</p><h2>{detalle.nombre}</h2></div><button className="boton-link" type="button" onClick={() => setDetalle(null)}>Cerrar</button></div>
        <div className="detalle-animal-grid"><article><span>Especie</span><strong>{detalle.especie}</strong></article><article><span>Propósito</span><strong>{detalle.proposito}</strong></article><article><span>Etapa</span><strong>{detalle.etapaOperativa || 'Sin etapa'}</strong></article><article><span>Estado</span><strong>{detalle.estado}</strong></article><article><span>Animales</span><strong>{detalle.animales?.length || 0}</strong></article><article><span>Días activo</span><strong>{detalle.resumen?.diasActivo ?? 0}</strong></article><article><span>Peso promedio</span><strong>{detalle.resumen?.pesoPromedioActual != null ? `${detalle.resumen.pesoPromedioActual} kg` : 'Sin datos'}</strong><small>{detalle.resumen?.coberturaPesajes?.conPesaje || 0}/{detalle.resumen?.coberturaPesajes?.total || 0} pesados</small></article>{incluyeAnalitica && <article><span>GMD actual / meta</span><strong>{detalle.resumen?.gmdPromedioLote != null ? `${detalle.resumen.gmdPromedioLote} / ${detalle.gmdObjetivoKgDia || '—'} kg/día` : 'Sin datos suficientes'}</strong></article>}<article><span>Potrero</span><strong>{detalle.ubicacionActual?.nombre || 'Sin potrero'}</strong></article><article><span>Próxima tarea</span><strong>{detalle.resumen?.tareas?.proxima?.titulo || 'Sin tareas'}</strong></article></div>
        {!soloLectura && detalle.estado === 'ACTIVO' && <section className="lote-seccion"><h3>Acciones del lote</h3><div className="acciones-lote"><button type="button" onClick={() => navegarConLote('Alimentacion')}>Registrar alimentación</button><button type="button" onClick={() => abrirAccion('pesajes')}>Registrar pesajes</button><button type="button" onClick={() => navegarConLote('Sanidad')}>Aplicación sanitaria</button><button type="button" onClick={() => abrirAccion('potrero')}>Mover potrero</button><button type="button" onClick={() => abrirAccion('tarea')}>Programar tarea</button><button type="button" onClick={() => navegarConLote('Ventas')}>Preparar venta</button></div><label>Etapa operativa<select value={detalle.etapaOperativa || ''} onChange={(e) => cambiarEtapa(e.target.value)}><option value="">Sin etapa</option>{ETAPAS.map((item) => <option key={item}>{item}</option>)}</select></label></section>}
        <section className="lote-seccion"><h3>Sanidad y operación</h3><div className="resumen-lote-compacto"><span>Sanos <strong>{detalle.resumen?.sanidad?.estados?.Sano || 0}</strong></span><span>En observación <strong>{detalle.resumen?.sanidad?.estados?.['En observación'] || 0}</strong></span><span>Enfermos <strong>{detalle.resumen?.sanidad?.estados?.Enfermo || 0}</strong></span><span>Recuperación <strong>{detalle.resumen?.sanidad?.estados?.Recuperación || 0}</strong></span><span>Tratamientos activos <strong>{detalle.resumen?.sanidad?.tratamientosActivos || 0}</strong></span><span>Tareas pendientes <strong>{detalle.resumen?.tareas?.pendientes || 0}</strong></span><span>Vencidas <strong>{detalle.resumen?.tareas?.vencidas || 0}</strong></span><span>Comprados <strong>{detalle.resumen?.origen?.comprados || 0}</strong></span><span>Nacidos en finca <strong>{detalle.resumen?.origen?.nacidosEnFinca || 0}</strong></span>{detalle.especie === 'Porcino' && <span>Camadas de origen <strong>{detalle.resumen?.camadasOrigen || 0}</strong></span>}</div></section>
        <section className="lote-seccion"><h3>Animales actuales</h3>{detalle.animales?.length ? <div className="tabla-scroll tabla-dinamica"><table><thead><tr>{!soloLectura && <th>Seleccionar</th>}<th>DIIO / ID</th><th>Nombre</th><th>Sexo</th><th>Categoría</th><th>Peso actual</th><th>Objetivo</th><th>Estado sanitario</th><th>Entrada al lote</th></tr></thead><tbody>{detalle.animales.map((animal) => <tr key={animal._id}>{!soloLectura && <td><input type="checkbox" aria-label={`Seleccionar ${etiquetaAnimal(animal)}`} checked={seleccionadosActuales.includes(animal._id)} onChange={(e) => setSeleccionadosActuales(e.target.checked ? [...seleccionadosActuales, animal._id] : seleccionadosActuales.filter((id) => id !== animal._id))} /></td>}<td>{animal.diio || animal.identificadorFinca || '—'}</td><td>{animal.nombre || '—'}</td><td>{animal.sexo}</td><td>{animal.categoria || '—'}</td><td>{animal.pesoActual != null ? `${animal.pesoActual} kg` : '—'}</td><td>{etiquetaObjetivoProductivo(animal.objetivoProductivo)}</td><td>{animal.estadoSanitario || 'Sano'}</td><td>{new Date(animal.pertenencia.fechaEntrada).toLocaleDateString('es-CR')}</td></tr>)}</tbody></table></div> : <p>Este lote no tiene animales.</p>}{!soloLectura && seleccionadosActuales.length > 0 && <div className="acciones-lote-movimiento"><select value={loteDestino} onChange={(e) => setLoteDestino(e.target.value)}><option value="">Mover a otro lote...</option>{lotes.filter((lote) => lote._id !== detalle._id && lote.estado === 'ACTIVO' && lote.proposito === detalle.proposito && lote.especie === detalle.especie).map((lote) => <option key={lote._id} value={lote._id}>{lote.codigo} · {lote.nombre}</option>)}</select><button className="boton-secundario" type="button" disabled={!loteDestino} onClick={mover}>Mover</button><button className="boton-peligro" type="button" onClick={retirar}>Dejar sin lote</button></div>}</section>
        {!soloLectura && detalle.estado === 'ACTIVO' && <section className="lote-seccion"><h3>Agregar animales</h3><div className="selector-multiple-lote">{candidatos.map((animal) => <label key={animal._id}><input type="checkbox" checked={seleccionados.includes(animal._id)} onChange={(e) => setSeleccionados(e.target.checked ? [...seleccionados, animal._id] : seleccionados.filter((id) => id !== animal._id))} /> {etiquetaAnimal(animal)} · {etiquetaObjetivoProductivo(animal.objetivoProductivo)}</label>)}</div><button className="boton-secundario" type="button" disabled={!seleccionados.length} onClick={agregar}>Agregar seleccionados</button></section>}
        <section className="lote-seccion"><h3>Alimentación actual</h3><div className="resumen-lote-compacto"><span>Plan <strong>{historialPlanes.find((item) => item.activo)?.plan?.nombre || 'Sin plan'}</strong></span><span>Ración <strong>{detalle.racionActual?.racion?.nombre || 'Sin ración'}</strong></span><span>Último suministro <strong>{detalle.ultimoSuministro ? `${detalle.ultimoSuministro.totalKgSuministrados} kg · ${new Date(detalle.ultimoSuministro.fechaHora).toLocaleDateString('es-CR')}` : 'Sin registros'}</strong></span></div>{!soloLectura && detalle.estado === 'ACTIVO' && <select defaultValue="" onChange={(e) => asignarPlan(e.target.value)}><option value="">Cambiar plan...</option>{planes.map((plan) => <option key={plan._id} value={plan._id}>{plan.nombre} · {plan.etapa}</option>)}</select>}<div className="lista-compacta">{historialPlanes.map((item) => <span key={item._id}>{item.plan?.nombre} · {new Date(item.fechaInicio).toLocaleDateString('es-CR')} · {item.activo ? 'Actual' : 'Finalizado'}</span>)}</div></section>
        <section className="lote-seccion"><h3>Historial de pertenencia</h3><div className="lista-compacta">{historial.map((item) => <span key={item._id}>{etiquetaAnimal(item.animal)} · entrada {new Date(item.fechaEntrada).toLocaleDateString('es-CR')}{item.fechaSalida ? ` · salida ${new Date(item.fechaSalida).toLocaleDateString('es-CR')}` : ' · actual'}</span>)}</div></section>
        <section className="lote-seccion"><h3>Historial operativo</h3><div className="lista-compacta">{(detalle.eventos || []).map((item) => <span key={item._id}>{new Date(item.fecha).toLocaleDateString('es-CR')} · {item.titulo}{item.descripcion ? ` · ${item.descripcion}` : ''}</span>)}</div></section>
        {!soloLectura && detalle.estado === 'ACTIVO' && <div className="acciones-formulario"><button className="boton-peligro" type="button" onClick={cerrar}>Cerrar lote</button></div>}
      </section></div>}
      {accion && <div className="modal-backdrop"><form className="modal-panel lote-accion-form" onSubmit={ejecutarAccion}><div className="panel-title"><h2>{accion === 'pesajes' ? `Pesajes · ${detalle.codigo}` : accion === 'tarea' ? 'Programar tarea' : 'Mover lote a potrero'}</h2><button className="boton-link" type="button" onClick={() => setAccion(null)}>Cerrar</button></div>{accion === 'pesajes' && <><label>Fecha<input type="date" value={datosAccion.fecha} onChange={(e) => setDatosAccion({ ...datosAccion, fecha: e.target.value })} required /></label><div className="pesajes-lote-grid">{datosAccion.pesajes.map((item, indice) => <label key={item.animal}>{etiquetaAnimal(detalle.animales.find((animal) => animal._id === item.animal))}<input type="number" min="0.01" step="0.01" value={item.peso} onChange={(e) => setDatosAccion({ ...datosAccion, pesajes: datosAccion.pesajes.map((actual, posicion) => posicion === indice ? { ...actual, peso: e.target.value } : actual) })} placeholder="kg" /></label>)}</div></>}{accion === 'tarea' && <div className="formulario-grid"><label>Título<input value={datosAccion.titulo} onChange={(e) => setDatosAccion({ ...datosAccion, titulo: e.target.value })} required /></label><label>Tipo<select value={datosAccion.tipo} onChange={(e) => setDatosAccion({ ...datosAccion, tipo: e.target.value })}><option>Pesaje</option><option>Sanidad</option><option>Revisión de potrero</option><option>Alimentación</option><option>Otro</option></select></label><label>Fecha<input type="date" value={datosAccion.fechaProgramada} onChange={(e) => setDatosAccion({ ...datosAccion, fechaProgramada: e.target.value })} required /></label><label>Responsable<select value={datosAccion.asignadoA} onChange={(e) => setDatosAccion({ ...datosAccion, asignadoA: e.target.value })} required><option value="">Seleccionar</option>{usuarios.map((usuario) => <option key={usuario._id} value={usuario._id}>{usuario.nombre} {usuario.apellido || ''} · {usuario.rol}</option>)}</select></label></div>}{accion === 'potrero' && <div className="formulario-grid"><label>Potrero destino<select value={datosAccion.potrero} onChange={(e) => setDatosAccion({ ...datosAccion, potrero: e.target.value })} required><option value="">Seleccionar</option>{potreros.map((potrero) => <option key={potrero._id} value={potrero._id}>{potrero.codigo} · {potrero.nombre}</option>)}</select></label><label>Fecha de entrada<input type="date" value={datosAccion.fechaEntrada} onChange={(e) => setDatosAccion({ ...datosAccion, fechaEntrada: e.target.value })} required /></label></div>}<div className="acciones-formulario"><button type="button" className="boton-secundario" onClick={() => setAccion(null)}>Cancelar</button><button className="boton-primario" disabled={guardando}>{guardando ? 'Guardando...' : 'Confirmar'}</button></div>{error && <p className="mensaje-error">{error}</p>}</form></div>}
    </>
  );
};

export default Lotes;
