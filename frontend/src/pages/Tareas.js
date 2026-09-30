import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarTarea,
  agregarComentarioTarea,
  cambiarEstadoTarea,
  completarTarea,
  crearTarea,
  eliminarTarea,
  obtenerAnimales,
  obtenerMisTareas,
  obtenerTarea,
  obtenerPotreros,
  obtenerTareas,
  obtenerUsuariosAsignables
} from '../services/api';
import useArchivoProtegido from '../hooks/useArchivoProtegido';
import {
  guardarCambiosPendientes,
  guardarTareasOffline,
  obtenerCambiosPendientes,
  obtenerTareasOffline
} from '../services/offlineStorage';
import { obtenerRangoMesActual } from '../utils/fechas';
import { puedeGestionarModulo } from '../constants/permisosRoles';
import { ContenidoPaginado } from '../Components/PaginacionTabla';
import InfoLunarFecha from '../Components/InfoLunarFecha';
import SelectorFechaConLuna from '../Components/SelectorFechaConLuna';
import { esTareaConInfoLunar } from '../utils/tareasLuna.mjs';

const tipos = [
  'Chapia',
  'Herbicida',
  'Fertilización',
  'Sanidad',
  'Pesaje',
  'Revisión de potrero',
  'Revisión de cerca',
  'Conteo de ganado',
  'Limpieza',
  'Alimentación',
  'Reproducción',
  'Siembra',
  'Corte de forraje',
  'Venta',
  'Sacrificio',
  'Otro'
];
const estados = ['Pendiente', 'En proceso', 'Completada', 'Cancelada'];
const prioridades = ['Baja', 'Media', 'Alta', 'Urgente'];
const especies = ['Bovino', 'Porcino'];
const categoriasAutomaticas = [
  'Reproducción porcina',
  'Crías porcinas',
  'Sanidad porcina',
  'Alimentación porcina'
];

const estadoInicial = {
  titulo: '',
  descripcion: '',
  tipo: 'Otro',
  estado: 'Pendiente',
  prioridad: 'Media',
  fechaProgramada: new Date().toISOString().slice(0, 10),
  fechaLimite: '',
  asignadoA: '',
  potrero: '',
  animal: '',
  observaciones: ''
};

const fechaInput = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toISOString().slice(0, 10);
};

