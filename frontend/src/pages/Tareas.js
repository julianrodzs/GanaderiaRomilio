import React, { useEffect, useMemo, useState } from 'react';
import {
  actualizarTarea,
  agregarComentarioTarea,
  cambiarEstadoTarea,
  completarTarea,
  crearTarea,
  eliminarTarea,
  obtenerAnimales,
  obtenerActividadIATFPorTarea,
  obtenerActividadEngordePorTarea,
  obtenerActividadPorcinaPorTarea,
  obtenerMisTareas,
  obtenerTarea,
  obtenerPotreros,
  obtenerTareas,
  obtenerUsuariosAsignables,
  obtenerRaciones,
  ejecutarPasoEngorde,
  ejecutarPasoBandaPorcina,
  ejecutarPasoIATF,
  registrarInseminacionesIATF
} from '../services/api';
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
import { etiquetaUsuarioConRol, nombreUsuario } from '../utils/usuarios';

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
  'Alimentación porcina',
  'PROTOCOLO_ENGORDE',
  'BANDA_PORCINA'
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
    creadoAutomaticamente: '',
    busqueda: ''
  });
  const [busquedaTexto, setBusquedaTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [tareaSeleccionada, setTareaSeleccionada] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [formulario, setFormulario] = useState(estadoInicial);
  const [comentario, setComentario] = useState('');
  const [observacionesCompletar, setObservacionesCompletar] = useState('');
  const [reprogramacion, setReprogramacion] = useState(null);
  const [actividadIatf, setActividadIatf] = useState(null);
  const [actividadProtocolo, setActividadProtocolo] = useState(null);

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
      await guardarTareasOffline(tareasConPendientes, { filtros: filtrosActivos }).catch(() => {});

      if (puedeGestionar) {
        try {
          const [usuariosData, potrerosData, animalesData] = await Promise.all([
            obtenerUsuariosAsignables('Tareas'),
            obtenerPotreros(),
            obtenerAnimales()
          ]);
          setUsuarios(usuariosData.filter((usuarioItem) => usuarioItem.estado !== 'Inactivo'));
          setPotreros(potrerosData);
          setAnimales(animalesData);
        } catch (errorAuxiliar) {
          setError('Las tareas se cargaron, pero algunas opciones de edición no están disponibles temporalmente.');
        }
      }
    } catch (err) {
      const filtrosActivos = Object.fromEntries(Object.entries(filtros).filter(([, valor]) => Boolean(valor)));
      const tareasOffline = await obtenerTareasOffline({ filtros: filtrosActivos }).catch(() => []);
      const errorDeConexion = !navigator.onLine || err instanceof TypeError;
      setTareas(tareasOffline);
      setError(tareasOffline.length
        ? `${errorDeConexion ? 'Sin conexión' : 'No se pudieron actualizar las tareas'}. Mostrando datos guardados en este dispositivo.`
        : errorDeConexion
          ? 'Sin conexión y sin tareas guardadas para estos filtros.'
          : err.message);
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
    filtros.busqueda,
    usuario?.rol
  ]);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      const busqueda = busquedaTexto.trim();
      setFiltros((actual) => actual.busqueda === busqueda ? actual : { ...actual, busqueda });
    }, 350);
    return () => window.clearTimeout(temporizador);
  }, [busquedaTexto]);

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
    setBusquedaTexto('');
    setFiltros({
      ...obtenerRangoMesActual(),
      estado: '',
      prioridad: '',
      tipo: '',
      asignadoA: '',
      especie: '',
      categoriaAutomatica: '',
      creadoAutomaticamente: '',
      busqueda: ''
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
      if (tarea.categoriaAutomatica === 'IATF') {
        if (!navigator.onLine) throw new Error('La ejecución IATF necesita conexión para validar existencias y evitar consumos duplicados.');
        const actividad = await obtenerActividadIATFPorTarea(tarea._id);
        const aplicados = new Set((actividad.ejecucion.animalesAplicados || []).map((id) => String(id?._id || id)));
        const esPasoInseminacion = actividad.ejecucion.pasoSnapshot.tipoAccion === 'IATF';
        const soloInseminacion = esPasoInseminacion && aplicados.size > 0;
        const participantes = actividad.campana.participantes.filter((item) => {
          const id = String(item.animal?._id || item.animal);
          if (['RETIRADA', 'CANCELADA'].includes(item.estadoParticipacion)) return false;
          if (soloInseminacion) return aplicados.has(id) && item.estadoParticipacion !== 'INSEMINADA';
          return !aplicados.has(id);
        });
        setActividadIatf({
          ...actividad,
          participantes,
          soloInseminacion,
          animales: participantes.map((item) => String(item.animal?._id || item.animal)),
          retornosCelo: [],
          fechaHoraReal: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
          productos: (actividad.ejecucion.pasoSnapshot.productos || []).map((producto) => ({ producto: String(producto.producto?._id || producto.producto), cantidad: '', dosis: producto.dosis || '', unidad: producto.unidad || '' })),
          semen: ''
        });
        setDetalle(null);
        return;
      }
      if (['PROTOCOLO_ENGORDE', 'BANDA_PORCINA'].includes(tarea.categoriaAutomatica)) {
        if (!navigator.onLine) throw new Error('La ejecución de protocolos necesita conexión para evitar registros duplicados.');
        if (tarea.categoriaAutomatica === 'PROTOCOLO_ENGORDE') {
          const [actividad, raciones] = await Promise.all([obtenerActividadEngordePorTarea(tarea._id), obtenerRaciones({ especie: 'Bovino', activo: true })]);
          setActividadProtocolo({ tipo: 'ENGORDE', ...actividad, raciones, fechaReal: fechaInput(new Date()), observaciones: '', racion: raciones[0]?._id || '', producto: '', tipoSanidad: '', dosis: '', viaAplicacion: '', pesajes: (actividad.ciclo.detalleLote.animales || []).map((animal) => ({ animal: animal._id, etiqueta: animal.diio || animal.identificadorFinca || animal.nombre, peso: '' })) });
        } else {
          const actividad = await obtenerActividadPorcinaPorTarea(tarea._id);
          const procesados = new Set((actividad.ejecucion.participantes || []).map(String));
          const disponibles = actividad.banda.participantes.filter((item) => item.estadoParticipacion !== 'RETIRADA' && !procesados.has(String(item._id))).map((item) => String(item._id));
          const participantes = ['PARTO', 'DESTETE_CAMADA'].includes(actividad.ejecucion.tipoAccion) ? disponibles.slice(0, 1) : disponibles;
          setActividadProtocolo({ tipo: 'PORCINO', ...actividad, fechaReal: fechaInput(new Date()), observaciones: '', resultado: 'PREÑADA', retornoCelo: false, participantes, producto: '', tipoSanidad: '', dosis: '', viaAplicacion: '', nacidosTotales: '', nacidosVivos: '', nacidosMuertos: '', momias: '', destetados: '', pesoPromedioDestete: '' });
        }
        setDetalle(null);
        return;
      }
      if (!navigator.onLine) {
        await guardarCambiosPendientes({
          tipo: 'completar-tarea',
          referenciaId: tarea._id,
          titulo: tarea.titulo,
          payload: {
            observaciones: observacionesCompletar,
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
        await completarTarea({ id: tarea._id, observaciones: observacionesCompletar });
        await cargarDatos();
      }
      setObservacionesCompletar('');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const guardarEjecucionIatf = async () => {
    if (!actividadIatf?.animales.length) return;
    try {
      setGuardando(true);
      const tipoAccion = actividadIatf.ejecucion.pasoSnapshot.tipoAccion;
      if (tipoAccion === 'IATF') {
        if (!actividadIatf.semen) throw new Error('Selecciona la pajuela utilizada antes de registrar la IATF.');
      }
      if (!actividadIatf.soloInseminacion) {
        await ejecutarPasoIATF(actividadIatf.campana._id, actividadIatf.ejecucion.pasoPlantilla, {
          fechaHoraReal: actividadIatf.fechaHoraReal,
          animales: actividadIatf.animales,
          retornoCeloAnimales: actividadIatf.retornosCelo,
          productos: actividadIatf.productos.filter((item) => Number(item.cantidad) > 0).map((item) => ({ ...item, cantidad: Number(item.cantidad) }))
        });
      }
      if (tipoAccion === 'IATF') {
        const seleccionados = actividadIatf.participantes.filter((item) => actividadIatf.animales.includes(String(item.animal?._id || item.animal)));
        await registrarInseminacionesIATF(actividadIatf.campana._id, {
          fechaHoraReal: actividadIatf.fechaHoraReal,
          inseminaciones: seleccionados.map((item) => ({ participanteId: item._id, semen: actividadIatf.semen, fechaHoraReal: actividadIatf.fechaHoraReal }))
        });
      }
      setActividadIatf(null);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const guardarEjecucionProtocolo = async () => {
    try {
      setGuardando(true); setError('');
      if (actividadProtocolo.tipo === 'ENGORDE') {
        const tipoAccion = actividadProtocolo.ejecucion.tipoAccion;
        const datos = { fechaReal: actividadProtocolo.fechaReal, observaciones: actividadProtocolo.observaciones };
        if (tipoAccion === 'PESAJE') datos.pesajes = actividadProtocolo.pesajes.filter((item) => item.peso !== '');
        if (tipoAccion === 'CAMBIO_RACION') datos.racion = actividadProtocolo.racion;
        if (tipoAccion === 'SANIDAD') datos.aplicacion = { producto: actividadProtocolo.producto, tipo: actividadProtocolo.tipoSanidad, dosis: actividadProtocolo.dosis, viaAplicacion: actividadProtocolo.viaAplicacion, motivo: actividadProtocolo.observaciones };
        await ejecutarPasoEngorde(actividadProtocolo.ciclo._id, actividadProtocolo.ejecucion._id, datos);
      } else {
        const tipoAccion = actividadProtocolo.ejecucion.tipoAccion;
        const datos = { fechaReal: actividadProtocolo.fechaReal, observaciones: actividadProtocolo.observaciones, participantes: actividadProtocolo.participantes };
        if (tipoAccion === 'DIAGNOSTICO_GESTACION') datos.resultado = actividadProtocolo.resultado;
        if (tipoAccion === 'CONTROL_REPETICION') datos.retornoCelo = actividadProtocolo.retornoCelo;
        if (tipoAccion === 'TRATAMIENTO_REPRODUCTIVO') datos.aplicacion = { producto: actividadProtocolo.producto, tipo: actividadProtocolo.tipoSanidad, dosis: actividadProtocolo.dosis, viaAplicacion: actividadProtocolo.viaAplicacion, motivo: actividadProtocolo.observaciones };
        if (tipoAccion === 'PARTO') datos.camada = { nacidosTotales: Number(actividadProtocolo.nacidosTotales || 0), nacidosVivos: Number(actividadProtocolo.nacidosVivos || 0), nacidosMuertos: Number(actividadProtocolo.nacidosMuertos || 0), momias: Number(actividadProtocolo.momias || 0), destino: 'No definido' };
        if (tipoAccion === 'DESTETE_CAMADA') { datos.destetados = Number(actividadProtocolo.destetados || 0); datos.pesoPromedioDestete = actividadProtocolo.pesoPromedioDestete || undefined; }
        await ejecutarPasoBandaPorcina(actividadProtocolo.banda._id, actividadProtocolo.ejecucion._id, datos);
      }
      setActividadProtocolo(null); await cargarDatos();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
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
        <label className="tareas-buscador">
          <span>Buscar tareas</span>
          <input
            type="search"
            value={busquedaTexto}
            onChange={(evento) => setBusquedaTexto(evento.target.value)}
            placeholder="DIIO, animal, camada o protocolo"
            maxLength="80"
          />
        </label>
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
                <option key={usuarioItem._id} value={usuarioItem._id}>{etiquetaUsuarioConRol(usuarioItem)}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando tareas...</div>}

      <ContenidoPaginado datos={tareas} clavePaginacion="tareas-listado">
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
                <td>{etiquetaUsuarioConRol(tarea.asignadoA)}</td>
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
              <label>Asignado a<select name="asignadoA" value={formulario.asignadoA} onChange={actualizarCampo} required>{usuarios.map((usuarioItem) => <option key={usuarioItem._id} value={usuarioItem._id}>{etiquetaUsuarioConRol(usuarioItem)}</option>)}</select></label>
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
              <article><span>Responsable</span><strong>{etiquetaUsuarioConRol(detalle.asignadoA)}</strong></article>
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
            {!soloLectura && detalle.estado !== 'Completada' && (
              <div className="form-card tarea-completar-card">
                <label>Observaciones al completar<textarea rows="3" value={observacionesCompletar} onChange={(evento) => setObservacionesCompletar(evento.target.value)} /></label>
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

      {actividadIatf && (
        <div className="modal-backdrop">
          <section className="modal-panel iatf-modal">
            <div className="panel-title">
              <div><p className="eyebrow">Actividad IATF asignada</p><h2>{actividadIatf.ejecucion.pasoSnapshot.nombre}</h2><p>{actividadIatf.campana.nombre}</p></div>
              <button className="boton-link" type="button" onClick={() => setActividadIatf(null)}>Cerrar</button>
            </div>
            <div className="usuario-form-grid">
              <label>Fecha y hora real<input type="datetime-local" value={actividadIatf.fechaHoraReal} onChange={(e) => setActividadIatf((actual) => ({ ...actual, fechaHoraReal: e.target.value }))} /></label>
              {actividadIatf.productos.map((producto, indice) => {
                const insumo = actividadIatf.insumos.find((item) => item._id === producto.producto);
                return <label key={producto.producto}>Cantidad real de {insumo?.nombre || 'insumo'}<input type="number" min="0" step="0.001" value={producto.cantidad} onChange={(e) => setActividadIatf((actual) => ({ ...actual, productos: actual.productos.map((item, i) => i === indice ? { ...item, cantidad: e.target.value } : item) }))} /><small>Disponible: {insumo?.cantidadDisponible ?? '--'} {insumo?.unidad || producto.unidad}</small></label>;
              })}
              {actividadIatf.ejecucion.pasoSnapshot.tipoAccion === 'IATF' && <label>Pajuela utilizada<select value={actividadIatf.semen} onChange={(e) => setActividadIatf((actual) => ({ ...actual, semen: e.target.value }))}><option value="">Seleccionar</option>{actividadIatf.insumos.filter((item) => item.categoria === 'SEMEN').map((item) => <option key={item._id} value={item._id}>{item.toro || item.nombre} · {item.cantidadDisponible} disponibles</option>)}</select></label>}
              <div className="campo-completo iatf-aplicacion-selector"><strong>Animales atendidos ({actividadIatf.animales.length})</strong>{actividadIatf.participantes.map((participante) => { const id = String(participante.animal?._id || participante.animal); return <label key={participante._id}><input type="checkbox" checked={actividadIatf.animales.includes(id)} onChange={() => setActividadIatf((actual) => ({ ...actual, animales: actual.animales.includes(id) ? actual.animales.filter((item) => item !== id) : [...actual.animales, id] }))} /> {participante.animal?.diio || participante.animal?.identificadorFinca} {participante.animal?.nombre || ''}</label>; })}</div>
              {actividadIatf.ejecucion.pasoSnapshot.tipoAccion === 'OBSERVAR_CELO' && <div className="campo-completo iatf-aplicacion-selector"><strong>Celo observado ({actividadIatf.retornosCelo.length})</strong>{actividadIatf.participantes.filter((participante) => actividadIatf.animales.includes(String(participante.animal?._id || participante.animal))).map((participante) => { const id = String(participante.animal?._id || participante.animal); return <label key={participante._id}><input type="checkbox" checked={actividadIatf.retornosCelo.includes(id)} onChange={() => setActividadIatf((actual) => ({ ...actual, retornosCelo: actual.retornosCelo.includes(id) ? actual.retornosCelo.filter((item) => item !== id) : [...actual.retornosCelo, id] }))} /> {participante.animal?.diio || participante.animal?.identificadorFinca}</label>; })}</div>}
            </div>
            <div className="modal-actions"><button className="boton-link" type="button" onClick={() => setActividadIatf(null)}>Cancelar</button><button className="boton-primario" type="button" onClick={guardarEjecucionIatf} disabled={guardando || !actividadIatf.animales.length}>{guardando ? 'Registrando...' : 'Registrar ejecución real'}</button></div>
          </section>
        </div>
      )}

      {actividadProtocolo && (
        <div className="modal-backdrop">
          <section className="modal-panel iatf-modal">
            <div className="panel-title">
              <div><p className="eyebrow">Actividad de protocolo asignada</p><h2>{actividadProtocolo.ejecucion.nombre}</h2><p>{actividadProtocolo.tipo === 'ENGORDE' ? actividadProtocolo.ciclo.protocoloSnapshot.nombre : actividadProtocolo.banda.nombre}</p></div>
              <button className="boton-link" type="button" onClick={() => setActividadProtocolo(null)}>Cerrar</button>
            </div>
            <div className="usuario-form-grid">
              <label>Fecha real<input type="date" value={actividadProtocolo.fechaReal} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, fechaReal: e.target.value }))} /></label>
              {actividadProtocolo.tipo === 'ENGORDE' && actividadProtocolo.ejecucion.tipoAccion === 'PESAJE' && <div className="campo-completo pesajes-lote-grid">{actividadProtocolo.pesajes.map((item, indice) => <label key={item.animal}>{item.etiqueta}<input type="number" min="0.01" step="0.01" value={item.peso} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, pesajes: actual.pesajes.map((peso, i) => i === indice ? { ...peso, peso: e.target.value } : peso) }))} /></label>)}</div>}
              {actividadProtocolo.tipo === 'ENGORDE' && actividadProtocolo.ejecucion.tipoAccion === 'CAMBIO_RACION' && <label>Ración<select value={actividadProtocolo.racion} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, racion: e.target.value }))}><option value="">Seleccionar</option>{actividadProtocolo.raciones.map((item) => <option key={item._id} value={item._id}>{item.nombre} · {item.etapa}</option>)}</select></label>}
              {actividadProtocolo.tipo === 'ENGORDE' && actividadProtocolo.ejecucion.tipoAccion === 'SANIDAD' && <><label>Producto<input value={actividadProtocolo.producto} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, producto: e.target.value }))} /></label><label>Tipo<input value={actividadProtocolo.tipoSanidad} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, tipoSanidad: e.target.value }))} /></label><label>Dosis<input value={actividadProtocolo.dosis} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, dosis: e.target.value }))} /></label><label>Vía de aplicación<input value={actividadProtocolo.viaAplicacion} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, viaAplicacion: e.target.value }))} /></label></>}
              {actividadProtocolo.tipo === 'PORCINO' && <div className="campo-completo iatf-aplicacion-selector"><strong>Participantes atendidas ({actividadProtocolo.participantes.length})</strong>{actividadProtocolo.banda.participantes.filter((item) => item.estadoParticipacion !== 'RETIRADA').map((item) => { const id = String(item._id); return <label key={id}><input type="checkbox" checked={actividadProtocolo.participantes.includes(id)} onChange={() => setActividadProtocolo((actual) => ({ ...actual, participantes: actual.participantes.includes(id) ? actual.participantes.filter((actualId) => actualId !== id) : [...actual.participantes, id] }))} /> {item.animal?.diio || item.diio} · {item.animal?.nombre || item.nombre || 'Sin nombre'}</label>; })}</div>}
              {actividadProtocolo.tipo === 'PORCINO' && actividadProtocolo.ejecucion.tipoAccion === 'DIAGNOSTICO_GESTACION' && <label>Resultado<select value={actividadProtocolo.resultado} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, resultado: e.target.value }))}><option value="PREÑADA">Preñada</option><option value="VACIA">Vacía</option><option value="DUDOSA">Dudosa</option></select></label>}
              {actividadProtocolo.tipo === 'PORCINO' && actividadProtocolo.ejecucion.tipoAccion === 'CONTROL_REPETICION' && <label className="opcion-check"><input type="checkbox" checked={actividadProtocolo.retornoCelo} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, retornoCelo: e.target.checked }))} /> Se observó retorno a celo</label>}
              {actividadProtocolo.tipo === 'PORCINO' && actividadProtocolo.ejecucion.tipoAccion === 'TRATAMIENTO_REPRODUCTIVO' && <><label>Producto<input required value={actividadProtocolo.producto} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, producto: e.target.value }))} /></label><label>Tipo<input value={actividadProtocolo.tipoSanidad} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, tipoSanidad: e.target.value }))} /></label><label>Dosis<input value={actividadProtocolo.dosis} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, dosis: e.target.value }))} /></label><label>Vía de aplicación<input value={actividadProtocolo.viaAplicacion} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, viaAplicacion: e.target.value }))} /></label></>}
              {actividadProtocolo.tipo === 'PORCINO' && actividadProtocolo.ejecucion.tipoAccion === 'PARTO' && <><label>Nacidos totales<input type="number" min="0" value={actividadProtocolo.nacidosTotales} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, nacidosTotales: e.target.value }))} /></label><label>Nacidos vivos<input type="number" min="0" value={actividadProtocolo.nacidosVivos} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, nacidosVivos: e.target.value }))} /></label><label>Nacidos muertos<input type="number" min="0" value={actividadProtocolo.nacidosMuertos} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, nacidosMuertos: e.target.value }))} /></label><label>Momias<input type="number" min="0" value={actividadProtocolo.momias} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, momias: e.target.value }))} /></label></>}
              {actividadProtocolo.tipo === 'PORCINO' && actividadProtocolo.ejecucion.tipoAccion === 'DESTETE_CAMADA' && <><label>Destetados<input type="number" min="0" value={actividadProtocolo.destetados} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, destetados: e.target.value }))} /></label><label>Peso promedio al destete<input type="number" min="0" step="0.01" value={actividadProtocolo.pesoPromedioDestete} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, pesoPromedioDestete: e.target.value }))} /></label></>}
              <label className="campo-completo">Observaciones<textarea rows="3" value={actividadProtocolo.observaciones} onChange={(e) => setActividadProtocolo((actual) => ({ ...actual, observaciones: e.target.value }))} /></label>
            </div>
            <div className="modal-actions"><button className="boton-link" type="button" onClick={() => setActividadProtocolo(null)}>Cancelar</button><button className="boton-primario" type="button" onClick={guardarEjecucionProtocolo} disabled={guardando || (actividadProtocolo.tipo === 'PORCINO' && !actividadProtocolo.participantes.length)}>{guardando ? 'Registrando...' : 'Registrar ejecución real'}</button></div>
          </section>
        </div>
      )}
    </section>
  );
};

export default Tareas;
