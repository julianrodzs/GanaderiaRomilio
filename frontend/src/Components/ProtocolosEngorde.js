import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarPlantillaEngorde, avanzarEtapaEngorde, cancelarCicloEngorde, crearCicloEngorde, crearPlantillaEngorde,
  ejecutarPasoEngorde, finalizarCicloEngorde, obtenerCandidatosVentaEngorde,
  obtenerCicloEngorde, obtenerCiclosEngorde, obtenerPlantillasEngorde, obtenerRaciones,
  obtenerUsuariosAsignables
} from '../services/api';

const hoy = () => new Date().toISOString().slice(0, 10);
const fecha = (valor) => valor ? new Date(valor).toLocaleDateString('es-CR') : '--';
const ACCIONES = ['RECEPCION', 'IDENTIFICACION', 'PESAJE', 'UBICACION', 'REVISION_SANITARIA', 'CAMBIO_RACION', 'SANIDAD', 'CONTROL', 'EVALUAR_VENTA', 'OTRA'];
const CRITERIOS = ['MANUAL', 'TIEMPO', 'PESO_PROMEDIO', 'GMD', 'EVENTO'];
const pasoBase = (orden = 1) => ({ claveTemporal: `paso-${Date.now()}-${orden}`, nombre: orden === 1 ? 'Control de etapa' : 'Nueva actividad', tipoAccion: 'CONTROL', orden, referenciaTemporal: 'DESDE_INICIO', pasoReferenciaId: '', offsetHoras: 0, generaTarea: true, obligatorio: true, rolResponsable: 'Encargado' });
const etapaBase = (orden = 1) => ({ codigo: orden === 1 ? 'ADAPTACION' : 'ENGORDE', nombre: orden === 1 ? 'Adaptación' : `Etapa ${orden}`, orden, diasObjetivo: '', pesoObjetivoKg: '', gmdObjetivoKgDia: '', criteriosSalida: [{ tipo: 'MANUAL', operador: '>=', valor: '', evento: '' }], pasos: [pasoBase()] });

