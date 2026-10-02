import React, { useEffect, useMemo, useState } from 'react';
import { obtenerCortesForraje, obtenerRendimientoForrajes, obtenerTareas, obtenerUsuariosAsignables, registrarCorteForraje } from '../services/api';
import FeatureGate from './FeatureGate';
import InfoLunarFecha from './InfoLunarFecha';
import TablaDinamica from './TablaDinamica';
import { etiquetaUsuarioConRol, nombreUsuario } from '../utils/usuarios';

const fechaTexto = (valor) => valor ? new Date(valor).toLocaleDateString('es-CR') : '--';
const columnas = [
  { id: 'codigo', label: 'Código', accessor: (item) => item.codigo },
  { id: 'nombre', label: 'Banco', accessor: (item) => item.nombre },
  { id: 'forraje', label: 'Forraje principal', accessor: (item) => item.pastoPrincipal?.nombre || item.descripcionCobertura || '--' },
  { id: 'area', label: 'Área (ha)', accessor: (item) => item.area ?? '--' },
  { id: 'ultimoCorte', label: 'Último corte', accessor: (item) => fechaTexto(item.ultimoCorte?.fechaCorte) },
  { id: 'produccion', label: 'Última producción', accessor: (item) => item.ultimoCorte ? `${item.ultimoCorte.cantidadForrajeVerdeKg.toLocaleString('es-CR')} kg` : '--' },
  { id: 'proximoCorte', label: 'Próximo corte', accessor: (item) => fechaTexto(item.proximoCorteEstimado) },
  { id: 'estado', label: 'Estado', accessor: (item) => item.estado }
];