const formatearFecha = (fecha) => {
  if (!fecha) return '--';
  return new Date(fecha).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const nombreUsuario = (usuario) => {
  if (!usuario) return '--';
  return [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || usuario.correo || '--';
};

const nombrePotreroAnimal = (tarea) => {
  const potrero = tarea.potrero ? `${tarea.potrero.codigo || ''} ${tarea.potrero.nombre || ''}`.trim() : '';
  const codigoAnimal = tarea.animal?.diio || tarea.animal?.identificadorFinca || '';
  const animal = tarea.animal ? `${codigoAnimal} ${tarea.animal.nombre || ''}`.trim() : '';
  return [potrero, animal].filter(Boolean).join(' / ') || '--';
};

const estaVencida = (tarea) => {
  if (!tarea.fechaLimite || ['Completada', 'Cancelada'].includes(tarea.estado)) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(tarea.fechaLimite);
  limite.setHours(0, 0, 0, 0);
  return limite < hoy;
};

const esTareaDeHoy = (tarea) => {
  if (!tarea.fechaProgramada || ['Completada', 'Cancelada'].includes(tarea.estado)) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(tarea.fechaProgramada);
  fecha.setHours(0, 0, 0, 0);
  return fecha.getTime() === hoy.getTime();
};

const diasParaTarea = (tarea) => {
  if (!tarea.fechaProgramada) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(tarea.fechaProgramada);
  fecha.setHours(0, 0, 0, 0);
  return Math.round((fecha - hoy) / (1000 * 60 * 60 * 24));
};

const textoTiempoTarea = (tarea) => {
  const dias = diasParaTarea(tarea);
  if (dias === null) return '--';
  if (dias < 0) return `${Math.abs(dias)} días vencida`;
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return `En ${dias} días`;
};

const normalizarTarea = (tarea) => ({
  ...estadoInicial,
  ...tarea,
  asignadoA: tarea?.asignadoA?._id || tarea?.asignadoA || '',
  potrero: tarea?.potrero?._id || tarea?.potrero || '',
  animal: tarea?.animal?._id || tarea?.animal || '',
  fechaProgramada: fechaInput(tarea?.fechaProgramada) || estadoInicial.fechaProgramada,
  fechaLimite: fechaInput(tarea?.fechaLimite)
});

const slug = (valor = '') => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').toLowerCase();

const Tareas = ({ usuario, tareaInicialId = '' }) => {
  const puedeGestionar = puedeGestionarModulo(usuario?.rol, 'Tareas');
  const soloLectura = usuario?.rol === 'Consulta';
  const [tareas, setTareas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [potreros, setPotreros] = useState([]);
  const [animales, setAnimales] = useState([]);
  const [filtros, setFiltros] = useState({
    ...obtenerRangoMesActual(),
    estado: '',
    prioridad: '',
    tipo: '',
    asignadoA: '',
    especie: '',
    categoriaAutomatica: '',
    creadoAutomaticamente: ''
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [tareaSeleccionada, setTareaSeleccionada] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [formulario, setFormulario] = useState(estadoInicial);
  const [comentario, setComentario] = useState('');
  const [evidencia, setEvidencia] = useState(null);
  const [observacionesCompletar, setObservacionesCompletar] = useState('');
  const [reprogramacion, setReprogramacion] = useState(null);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      setError('');
      const filtrosActivos = Object.fromEntries(Object.entries(filtros).filter(([, valor]) => Boolean(valor)));
      const tareasData = puedeGestionar ? await obtenerTareas(filtrosActivos) : await obtenerMisTareas(filtrosActivos);
      const pendientes = await obtenerCambiosPendientes().catch(() => []);
      const tareasConPendientes = tareasData.map((tarea) => {
        const cambioPendiente = pendientes.find((cambio) => cambio.tipo === 'completar-tarea' && cambio.referenciaId === tarea._id);
        if (!cambioPendiente) return tarea;
        if (cambioPendiente.estadoSincronizacion === 'Conflicto') {
          return { ...tarea, conflictoSincronizacion: true };
        }
        return {
          ...tarea,
          estado: 'Completada',
          pendienteSincronizar: true,
          estadoSincronizacion: cambioPendiente.estadoSincronizacion
        };
      });
      setTareas(tareasConPendientes);
      if (!puedeGestionar) {
        await guardarTareasOffline(tareasConPendientes, { filtros: filtrosActivos }).catch(() => {});
      }

      if (puedeGestionar) {
        const [usuariosData, potrerosData, animalesData] = await Promise.all([
          obtenerUsuariosAsignables('Tareas'),
          obtenerPotreros(),
          obtenerAnimales()
        ]);
        setUsuarios(usuariosData.filter((usuarioItem) => usuarioItem.estado !== 'Inactivo'));
        setPotreros(potrerosData);
        setAnimales(animalesData);
      }
    } catch (err) {
      if (!puedeGestionar) {
        const filtrosActivos = Object.fromEntries(Object.entries(filtros).filter(([, valor]) => Boolean(valor)));
        const tareasOffline = await obtenerTareasOffline({ filtros: filtrosActivos }).catch(() => []);
        setTareas(tareasOffline);
        setError(tareasOffline.length ? 'Sin conexion. Mostrando tareas guardadas en este dispositivo.' : err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [
    filtros.fechaInicio,
    filtros.fechaFin,
    filtros.estado,
    filtros.prioridad,
    filtros.tipo,
    filtros.asignadoA,
    filtros.especie,
    filtros.categoriaAutomatica,
    filtros.creadoAutomaticamente,
    usuario?.rol
  ]);

  useEffect(() => {
    const actualizarTrasSincronizacion = () => {
      if (navigator.onLine) cargarDatos();
    };
    window.addEventListener('ganaderiaOfflineSincronizado', actualizarTrasSincronizacion);
    return () => window.removeEventListener('ganaderiaOfflineSincronizado', actualizarTrasSincronizacion);
  }, [usuario?.rol, filtros]);

  useEffect(() => {
    if (!tareaInicialId) return;
    obtenerTarea(tareaInicialId)
      .then((tarea) => setDetalle(tarea))
      .catch((err) => setError(err.message));
  }, [tareaInicialId]);

  const resumen = useMemo(() => ({
    total: tareas.length,
    pendientes: tareas.filter((tarea) => tarea.estado === 'Pendiente').length,
    enProceso: tareas.filter((tarea) => tarea.estado === 'En proceso').length,
    completadas: tareas.filter((tarea) => tarea.estado === 'Completada').length,
    vencidas: tareas.filter(estaVencida).length,
    automaticasPorcinas: tareas.filter((tarea) => tarea.especie === 'Porcino' && tarea.creadoAutomaticamente).length,
    porcinasHoy: tareas.filter((tarea) => tarea.especie === 'Porcino' && esTareaDeHoy(tarea)).length
  }), [tareas]);

  const verTareasAutomaticas = () => {
    setFiltros((actual) => ({
      ...actual,
      creadoAutomaticamente: 'true'
    }));
  };

  const limpiarFiltros = () => {
    setFiltros({
      ...obtenerRangoMesActual(),
      estado: '',
      prioridad: '',
      tipo: '',
      asignadoA: '',
      especie: '',
      categoriaAutomatica: '',
      creadoAutomaticamente: ''
    });
  };

  const actualizarFiltro = (evento) => {
    const { name, value } = evento.target;
    setFiltros((actual) => ({ ...actual, [name]: value }));
  };

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const abrirNuevo = () => {
    setTareaSeleccionada(null);
    setFormulario({ ...estadoInicial, asignadoA: usuarios[0]?._id || '' });
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const abrirEdicion = (tarea) => {
    setTareaSeleccionada(tarea);
    setFormulario(normalizarTarea(tarea));
    setErrorFormulario('');
    setModoFormulario(true);
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    const datos = {
      ...formulario,
      fechaLimite: formulario.fechaLimite || null,
      potrero: formulario.potrero || null,
      animal: formulario.animal || null
    };

    try {
      setGuardando(true);
      setErrorFormulario('');
      if (tareaSeleccionada?._id) {
        await actualizarTarea(tareaSeleccionada._id, datos);
      } else {
        await crearTarea(datos);
      }
      setModoFormulario(false);
      setTareaSeleccionada(null);
      await cargarDatos();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (tarea, estado, observaciones = '') => {
    try {
      setGuardando(true);
      await cambiarEstadoTarea(tarea._id, estado, observaciones);
      await cargarDatos();
      setDetalle((actual) => (actual?._id === tarea._id ? { ...actual, estado, observaciones: observaciones || actual.observaciones } : actual));
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const cancelarTarea = async (tarea) => {
    const observaciones = window.prompt('Motivo para cancelar la tarea:', 'Tarea cancelada manualmente');
    if (observaciones === null) return;
    await cambiarEstado(tarea, 'Cancelada', observaciones);
  };

  const reprogramarTarea = async (tarea) => {
    if (!puedeGestionar) return;
    setDetalle(null);
    setReprogramacion({ tarea, fecha: fechaInput(tarea.fechaProgramada) });
  };

  const guardarReprogramacion = async (evento) => {
    evento.preventDefault();
    if (!reprogramacion?.fecha) return;

    try {
      setGuardando(true);
      await actualizarTarea(reprogramacion.tarea._id, { fechaProgramada: reprogramacion.fecha });
      await cargarDatos();
      setDetalle((actual) => (actual?._id === reprogramacion.tarea._id
        ? { ...actual, fechaProgramada: reprogramacion.fecha }
        : actual));
      setReprogramacion(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const completar = async (tarea) => {
    try {
      setGuardando(true);
      if (!navigator.onLine) {
        await guardarCambiosPendientes({
          tipo: 'completar-tarea',
          referenciaId: tarea._id,
          titulo: tarea.titulo,
          payload: {
            observaciones: observacionesCompletar,
            evidencia,
            versionEsperada: tarea.updatedAt
          }
        });
        const tareasActualizadas = tareas.map((item) => (
          item._id === tarea._id ? { ...item, estado: 'Completada', pendienteSincronizar: true } : item
        ));
        setTareas(tareasActualizadas);
        const filtrosActivos = Object.fromEntries(Object.entries(filtros).filter(([, valor]) => Boolean(valor)));
        await guardarTareasOffline(tareasActualizadas, { filtros: filtrosActivos });
        setDetalle((actual) => (actual?._id === tarea._id ? { ...actual, estado: 'Completada', pendienteSincronizar: true } : actual));
        setError('Sin conexion. La tarea queda pendiente de sincronizar.');
      } else {
        await completarTarea({ id: tarea._id, observaciones: observacionesCompletar, evidencia });
        await cargarDatos();
      }
      setEvidencia(null);
      setObservacionesCompletar('');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (tarea) => {
    const confirmar = window.confirm(`¿Eliminar la tarea "${tarea.titulo}"? Esta accion no se puede deshacer.`);
    if (!confirmar) return;

    try {
      await eliminarTarea(tarea._id);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const agregarComentario = async (evento) => {
    evento.preventDefault();
    if (!detalle || !comentario.trim()) return;

    try {
      const tareaActualizada = await agregarComentarioTarea(detalle._id, comentario.trim());
      setDetalle(tareaActualizada);
      setComentario('');
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const evidenciaProtegidaUrl = useArchivoProtegido(detalle?.evidenciaUrl);

  return (
    <section className="tareas-page">
      <div className="panel-title">
        <div>
          <p className="eyebrow">{puedeGestionar ? 'Administracion' : 'Mis tareas'}</p>
          <h2>{puedeGestionar ? 'Tareas' : 'Mis tareas asignadas'}</h2>
        </div>
        {puedeGestionar && <button className="boton-primario compacto" type="button" onClick={abrirNuevo}>+ Nueva tarea</button>}
      </div>

      <section className="reportes-metricas">
        <article><span>Total tareas</span><strong>{resumen.total}</strong></article>
        <article><span>Pendientes</span><strong>{resumen.pendientes}</strong></article>
        <article><span>En proceso</span><strong>{resumen.enProceso}</strong></article>
        <article><span>Completadas</span><strong>{resumen.completadas}</strong></article>
        <article><span>Vencidas</span><strong>{resumen.vencidas}</strong></article>
        <article><span>Automáticas porcinas</span><strong>{resumen.automaticasPorcinas}</strong></article>
        <article><span>Porcinas hoy</span><strong>{resumen.porcinasHoy}</strong></article>
      </section>

      <div className="tareas-filtros">
        <div className="finanzas-rango-fechas tareas-rango-fechas">
          <label>
            Desde
            <input type="date" name="fechaInicio" value={filtros.fechaInicio} onChange={actualizarFiltro} />
          </label>
          <label>
            Hasta
            <input type="date" name="fechaFin" value={filtros.fechaFin} onChange={actualizarFiltro} />
          </label>
        </div>

        <div className="tabla-toolbar tareas-filtros-secundarios">
          <button className="boton-link filtro-rapido" type="button" onClick={limpiarFiltros}>Mes actual</button>
          <button className="boton-link filtro-rapido" type="button" onClick={verTareasAutomaticas}>Automáticas</button>
          <select name="estado" value={filtros.estado} onChange={actualizarFiltro}>
            <option value="">Todos los estados</option>
            {estados.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
          </select>
          <select name="prioridad" value={filtros.prioridad} onChange={actualizarFiltro}>
            <option value="">Todas las prioridades</option>
            {prioridades.map((prioridad) => <option key={prioridad} value={prioridad}>{prioridad}</option>)}
          </select>
          <select name="tipo" value={filtros.tipo} onChange={actualizarFiltro}>
            <option value="">Todos los tipos</option>
            {tipos.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
          </select>
          <select name="especie" value={filtros.especie} onChange={actualizarFiltro}>
            <option value="">Todas las especies</option>
            {especies.map((especie) => <option key={especie} value={especie}>{especie}</option>)}
          </select>
          <select name="categoriaAutomatica" value={filtros.categoriaAutomatica} onChange={actualizarFiltro}>
            <option value="">Todas las categorías automáticas</option>
            {categoriasAutomaticas.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
          </select>
          <select name="creadoAutomaticamente" value={filtros.creadoAutomaticamente} onChange={actualizarFiltro}>
            <option value="">Manual y automática</option>
            <option value="true">Solo automáticas</option>
            <option value="false">Solo manuales</option>
          </select>
          {puedeGestionar && (
            <select name="asignadoA" value={filtros.asignadoA} onChange={actualizarFiltro}>
              <option value="">Todos los responsables</option>
              {usuarios.map((usuarioItem) => (
                <option key={usuarioItem._id} value={usuarioItem._id}>{nombreUsuario(usuarioItem)}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando tareas...</div>}

      <ContenidoPaginado datos={tareas}>
        {(tareasPagina) => (
          <div className="tabla-scroll tabla-dinamica">
            <table>
          <thead>
            <tr>
              <th>Titulo</th>
              <th>Tipo</th>
              <th>Categoría</th>
              <th>Responsable</th>
              <th>Potrero/Animal</th>
              <th>Fecha programada</th>
              <th>Fecha limite</th>
              <th>Prioridad</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tareasPagina.map((tarea) => (
              <tr key={tarea._id} className={estaVencida(tarea) ? 'tarea-vencida' : ''}>
                <td>
                  <div className="tarea-titulo-celda">
                    <span>{tarea.titulo}</span>
                    {tarea.creadoAutomaticamente && <small className="tarea-auto-badge">Automática</small>}
                    {tarea.especie && <small className={`tarea-especie-badge especie-${slug(tarea.especie)}`}>{tarea.especie}</small>}
                  </div>
                </td>
                <td>{tarea.tipo}</td>
                <td>{tarea.categoriaAutomatica || '--'}</td>
                <td>{nombreUsuario(tarea.asignadoA)}</td>
                <td>{nombrePotreroAnimal(tarea)}</td>
                <td>
                  {formatearFecha(tarea.fechaProgramada)}
                  {esTareaConInfoLunar(tarea) && <InfoLunarFecha fecha={tarea.fechaProgramada} compacta mostrarIluminacion={false} />}
                </td>
                <td>{formatearFecha(tarea.fechaLimite)}</td>
                <td><span className={`tarea-prioridad tarea-prioridad-${slug(tarea.prioridad)}`}>{tarea.prioridad}</span></td>
                <td>
                  <span className={`tarea-badge tarea-estado-${slug(estaVencida(tarea) ? 'Vencida' : tarea.estado)}`}>
                    {estaVencida(tarea) ? 'Vencida' : tarea.estado}
                  </span>
                  {tarea.pendienteSincronizar && <span className="sync-badge">Pendiente de sincronizar</span>}
                  {tarea.conflictoSincronizacion && <span className="sync-badge sync-badge-conflict">Requiere revisión</span>}
                </td>
                <td>
                  <div className="acciones-tabla acciones-tabla-amplia">
                    <button type="button" title="Ver detalle" onClick={() => setDetalle(tarea)}>⊙</button>
                    {puedeGestionar && <button type="button" title="Editar" onClick={() => abrirEdicion(tarea)}>✎</button>}
                    {puedeGestionar && <button type="button" title="Reprogramar" onClick={() => reprogramarTarea(tarea)} disabled={guardando}>↷</button>}
                    {!soloLectura && tarea.estado === 'Pendiente' && <button type="button" title="En proceso" onClick={() => cambiarEstado(tarea, 'En proceso')} disabled={guardando}>▶</button>}
                    {!soloLectura && tarea.estado !== 'Completada' && <button type="button" title="Completar" onClick={() => completar(tarea)} disabled={guardando}>✓</button>}
                    {!soloLectura && ['En proceso', 'Completada'].includes(tarea.estado) && <button type="button" title="Reabrir como pendiente" onClick={() => cambiarEstado(tarea, 'Pendiente')} disabled={guardando}>↶</button>}
                    {puedeGestionar && !['Completada', 'Cancelada'].includes(tarea.estado) && <button type="button" title="Cancelar tarea" onClick={() => cancelarTarea(tarea)} disabled={guardando}>×</button>}
                    {puedeGestionar && <button type="button" title="Eliminar" onClick={() => borrar(tarea)}>⌫</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
            </table>
          </div>
        )}
      </ContenidoPaginado>

      {modoFormulario && (
        <div className="modal-backdrop">
          <form className="modal-panel usuario-modal tarea-form-modal" onSubmit={guardar}>
            <div className="panel-title">
              <div>
                <p className="eyebrow">Tareas</p>
                <h2>{tareaSeleccionada ? 'Editar tarea' : 'Nueva tarea'}</h2>
              </div>
              <button className="boton-link" type="button" onClick={() => setModoFormulario(false)}>Cerrar</button>
            </div>
            {errorFormulario && <div className="alerta-formulario">{errorFormulario}</div>}
            <div className="tarea-form-grid">
              <label className="campo-completo">Titulo<input name="titulo" value={formulario.titulo} onChange={actualizarCampo} required /></label>
              <label>Estado<select name="estado" value={formulario.estado} onChange={actualizarCampo}>{estados.map((estado) => <option key={estado} value={estado}>{estado}</option>)}</select></label>
              <label>Tipo<select name="tipo" value={formulario.tipo} onChange={actualizarCampo}>{tipos.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select></label>
              <label>Prioridad<select name="prioridad" value={formulario.prioridad} onChange={actualizarCampo}>{prioridades.map((prioridad) => <option key={prioridad} value={prioridad}>{prioridad}</option>)}</select></label>
              <SelectorFechaConLuna
                etiqueta="Fecha programada"
                value={formulario.fechaProgramada}
                onChange={(fechaProgramada) => setFormulario((actual) => ({ ...actual, fechaProgramada }))}
                mostrarLuna={esTareaConInfoLunar(formulario)}
                required
              />
              <label>Fecha limite<input name="fechaLimite" type="date" value={formulario.fechaLimite} onChange={actualizarCampo} /></label>
              <label>Asignado a<select name="asignadoA" value={formulario.asignadoA} onChange={actualizarCampo} required>{usuarios.map((usuarioItem) => <option key={usuarioItem._id} value={usuarioItem._id}>{nombreUsuario(usuarioItem)}</option>)}</select></label>
              <label>Potrero<select name="potrero" value={formulario.potrero} onChange={actualizarCampo}><option value="">Sin potrero</option>{potreros.map((potrero) => <option key={potrero._id} value={potrero._id}>{potrero.codigo} - {potrero.nombre}</option>)}</select></label>
              <label>Animal<select name="animal" value={formulario.animal} onChange={actualizarCampo}><option value="">Sin animal</option>{animales.map((animal) => <option key={animal._id} value={animal._id}>{animal.diio || animal.identificadorFinca}</option>)}</select></label>
              <label className="campo-completo">Descripcion<textarea name="descripcion" rows="3" value={formulario.descripcion} onChange={actualizarCampo} /></label>
              <label className="campo-completo">Observaciones<textarea name="observaciones" rows="3" value={formulario.observaciones} onChange={actualizarCampo} /></label>
            </div>
            <div className="form-actions">
              <button className="boton-link" type="button" onClick={() => setModoFormulario(false)}>Cancelar</button>
              <button className="boton-primario compacto" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar tarea'}</button>
            </div>
          </form>
        </div>
      )}

      {reprogramacion && (
        <div className="modal-backdrop modal-backdrop-superior">
          <form className="modal-panel tarea-reprogramar-modal" onSubmit={guardarReprogramacion}>
            <div className="panel-title">
              <div><p className="eyebrow">Reprogramar tarea</p><h2>{reprogramacion.tarea.titulo}</h2></div>
              <button className="boton-link" type="button" onClick={() => setReprogramacion(null)}>Cerrar</button>
            </div>
            <SelectorFechaConLuna
              value={reprogramacion.fecha}
              onChange={(fecha) => setReprogramacion((actual) => ({ ...actual, fecha }))}
              mostrarLuna={esTareaConInfoLunar(reprogramacion.tarea)}
              required
            />
            <div className="form-actions">
              <button className="boton-link" type="button" onClick={() => setReprogramacion(null)}>Cancelar</button>
              <button className="boton-primario compacto" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar fecha'}</button>
            </div>
          </form>
        </div>
      )}

      {detalle && (
        <div className="modal-backdrop">
          <section className="modal-panel usuario-modal">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Detalle de tarea</p>
                <h2>{detalle.titulo}</h2>
              </div>
              <button className="boton-link" type="button" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
            <div className="detalle-animal-grid">
              <article><span>Tipo</span><strong>{detalle.tipo}</strong></article>
              <article><span>Responsable</span><strong>{nombreUsuario(detalle.asignadoA)}</strong></article>
              <article><span>Programada</span><strong>{formatearFecha(detalle.fechaProgramada)}</strong>{esTareaConInfoLunar(detalle) && <InfoLunarFecha fecha={detalle.fechaProgramada} compacta />}</article>
              <article><span>Limite</span><strong>{formatearFecha(detalle.fechaLimite)}</strong></article>
              <article><span>Prioridad</span><strong>{detalle.prioridad}</strong></article>
              <article><span>Estado</span><strong>{detalle.estado}</strong></article>
              <article><span>Tiempo</span><strong>{textoTiempoTarea(detalle)}</strong></article>
              {detalle.especie && <article><span>Especie</span><strong>{detalle.especie}</strong></article>}
              {detalle.creadoAutomaticamente && <article><span>Origen</span><strong>Automática</strong></article>}
              {detalle.moduloOrigen && <article><span>Módulo</span><strong>{detalle.moduloOrigen}</strong></article>}
              {detalle.categoriaAutomatica && <article><span>Categoría</span><strong>{detalle.categoriaAutomatica}</strong></article>}
              {detalle.claveAutomatica && <article><span>Regla</span><strong>{detalle.claveAutomatica}</strong></article>}
              {detalle.referenciaId && <article><span>Referencia</span><strong>{detalle.referenciaId}</strong></article>}
            </div>
            {detalle.descripcion && <div className="detalle-observaciones"><span>Descripcion</span><p>{detalle.descripcion}</p></div>}
            {detalle.observaciones && <div className="detalle-observaciones"><span>Observaciones</span><p>{detalle.observaciones}</p></div>}
            {evidenciaProtegidaUrl && <img className="tarea-evidencia" src={evidenciaProtegidaUrl} alt="Evidencia de tarea" />}

            {!soloLectura && detalle.estado !== 'Completada' && (
              <div className="form-card tarea-completar-card">
                <label>Observaciones al completar<textarea rows="3" value={observacionesCompletar} onChange={(evento) => setObservacionesCompletar(evento.target.value)} /></label>
                <label>Evidencia<input type="file" accept="image/*" onChange={(evento) => setEvidencia(evento.target.files?.[0] || null)} /></label>
                <button className="boton-primario compacto" type="button" onClick={() => completar(detalle)} disabled={guardando}>{guardando ? 'Completando...' : 'Completar tarea'}</button>
              </div>
            )}
            {!soloLectura && <div className="tarea-detalle-acciones">
              {detalle.estado === 'Pendiente' && (
                <button className="boton-link" type="button" onClick={() => cambiarEstado(detalle, 'En proceso')} disabled={guardando}>
                  Pasar a en proceso
                </button>
              )}
              {['En proceso', 'Completada'].includes(detalle.estado) && (
                <button className="boton-link" type="button" onClick={() => cambiarEstado(detalle, 'Pendiente')} disabled={guardando}>
                  Reabrir como pendiente
                </button>
              )}
              {puedeGestionar && (
                <button className="boton-link" type="button" onClick={() => reprogramarTarea(detalle)} disabled={guardando}>
                  Reprogramar
                </button>
              )}
              {puedeGestionar && !['Completada', 'Cancelada'].includes(detalle.estado) && (
                <button className="boton-link danger-link" type="button" onClick={() => cancelarTarea(detalle)} disabled={guardando}>
                  Cancelar tarea
                </button>
              )}
            </div>}

            {!soloLectura && <form className="form-card" onSubmit={agregarComentario}>
              <label>Comentario<textarea rows="3" value={comentario} onChange={(evento) => setComentario(evento.target.value)} /></label>
              <button className="boton-primario compacto" type="submit">Agregar comentario</button>
            </form>}
            <div className="tarea-comentarios">
              {detalle.comentarios?.map((item) => (
                <article key={item._id || item.fecha}>
                  <strong>{nombreUsuario(item.usuario)}</strong>
                  <span>{formatearFecha(item.fecha)}</span>
                  <p>{item.texto}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default Tareas;
