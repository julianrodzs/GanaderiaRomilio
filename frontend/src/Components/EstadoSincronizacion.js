import React, { useEffect, useRef, useState } from 'react';

const etiquetasEstado = {
  Pendiente: 'Pendiente',
  Sincronizando: 'Sincronizando',
  Fallido: 'Fallido',
  Conflicto: 'Requiere revision'
};

const formatearFechaHora = (fecha) => {
  if (!fecha) return 'Aun no se ha sincronizado';
  return new Date(fecha).toLocaleString('es-CR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
};

const EstadoSincronizacion = ({ estado, onSincronizar, onReintentar, onDescartar }) => {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);
  const cambios = estado.cambios || [];
  const fechasRecursos = Object.values(estado.recursosOffline || {}).filter(Boolean).map((fecha) => new Date(fecha));
  const ultimaDescarga = fechasRecursos.length
    ? new Date(Math.max(...fechasRecursos.map((fecha) => fecha.getTime())))
    : null;
  const cacheDesactualizado = ultimaDescarga && Date.now() - ultimaDescarga.getTime() > 24 * 60 * 60 * 1000;

  useEffect(() => {
    const cerrarFuera = (evento) => {
      if (!contenedorRef.current?.contains(evento.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrarFuera);
    return () => document.removeEventListener('mousedown', cerrarFuera);
  }, []);

  return (
    <div className="offline-status" ref={contenedorRef}>
      <button
        className={`offline-status-trigger ${estado.online ? 'online' : 'offline'}`}
        type="button"
        onClick={() => setAbierto((actual) => !actual)}
        aria-expanded={abierto}
        title="Estado de conexion y sincronizacion"
      >
        <span className="offline-status-dot" aria-hidden="true" />
        <span>{estado.online ? 'Online' : 'Offline'}</span>
        {cambios.length > 0 && <strong>{cambios.length}</strong>}
      </button>

      {abierto && (
        <section className="offline-panel" aria-label="Estado de sincronizacion">
          <div className="offline-panel-header">
            <div>
              <span>Sincronizacion</span>
              <strong>{estado.online ? 'Conexion disponible' : 'Trabajando sin conexion'}</strong>
            </div>
            <button
              type="button"
              title="Sincronizar ahora"
              aria-label="Sincronizar ahora"
              onClick={onSincronizar}
              disabled={!estado.online || estado.sincronizando}
            >
              ↻
            </button>
          </div>

          <p className="offline-last-sync">
            Ultima sincronizacion: {formatearFechaHora(estado.ultimaSincronizacion)}
          </p>
          <p className="offline-last-sync">
            Datos guardados: {formatearFechaHora(ultimaDescarga)}
            {cacheDesactualizado ? ' · Requieren actualizacion' : ''}
          </p>

          {cambios.length === 0 ? (
            <p className="offline-empty">No hay cambios pendientes.</p>
          ) : (
            <div className="offline-changes">
              {cambios.map((cambio) => (
                <article key={cambio.id}>
                  <div>
                    <strong>{cambio.titulo || 'Completar tarea'}</strong>
                    <span className={`offline-change-state estado-${(cambio.estadoSincronizacion || 'Pendiente').toLowerCase()}`}>
                      {etiquetasEstado[cambio.estadoSincronizacion] || cambio.estadoSincronizacion}
                    </span>
                  </div>
                  {cambio.errorSincronizacion && <p>{cambio.errorSincronizacion}</p>}
                  <small>{cambio.intentos || 0} intento(s)</small>
                  <div className="offline-change-actions">
                    {['Fallido', 'Conflicto'].includes(cambio.estadoSincronizacion) && (
                      <button
                        type="button"
                        title="Reintentar sincronizacion"
                        aria-label="Reintentar sincronizacion"
                        onClick={() => onReintentar(cambio.id)}
                        disabled={!estado.online || estado.sincronizando}
                      >
                        ↻
                      </button>
                    )}
                    <button
                      type="button"
                      title="Descartar cambio local"
                      aria-label="Descartar cambio local"
                      onClick={() => onDescartar(cambio.id)}
                      disabled={estado.sincronizando}
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <p className="offline-scope-note">Offline: inventario, potreros y finalizacion de tareas asignadas.</p>
        </section>
      )}
    </div>
  );
};

export default EstadoSincronizacion;