const FormularioCorte = ({ banco, onCerrar, onGuardado }) => {
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [datos, setDatos] = useState({
    fechaCorte: new Date().toISOString().slice(0, 10),
    cantidadForrajeVerde: '', unidadCantidad: 'KG', areaCortadaHa: '', porcentajeMateriaSeca: '',
    responsable: banco.responsableCorte?._id || banco.responsableCorte || '', destino: { tipo: 'FINCA_GENERAL', descripcion: '' }, observaciones: ''
  });
  useEffect(() => { obtenerUsuariosAsignables('Tareas').then(setUsuarios).catch((err) => setError(err.message)); }, []);
  const actualizar = (evento) => setDatos((actual) => ({ ...actual, [evento.target.name]: evento.target.value }));
  const guardar = async (evento) => {
    evento.preventDefault();
    try {
      setGuardando(true); setError('');
      await registrarCorteForraje(banco._id, { ...datos, destino: { ...datos.destino } });
      onGuardado();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  };
  return <div className="modal-overlay"><section className="modal-content detalle-potrero-panel"><div className="panel-title"><div><p className="eyebrow">Banco forrajero</p><h2>Registrar corte · {banco.nombre}</h2></div><button className="boton-link" type="button" onClick={onCerrar}>Cerrar</button></div><form className="form-card" onSubmit={guardar}>{error && <div className="alerta-formulario">{error}</div>}<div className="form-grid"><label>Fecha real del corte<input type="date" name="fechaCorte" value={datos.fechaCorte} onChange={actualizar} required /><InfoLunarFecha fecha={datos.fechaCorte} compacta /></label><label>Responsable<select name="responsable" value={datos.responsable} onChange={actualizar} required><option value="">Seleccionar</option>{usuarios.map((u) => <option key={u._id} value={u._id}>{etiquetaUsuarioConRol(u)}</option>)}</select></label></div><div className="form-grid"><label>Forraje verde<input name="cantidadForrajeVerde" type="number" min="0" step="0.01" value={datos.cantidadForrajeVerde} onChange={actualizar} required /></label><label>Unidad<select name="unidadCantidad" value={datos.unidadCantidad} onChange={actualizar}><option value="KG">kg</option><option value="TON">toneladas</option></select></label></div><div className="form-grid"><label>Área cortada (ha)<input name="areaCortadaHa" type="number" min="0" step="0.01" value={datos.areaCortadaHa} onChange={actualizar} /></label><label>Materia seca estimada (%)<input name="porcentajeMateriaSeca" type="number" min="0" max="100" step="0.1" value={datos.porcentajeMateriaSeca} onChange={actualizar} /></label></div><div className="form-grid"><label>Destino<select value={datos.destino.tipo} onChange={(e) => setDatos((actual) => ({ ...actual, destino: { ...actual.destino, tipo: e.target.value } }))}><option value="FINCA_GENERAL">Finca general</option><option value="BOVINOS">Bovinos</option><option value="PORCINOS">Porcinos</option><option value="ENGORDE_BOVINO">Engorde bovino</option><option value="ENGORDE_PORCINO">Engorde porcino</option><option value="LOTE">Lote</option><option value="ANIMAL">Animal</option><option value="OTRO">Otro</option></select></label><label>Detalle del destino<input value={datos.destino.descripcion} onChange={(e) => setDatos((actual) => ({ ...actual, destino: { ...actual.destino, descripcion: e.target.value } }))} /></label></div><label>Observaciones<textarea name="observaciones" rows="3" value={datos.observaciones} onChange={actualizar} /></label><div className="form-actions"><button className="boton-link" type="button" onClick={onCerrar}>Cancelar</button><button className="boton-primario compacto" disabled={guardando}>{guardando ? 'Guardando...' : 'Registrar corte'}</button></div></form></section></div>;
};

const DetalleBanco = ({ banco, onCerrar, onRegistrar }) => {
  const [cortes, setCortes] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([obtenerCortesForraje(banco._id), obtenerTareas({ potrero: banco._id, moduloOrigen: 'Potreros' })])
      .then(([cortesData, tareasData]) => { setCortes(cortesData); setTareas(tareasData); })
      .catch((err) => setError(err.message));
  }, [banco._id]);
  const ultimo = cortes[0];
  const diasDesdeUltimo = ultimo ? Math.max(0, Math.floor((Date.now() - new Date(ultimo.fechaCorte).getTime()) / 86400000)) : null;
  const proxima = tareas.find((item) => item.categoriaAutomatica === 'CORTE_FORRAJE' && ['Pendiente', 'En proceso'].includes(item.estado));
  const diasFaltantes = proxima ? Math.ceil((new Date(proxima.fechaProgramada).getTime() - Date.now()) / 86400000) : null;
  return <div className="modal-overlay"><section className="modal-content detalle-potrero-panel"><div className="panel-title"><div><p className="eyebrow">Banco forrajero</p><h2>{banco.nombre}</h2></div><button className="boton-link" type="button" onClick={onCerrar}>Cerrar</button></div><div className="potrero-informacion"><article><span>Forraje</span><strong>{banco.pastoPrincipal?.nombre || '--'}</strong></article><article><span>Área</span><strong>{banco.area ?? '--'} ha</strong></article><article><span>Establecimiento</span><strong>{fechaTexto(banco.fechaEstablecimientoPasto)}</strong></article><article><span>Intervalo objetivo</span><strong>{banco.intervaloCorteObjetivoDias ? `${banco.intervaloCorteObjetivoDias} días` : '--'}</strong></article></div><h3>Estado actual</h3><div className="potrero-informacion"><article><span>Último corte</span><strong>{fechaTexto(ultimo?.fechaCorte)}</strong></article><article><span>Días desde corte</span><strong>{diasDesdeUltimo ?? '--'}</strong></article><article><span>Próximo corte</span><strong>{fechaTexto(proxima?.fechaProgramada)}</strong></article><article><span>Días faltantes</span><strong>{diasFaltantes == null ? '--' : diasFaltantes >= 0 ? diasFaltantes : `${Math.abs(diasFaltantes)} vencido`}</strong></article></div>{error && <div className="alerta-formulario">{error}</div>}<div className="panel-title"><h3>Historial de cortes</h3><button className="boton-primario compacto" type="button" onClick={onRegistrar}>+ Registrar corte</button></div><div className="tabla-scroll tabla-panel"><table><thead><tr><th>Fecha</th><th>Forraje</th><th>Forraje verde</th><th>Kg/ha</th><th>Materia seca</th><th>Área</th><th>Destino</th><th>Responsable</th></tr></thead><tbody>{cortes.map((corte) => <tr key={corte._id}><td>{fechaTexto(corte.fechaCorte)}</td><td>{corte.forrajeNombre}</td><td>{corte.cantidadForrajeVerdeKg.toLocaleString('es-CR')} kg</td><td>{corte.areaCortadaHa > 0 ? Math.round(corte.cantidadForrajeVerdeKg / corte.areaCortadaHa).toLocaleString('es-CR') : '--'}</td><td>{corte.cantidadMateriaSecaKg == null ? '--' : `${corte.cantidadMateriaSecaKg.toLocaleString('es-CR')} kg`}</td><td>{corte.areaCortadaHa ?? '--'}</td><td>{corte.destino?.tipo?.replaceAll('_', ' ') || '--'}</td><td>{nombreUsuario(corte.responsable)}</td></tr>)}</tbody></table>{!cortes.length && <p className="estado-vacio">Aún no hay cortes registrados.</p>}</div><h3>Tareas asociadas</h3><div className="tabla-scroll tabla-panel"><table><thead><tr><th>Actividad</th><th>Fecha</th><th>Estado</th><th>Responsable</th></tr></thead><tbody>{tareas.map((tarea) => <tr key={tarea._id}><td>{tarea.titulo}</td><td>{fechaTexto(tarea.fechaProgramada)}</td><td>{tarea.estado}</td><td>{nombreUsuario(tarea.asignadoA)}</td></tr>)}</tbody></table>{!tareas.length && <p className="estado-vacio">No hay tareas asociadas.</p>}</div></section></div>;
};

