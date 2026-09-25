import React, { useEffect, useRef, useState } from 'react';
import {
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
  obtenerCantidadNotificacionesNoLeidas,
  obtenerNotificaciones
} from '../services/api';

const tiempoRelativo = (fecha) => {
  const segundos = Math.max(Math.floor((Date.now() - new Date(fecha).getTime()) / 1000), 0);
  if (segundos < 60) return 'Ahora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'Ayer' : `Hace ${dias} días`;
};

const CampanaNotificaciones = ({ onAbrirCentro, onNavegar }) => {
  const contenedorRef = useRef(null);
  const [abierta, setAbierta] = useState(false);
  const [cantidad, setCantidad] = useState(0);
  const [notificaciones, setNotificaciones] = useState([]);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      const [respuesta, conteo] = await Promise.all([
        obtenerNotificaciones({ limit: 8 }),
        obtenerCantidadNotificacionesNoLeidas()
      ]);
      setNotificaciones(respuesta.items || []);
      setCantidad(conteo.cantidad || 0);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    cargar();
    const intervalo = window.setInterval(cargar, 45000);
    const alEnfocar = () => cargar();
    window.addEventListener('focus', alEnfocar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', alEnfocar);
    };
  }, []);

  useEffect(() => {
    const cerrarFuera = (evento) => {
      if (!contenedorRef.current?.contains(evento.target)) setAbierta(false);
    };
    document.addEventListener('mousedown', cerrarFuera);
    return () => document.removeEventListener('mousedown', cerrarFuera);
  }, []);

  const abrirNotificacion = async (notificacion) => {
    if (!notificacion.leida) {
      await marcarNotificacionLeida(notificacion._id).catch(() => null);
      setCantidad((valor) => Math.max(valor - 1, 0));
      setNotificaciones((items) => items.map((item) => (
        item._id === notificacion._id ? { ...item, leida: true } : item
      )));
    }
    setAbierta(false);
    onNavegar?.(notificacion);
  };

  const marcarTodas = async () => {
    await marcarTodasNotificacionesLeidas();
    setCantidad(0);
    setNotificaciones((items) => items.map((item) => ({ ...item, leida: true })));
  };

  return (
    <div className="notificaciones-campana" ref={contenedorRef}>
      <button
        className="notificaciones-boton"
        type="button"
        title="Notificaciones"
        aria-label={`Notificaciones${cantidad ? `, ${cantidad} no leídas` : ''}`}
        aria-expanded={abierta}
        onClick={() => {
          setAbierta((valor) => !valor);
          if (!abierta) cargar();
        }}
      >
        <span aria-hidden="true">&#128276;</span>
        {cantidad > 0 && <small>{cantidad > 99 ? '99+' : cantidad}</small>}
      </button>

      {abierta && (
        <section className="notificaciones-dropdown" aria-label="Notificaciones recientes">
          <header>
            <strong>Notificaciones</strong>
            {cantidad > 0 && <button type="button" onClick={marcarTodas}>Marcar todas como leídas</button>}
          </header>
          {error && <p className="notificaciones-error">{error}</p>}
          {!error && notificaciones.length === 0 && <p className="notificaciones-vacio">No hay notificaciones.</p>}
          <div className="notificaciones-recientes">
            {notificaciones.map((notificacion) => (
              <button
                className={notificacion.leida ? 'notificacion-item' : 'notificacion-item no-leida'}
                type="button"
                key={notificacion._id}
                onClick={() => abrirNotificacion(notificacion)}
              >
                <span className="notificacion-punto" aria-hidden="true" />
                <span>
                  <strong>{notificacion.titulo}</strong>
                  <span>{notificacion.mensaje}</span>
                  <small>{tiempoRelativo(notificacion.createdAt)}</small>
                </span>
              </button>
            ))}
          </div>
          <button className="notificaciones-ver-todas" type="button" onClick={() => { setAbierta(false); onAbrirCentro?.(); }}>
            Ver todas
          </button>
        </section>
      )}
    </div>
  );
};

export { tiempoRelativo };
export default CampanaNotificaciones;