const ProtocolosEngorde = ({ lote, onPrepararVenta, soloLectura = false }) => {
  const [plantillas, setPlantillas] = useState([]);
  const [ciclo, setCiclo] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [raciones, setRaciones] = useState([]);
  const [vista, setVista] = useState('operacion');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [pasoActivo, setPasoActivo] = useState(null);
  const [ejecucion, setEjecucion] = useState({ fechaReal: hoy(), observaciones: '', pesajes: [], racion: '', producto: '', tipo: '', dosis: '', viaAplicacion: '' });
  const [inicio, setInicio] = useState({ protocolo: '', responsable: '', fechaInicio: hoy() });
  const [plantilla, setPlantilla] = useState({ nombre: '', alcance: 'FINCA', descripcion: '', etapas: [etapaBase()] });
  const [editandoPlantilla, setEditandoPlantilla] = useState('');

  const cargar = async () => {
    try {
      setError('');
      const [p, ciclos, u, r] = await Promise.all([obtenerPlantillasEngorde(), obtenerCiclosEngorde({ lote: lote._id }), soloLectura ? [] : obtenerUsuariosAsignables('ProtocolosEngorde'), obtenerRaciones({ especie: 'Bovino', activo: true })]);
      setPlantillas(p); setUsuarios(u || []); setRaciones(r || []);
      const activo = ciclos.find((item) => ['ACTIVO', 'PROGRAMADO'].includes(item.estado));
      setCiclo(activo ? await obtenerCicloEngorde(activo._id) : null);
      setInicio((actual) => ({ ...actual, protocolo: actual.protocolo || p[0]?._id || '', responsable: actual.responsable || u?.[0]?._id || '' }));
    } catch (err) { setError(err.message); }
  };

  useEffect(() => { cargar(); }, [lote._id]);

  const crearPlantilla = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true); setError('');
      const datos = { ...plantilla, etapas: plantilla.etapas.map((item, indice) => ({ ...item, orden: indice + 1, diasObjetivo: item.diasObjetivo || undefined, pesoObjetivoKg: item.pesoObjetivoKg || undefined, gmdObjetivoKgDia: item.gmdObjetivoKgDia || undefined, criteriosSalida: item.criteriosSalida.map((criterio) => ({ ...criterio, valor: criterio.valor === '' ? undefined : Number(criterio.valor) })), pasos: item.pasos.map((paso, posicion) => ({ ...paso, orden: posicion + 1, offsetHoras: Number(paso.offsetHoras || 0) })) })) };
      if (editandoPlantilla) await actualizarPlantillaEngorde(editandoPlantilla, datos); else await crearPlantillaEngorde(datos);
      setPlantilla({ nombre: '', alcance: 'FINCA', descripcion: '', etapas: [etapaBase()] }); setEditandoPlantilla(''); await cargar();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };

  const iniciar = async (evento) => {
    evento.preventDefault();
    try { setGuardando(true); setCiclo(await crearCicloEngorde({ ...inicio, lote: lote._id })); } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };

  const abrirPaso = (item) => {
    setPasoActivo(item);
    setEjecucion({ fechaReal: hoy(), observaciones: '', racion: raciones[0]?._id || '', producto: '', tipo: '', dosis: '', viaAplicacion: '', pesajes: item.tipoAccion === 'PESAJE' ? (ciclo.detalleLote.animales || []).map((animal) => ({ animal: animal._id, etiqueta: animal.diio || animal.identificadorFinca || animal.nombre, peso: '' })) : [] });
  };

  const ejecutar = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true); setError('');
      const datos = { ...ejecucion, pesajes: ejecucion.pesajes.filter((item) => item.peso !== '') };
      if (pasoActivo.tipoAccion === 'SANIDAD') datos.aplicacion = { producto: ejecucion.producto, tipo: ejecucion.tipo, dosis: ejecucion.dosis, viaAplicacion: ejecucion.viaAplicacion, responsableUsuario: ciclo.responsable?._id, responsable: `${ciclo.responsable?.nombre || ''} ${ciclo.responsable?.apellido || ''}`.trim(), motivo: ejecucion.observaciones };
      setCiclo(await ejecutarPasoEngorde(ciclo._id, pasoActivo._id, datos)); setPasoActivo(null);
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };

  const prepararVenta = async () => {
    try {
      const candidatos = await obtenerCandidatosVentaEngorde(ciclo._id);
      if (!candidatos.length) return setError('Ningún animal con pesaje alcanza todavía el peso objetivo configurado.');
      onPrepararVenta?.(candidatos.map((item) => item.animal));
    } catch (err) { setError(err.message); }
  };

  const etapaActual = useMemo(() => ciclo?.protocoloSnapshot?.etapas?.find((item) => String(item._id) === String(ciclo.etapaActualId)), [ciclo]);

  if (vista === 'plantillas') return <section className="protocolo-panel">
    <div className="panel-title"><div><p className="eyebrow">Configuración PRO</p><h3>{editandoPlantilla ? 'Nueva versión de plantilla' : 'Nueva plantilla de engorde'}</h3></div><button className="boton-link" type="button" onClick={() => setVista('operacion')}>Volver</button></div>
    <div className="lista-compacta">{plantillas.map((item) => <span key={item._id}><strong>{item.nombre}</strong> · v{item.version} · {item.alcance}<button type="button" className="boton-link" onClick={() => { setEditandoPlantilla(item._id); setPlantilla({ nombre: item.nombre, alcance: item.alcance, descripcion: item.descripcion || '', etapas: item.etapas.map((etapa) => ({ ...etapa, diasObjetivo: etapa.diasObjetivo ?? '', pesoObjetivoKg: etapa.pesoObjetivoKg ?? '', gmdObjetivoKgDia: etapa.gmdObjetivoKgDia ?? '' })) }); }}>Versionar</button></span>)}</div>
    <form onSubmit={crearPlantilla} className="formulario-grid">
      <label>Nombre<input required value={plantilla.nombre} onChange={(e) => setPlantilla({ ...plantilla, nombre: e.target.value })} /></label>
      <label>Alcance<select value={plantilla.alcance} onChange={(e) => setPlantilla({ ...plantilla, alcance: e.target.value })}><option value="FINCA">Esta finca</option><option value="ORGANIZACION">Todas las fincas (Premium)</option></select></label>
      <label className="campo-ancho">Descripción<textarea value={plantilla.descripcion} onChange={(e) => setPlantilla({ ...plantilla, descripcion: e.target.value })} /></label>
      <div className="campo-ancho protocolo-etapas-editor">{plantilla.etapas.map((etapa, indice) => <article key={indice} className="protocolo-editor-item">
        <div className="protocolo-editor-cabecera"><strong>Etapa {indice + 1}</strong>{plantilla.etapas.length > 1 && <button type="button" className="boton-peligro compacto" onClick={() => setPlantilla({ ...plantilla, etapas: plantilla.etapas.filter((_, i) => i !== indice) })}>Eliminar</button>}</div>
        <div className="formulario-grid">
          <label>Código<select value={etapa.codigo} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, codigo: e.target.value } : item) })}>{['INGRESO', 'ADAPTACION', 'DESARROLLO', 'ENGORDE', 'FINALIZACION', 'LISTO_VENTA'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Nombre<input value={etapa.nombre} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, nombre: e.target.value } : item) })} required /></label>
          <label>Días objetivo<input type="number" min="0" value={etapa.diasObjetivo} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, diasObjetivo: e.target.value } : item) })} /></label>
          <label>Peso objetivo kg<input type="number" min="0" step="0.01" value={etapa.pesoObjetivoKg} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, pesoObjetivoKg: e.target.value } : item) })} /></label>
          <label>GMD objetivo kg/día<input type="number" min="0" step="0.001" value={etapa.gmdObjetivoKgDia} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, gmdObjetivoKgDia: e.target.value } : item) })} /></label>
        </div>
        <h4>Criterios para sugerir avance</h4>
        <div className="lista-compacta">{etapa.criteriosSalida.map((criterio, criterioIndice) => <span key={criterio._id || criterioIndice}>
          <select aria-label="Tipo de criterio" value={criterio.tipo} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, criteriosSalida: item.criteriosSalida.map((actual, j) => j === criterioIndice ? { ...actual, tipo: e.target.value, valor: '', evento: '' } : actual) } : item) })}>{CRITERIOS.map((item) => <option key={item}>{item.replaceAll('_', ' ')}</option>)}</select>
          {!['MANUAL', 'EVENTO'].includes(criterio.tipo) && <><select aria-label="Operador" value={criterio.operador || '>='} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, criteriosSalida: item.criteriosSalida.map((actual, j) => j === criterioIndice ? { ...actual, operador: e.target.value } : actual) } : item) })}><option>&gt;=</option><option>&lt;=</option><option>=</option></select><input aria-label="Valor del criterio" type="number" step="0.001" value={criterio.valor ?? ''} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, criteriosSalida: item.criteriosSalida.map((actual, j) => j === criterioIndice ? { ...actual, valor: e.target.value } : actual) } : item) })} required /></>}
          {criterio.tipo === 'EVENTO' && <select aria-label="Evento requerido" value={criterio.evento || ''} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, criteriosSalida: item.criteriosSalida.map((actual, j) => j === criterioIndice ? { ...actual, evento: e.target.value, operador: 'REALIZADO' } : actual) } : item) })} required><option value="">Seleccionar actividad</option>{ACCIONES.map((accion) => <option key={accion}>{accion}</option>)}</select>}
          {etapa.criteriosSalida.length > 1 && <button type="button" className="boton-peligro compacto" onClick={() => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, criteriosSalida: item.criteriosSalida.filter((_, j) => j !== criterioIndice) } : item) })}>Eliminar</button>}
        </span>)}</div>
        <button type="button" className="boton-link" onClick={() => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, criteriosSalida: [...item.criteriosSalida, { tipo: 'MANUAL', operador: '>=', valor: '', evento: '' }] } : item) })}>Agregar criterio</button>
        <h4>Actividades</h4>
        <div className="lista-compacta">{etapa.pasos.map((paso, pasoIndice) => <span key={paso._id || paso.claveTemporal || pasoIndice}>
          <input aria-label="Nombre del paso" value={paso.nombre} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, pasos: item.pasos.map((actual, j) => j === pasoIndice ? { ...actual, nombre: e.target.value } : actual) } : item) })} />
          <select aria-label="Acción" value={paso.tipoAccion} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, pasos: item.pasos.map((actual, j) => j === pasoIndice ? { ...actual, tipoAccion: e.target.value } : actual) } : item) })}>{ACCIONES.map((accion) => <option key={accion}>{accion}</option>)}</select>
          <select aria-label="Referencia temporal" value={paso.referenciaTemporal || 'DESDE_INICIO'} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, pasos: item.pasos.map((actual, j) => j === pasoIndice ? { ...actual, referenciaTemporal: e.target.value, pasoReferenciaId: '' } : actual) } : item) })}><option value="DESDE_INICIO">Desde inicio</option><option value="DESDE_PASO">Desde otra actividad</option></select>
          {paso.referenciaTemporal === 'DESDE_PASO' && <select aria-label="Actividad de referencia" required value={paso.pasoReferenciaId || ''} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, pasos: item.pasos.map((actual, j) => j === pasoIndice ? { ...actual, pasoReferenciaId: e.target.value } : actual) } : item) })}><option value="">Seleccionar</option>{etapa.pasos.filter((_, i) => i !== pasoIndice).map((actual, i) => <option key={actual._id || actual.claveTemporal || i} value={actual._id || actual.claveTemporal}>{actual.nombre}</option>)}</select>}
          <input aria-label="Horas de diferencia" type="number" value={paso.offsetHoras} onChange={(e) => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, pasos: item.pasos.map((actual, j) => j === pasoIndice ? { ...actual, offsetHoras: e.target.value } : actual) } : item) })} />
          {etapa.pasos.length > 1 && <button type="button" className="boton-peligro compacto" onClick={() => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, pasos: item.pasos.filter((_, j) => j !== pasoIndice) } : item) })}>Eliminar</button>}
        </span>)}</div>
        <button type="button" className="boton-link" onClick={() => setPlantilla({ ...plantilla, etapas: plantilla.etapas.map((item, i) => i === indice ? { ...item, pasos: [...item.pasos, pasoBase(item.pasos.length + 1)] } : item) })}>Agregar actividad</button>
      </article>)}</div>
      <button type="button" className="boton-secundario" onClick={() => setPlantilla({ ...plantilla, etapas: [...plantilla.etapas, etapaBase(plantilla.etapas.length + 1)] })}>Agregar etapa</button>
      <div className="acciones-formulario">{editandoPlantilla && <button type="button" className="boton-secundario" onClick={() => { setEditandoPlantilla(''); setPlantilla({ nombre: '', alcance: 'FINCA', descripcion: '', etapas: [etapaBase()] }); }}>Cancelar edición</button>}<button className="boton-primario" disabled={guardando}>{editandoPlantilla ? 'Crear nueva versión' : 'Guardar plantilla'}</button></div>
    </form>{error && <p className="mensaje-error">{error}</p>}
  </section>;

  return <section className="protocolo-panel">
    <div className="panel-title"><div><p className="eyebrow">Protocolo PRO</p><h3>Engorde por etapas</h3></div>{!soloLectura && <button type="button" className="boton-secundario compacto" onClick={() => setVista('plantillas')}>Plantillas</button>}</div>
    {!ciclo ? <form className="formulario-grid protocolo-inicio" onSubmit={iniciar}><label>Protocolo<select required value={inicio.protocolo} onChange={(e) => setInicio({ ...inicio, protocolo: e.target.value })}><option value="">Seleccionar</option>{plantillas.map((item) => <option key={item._id} value={item._id}>{item.nombre} · v{item.version}</option>)}</select></label><label>Responsable<select required value={inicio.responsable} onChange={(e) => setInicio({ ...inicio, responsable: e.target.value })}><option value="">Seleccionar</option>{usuarios.map((item) => <option key={item._id} value={item._id}>{item.nombre} {item.apellido || ''} · {item.rol}</option>)}</select></label><label>Inicio<input type="date" value={inicio.fechaInicio} onChange={(e) => setInicio({ ...inicio, fechaInicio: e.target.value })} /></label><div className="acciones-formulario"><button className="boton-primario" disabled={guardando || !plantillas.length}>Iniciar protocolo</button></div></form> : <>
      <div className="detalle-animal-grid protocolo-resumen"><article><span>Plantilla</span><strong>{ciclo.protocoloSnapshot.nombre} · v{ciclo.protocoloVersion}</strong></article><article><span>Etapa actual</span><strong>{etapaActual?.nombre || '--'}</strong></article><article><span>Cumplimiento</span><strong>{ciclo.cumplimiento.porcentaje}%</strong><small>{ciclo.cumplimiento.realizadas}/{ciclo.cumplimiento.totalObligatorias} actividades</small></article><article><span>Evaluación</span><strong>{ciclo.evaluacionEtapa.sugerirAvance ? 'Criterios cumplidos' : 'En seguimiento'}</strong></article></div>
      <div className="tabla-scroll"><table><thead><tr><th>Actividad</th><th>Tipo</th><th>Programada</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{ciclo.ejecuciones.map((item) => <tr key={item._id}><td>{item.nombre}</td><td>{item.tipoAccion.replaceAll('_', ' ')}</td><td>{fecha(item.fechaProgramada)}</td><td><span className={`estado-badge estado-${item.estado}`}>{item.estado}</span></td><td>{item.estado === 'PENDIENTE' && !soloLectura ? <button className="boton-icono" title="Registrar ejecución" type="button" onClick={() => abrirPaso(item)}>✓</button> : '--'}</td></tr>)}</tbody></table></div>
      {!soloLectura && <div className="acciones-formulario"><button type="button" className="boton-secundario" onClick={async () => { try { setCiclo(await avanzarEtapaEngorde(ciclo._id)); } catch (err) { setError(err.message); } }}>Avanzar etapa</button><button type="button" className="boton-secundario" onClick={prepararVenta}>Preparar venta</button><button type="button" className="boton-primario" onClick={async () => setCiclo(await finalizarCicloEngorde(ciclo._id))}>Finalizar</button><button type="button" className="boton-peligro" onClick={async () => setCiclo(await cancelarCicloEngorde(ciclo._id, 'Cancelado por el usuario'))}>Cancelar</button></div>}
    </>}
    {error && <p className="mensaje-error">{error}</p>}
    {pasoActivo && <div className="modal-backdrop"><form className="modal-panel" onSubmit={ejecutar}><div className="panel-title"><div><p className="eyebrow">Ejecución real</p><h3>{pasoActivo.nombre}</h3></div><button className="boton-link" type="button" onClick={() => setPasoActivo(null)}>Cerrar</button></div><label>Fecha real<input type="date" value={ejecucion.fechaReal} onChange={(e) => setEjecucion({ ...ejecucion, fechaReal: e.target.value })} required /></label>{pasoActivo.tipoAccion === 'PESAJE' && <div className="pesajes-lote-grid">{ejecucion.pesajes.map((item, indice) => <label key={item.animal}>{item.etiqueta}<input type="number" min="0.01" step="0.01" value={item.peso} onChange={(e) => setEjecucion({ ...ejecucion, pesajes: ejecucion.pesajes.map((actual, i) => i === indice ? { ...actual, peso: e.target.value } : actual) })} /></label>)}</div>}{pasoActivo.tipoAccion === 'CAMBIO_RACION' && <label>Ración<select required value={ejecucion.racion} onChange={(e) => setEjecucion({ ...ejecucion, racion: e.target.value })}><option value="">Seleccionar</option>{raciones.map((item) => <option key={item._id} value={item._id}>{item.nombre} · {item.etapa}</option>)}</select></label>}{pasoActivo.tipoAccion === 'SANIDAD' && <div className="formulario-grid"><label>Producto<input required value={ejecucion.producto} onChange={(e) => setEjecucion({ ...ejecucion, producto: e.target.value })} /></label><label>Tipo<input value={ejecucion.tipo} onChange={(e) => setEjecucion({ ...ejecucion, tipo: e.target.value })} /></label><label>Dosis<input value={ejecucion.dosis} onChange={(e) => setEjecucion({ ...ejecucion, dosis: e.target.value })} /></label><label>Vía de aplicación<input value={ejecucion.viaAplicacion} onChange={(e) => setEjecucion({ ...ejecucion, viaAplicacion: e.target.value })} /></label></div>}<label>Observaciones<textarea value={ejecucion.observaciones} onChange={(e) => setEjecucion({ ...ejecucion, observaciones: e.target.value })} /></label><div className="acciones-formulario"><button className="boton-primario" disabled={guardando}>Registrar ejecución</button></div></form></div>}
  </section>;
};

export default ProtocolosEngorde;