const GraficoBarras = ({ titulo, datos, valor, unidad = 'kg' }) => {
  const visibles = datos.slice(0, 8);
  const maximo = Math.max(...visibles.map(valor), 0);
  return <section className="forraje-grafico"><h3>{titulo}</h3>{visibles.length ? <div className="forraje-barras">{visibles.map((item) => { const numero = valor(item) || 0; return <div className="forraje-barra" key={item.clave}><div><strong>{item.nombre}</strong><span>{numero.toLocaleString('es-CR')} {unidad}</span></div><div className="forraje-barra-pista"><span style={{ width: `${maximo ? (numero / maximo) * 100 : 0}%` }} /></div></div>; })}</div> : <p className="estado-vacio">Sin información suficiente.</p>}</section>;
};

const GraficoLinea = ({ datos }) => {
  const ancho = 640; const alto = 180; const margen = 18;
  const valores = datos.map((item) => item.cantidadForrajeVerdeKg || 0);
  const maximo = Math.max(...valores, 0);
  const puntos = datos.map((item, indice) => {
    const x = datos.length === 1 ? ancho / 2 : margen + indice * ((ancho - margen * 2) / (datos.length - 1));
    const y = alto - margen - (maximo ? (valores[indice] / maximo) * (alto - margen * 2) : 0);
    return { x, y, item };
  });
  return <section className="forraje-grafico forraje-grafico-linea"><h3>Producción mensual</h3>{datos.length ? <><svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Producción mensual de forraje"><polyline points={puntos.map((punto) => `${punto.x},${punto.y}`).join(' ')} fill="none" stroke="#0b4a2a" strokeWidth="4" />{puntos.map((punto) => <circle key={punto.item.clave} cx={punto.x} cy={punto.y} r="5" fill="#d59b2d"><title>{punto.item.nombre}: {punto.item.cantidadForrajeVerdeKg} kg</title></circle>)}</svg><div className="forraje-eje">{datos.map((item) => <span key={item.clave}>{item.nombre}</span>)}</div></> : <p className="estado-vacio">Sin información suficiente.</p>}</section>;
};

const GraficoIntervalos = ({ datos }) => <section className="forraje-grafico"><h3>Días entre cortes</h3>{datos.length ? <div className="forraje-intervalos">{datos.slice(-12).map((item, indice) => <article key={`${item.bancoId}-${item.fecha}-${indice}`}><span>{fechaTexto(item.fecha)}</span><strong>{item.dias} días</strong><small>{item.banco}</small></article>)}</div> : <p className="estado-vacio">Se necesitan al menos dos cortes del mismo banco.</p>}</section>;

const AnaliticaForraje = () => {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { obtenerRendimientoForrajes().then(setDatos).catch((err) => setError(err.message)); }, []);
  if (error) return <div className="alerta-formulario">{error}</div>;
  if (!datos) return <div className="estado-importacion">Calculando rendimiento...</div>;
  const tarjetas = [['Bancos', datos.resumen.totalBancos], ['Cortes', datos.resumen.totalCortes], ['Forraje verde', `${(datos.resumen.forrajeVerdeTotalKg || 0).toLocaleString('es-CR')} kg`], ['Promedio kg/ha/corte', datos.resumen.promedioKgHaCorte == null ? '--' : datos.resumen.promedioKgHaCorte.toLocaleString('es-CR')], ['Intervalo promedio', datos.resumen.diasPromedioEntreCortes == null ? '--' : `${datos.resumen.diasPromedioEntreCortes} días`]];
  return <section className="rendimiento-general"><div><p className="eyebrow">Analítica productiva</p><h2>Rendimiento de bancos forrajeros</h2><p>{datos.descripcion}</p></div><div className="rendimiento-metricas">{tarjetas.map(([etiqueta, valor]) => <article key={etiqueta}><span>{etiqueta}</span><strong>{valor}</strong></article>)}</div><div className="forraje-graficos-grid"><GraficoLinea datos={datos.produccionPorMes} /><GraficoBarras titulo="Promedio kg/ha/corte por banco" datos={datos.produccionPorBanco} valor={(item) => item.promedioKgHaCorte} unidad="kg/ha" /><GraficoBarras titulo="Producción por forraje" datos={datos.produccionPorForraje} valor={(item) => item.cantidadForrajeVerdeKg} /><GraficoBarras titulo="Destino del forraje" datos={datos.destinos} valor={(item) => item.cantidadForrajeVerdeKg} /></div><GraficoIntervalos datos={datos.intervalos} /><div className="tabla-scroll tabla-panel"><table><thead><tr><th>Forraje</th><th>Bancos</th><th>Cortes</th><th>Kg producidos</th><th>Promedio kg/ha/corte</th><th>Intervalo promedio</th></tr></thead><tbody>{datos.produccionPorForraje.map((item) => <tr key={item.clave}><td>{item.nombre}</td><td>{item.bancos}</td><td>{item.cortes}</td><td>{item.cantidadForrajeVerdeKg.toLocaleString('es-CR')}</td><td>{item.promedioKgHaCorte == null ? '--' : item.promedioKgHaCorte.toLocaleString('es-CR')}</td><td>{item.diasPromedioEntreCortes == null ? '--' : `${item.diasPromedioEntreCortes} días`}</td></tr>)}</tbody></table></div></section>;
};

