import React, { useEffect, useState } from 'react';
import {
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
  obtenerNotificaciones
} from '../services/api';
import { tiempoRelativo } from '../Components/CampanaNotificaciones';

const CentroNotificaciones = ({ onNavegar }) => {
  const [filtros, setFiltros] = useState({ leida: '', naturaleza: '', moduloOrigen: '' });
  const [respuesta, setRespuesta] = useState({ items: [], total: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      setCargando(true);
      setRespuesta(await obtenerNotificaciones({ ...filtros, limit: 100 }));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [filtros.leida, filtros.naturaleza, filtros.moduloOrigen]);

  const abrir = async (notificacion) => {
    if (!notificacion.leida) await marcarNotificacionLeida(notificacion._id).catch(() => null);
    onNavegar?.(notificacion);
  };

  const marcarTodas = async () => {
    await marcarTodasNotificacionesLeidas();
    await cargar();
  };

  return (
    <section className="centro-notificaciones-page">
      <div className="panel-title">
        <div><p className="eyebrow">Actividad</p><h1>Centro de alertas</h1></div>
        <button className="boton-link" type="button" onClick={marcarTodas}>Marcar todas como leídas</button>
      </div>
      <div className="notificaciones-filtros">
        <label>
          <span>Lectura</span>
          <select value={filtros.leida} onChange={(e) => setFiltros((f) => ({ ...f, leida: e.target.value }))}>
            <option value="">Todas</option><option value="false">No leídas</option><option value="true">Leídas</option>
          </select>
        </label>
        <label>
          <span>Tipo de alerta</span>
          <select value={filtros.naturaleza} onChange={(e) => setFiltros((f) => ({ ...f, naturaleza: e.target.value }))}>
            <option value="">Operativas e informativas</option><option value="Operativa">Operativas</option><option value="Informativa">Informativas</option>
          </select>
        </label>
        <label>
          <span>Módulo</span>
          <select value={filtros.moduloOrigen} onChange={(e) => setFiltros((f) => ({ ...f, moduloOrigen: e.target.value }))}>
            <option value="">Todos los módulos</option>
            {['Tareas', 'Sanidad', 'Reproduccion', 'Pesajes', 'Finanzas'].map((modulo) => <option key={modulo} value={modulo}>{modulo === 'Reproduccion' ? 'Reproducción' : modulo}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="alerta-formulario">{error}</div>}
      {cargando && <div className="estado-importacion">Cargando notificaciones...</div>}
      {!cargando && !respuesta.items.length && <div className="reporte-vacio">No hay notificaciones para estos filtros.</div>}
      <div className="centro-notificaciones-lista">
        {respuesta.items.map((notificacion) => (
          <button key={notificacion._id} type="button" className={notificacion.leida ? 'centro-notificacion' : 'centro-notificacion no-leida'} onClick={() => abrir(notificacion)}>
            <span className="notificacion-punto" aria-hidden="true" />
            <span className="centro-notificacion-contenido">
              <span className="centro-notificacion-cabecera">
                <strong>{notificacion.titulo}</strong>
                <small>{tiempoRelativo(notificacion.createdAt)}</small>
              </span>
              <span>{notificacion.mensaje}</span>
              <span className="centro-notificacion-meta">
                <small>{notificacion.naturaleza}</small><small>{notificacion.moduloOrigen || 'Sistema'}</small><small>{notificacion.leida ? 'Leída' : 'No leída'}</small>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default CentroNotificaciones;