const BancosForrajeros = ({ bancos, cargando, error, soloLectura, onNuevo, onEditar, onEliminar, onRecargar }) => {
  const [detalle, setDetalle] = useState(null);
  const [corte, setCorte] = useState(null);
  const filtros = useMemo(() => [{ id: 'estado', accessor: (item) => item.estado }, { id: 'forraje', accessor: (item) => item.pastoPrincipal?.nombre || '' }], []);
  return <><TablaDinamica titulo="Bancos forrajeros" subtitulo="Producción de forraje de corte" columnas={columnas} datos={bancos} cargando={cargando} error={error} filtros={filtros} textoAgregar="Nuevo banco" onAgregar={soloLectura ? undefined : onNuevo} onEditar={soloLectura ? undefined : onEditar} onEliminar={soloLectura ? undefined : onEliminar} accionesExtra={(banco) => <><button type="button" title="Ver cortes" aria-label="Ver cortes" onClick={() => setDetalle(banco)}>◉</button>{!soloLectura && <button type="button" title="Registrar corte" aria-label="Registrar corte" onClick={() => setCorte(banco)}>✓</button>}</>} mostrarAcciones /><FeatureGate feature="analiticaProductiva" titulo="Análisis de rendimiento de forrajes" pregunta="¿Cuánto producen los bancos, con qué frecuencia se cortan y cómo se comparan sus forrajes?" etiqueta="Analítica de bancos forrajeros"><AnaliticaForraje /></FeatureGate>{detalle && <DetalleBanco banco={detalle} onCerrar={() => setDetalle(null)} onRegistrar={() => { setDetalle(null); setCorte(detalle); }} />}{corte && <FormularioCorte banco={corte} onCerrar={() => setCorte(null)} onGuardado={() => { setCorte(null); onRecargar(); }} />}</>;
};

export default BancosForrajeros;
