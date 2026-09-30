import React, { useEffect, useRef, useState } from 'react';
import { puedeAccederModulo } from '../constants/permisosRoles';
import CampanaNotificaciones from './CampanaNotificaciones';
import EstadoSincronizacion from './EstadoSincronizacion';
import { usePlan } from '../context/PlanContext';

const Navegacion = ({
  vistaActiva = 'Dashboard',
  onCambiarVista,
  usuario,
  onAbrirNotificaciones,
  onNavegarNotificacion,
  estadoConexion,
  onSincronizar,
  onReintentarCambio,
  onDescartarCambio
}) => {
  const { plan } = usePlan();
  const navegacionRef = useRef(null);
  const [desplazamiento, setDesplazamiento] = useState({ izquierda: false, derecha: false });
  const itemsBase = ['Dashboard', 'Tareas', 'Importar', 'Inventario', 'Pesajes', 'Potreros', 'Sanidad', 'Reproduccion', 'Compras', 'Ventas', 'Finanzas', 'Reportes', 'Drone'];
  const rol = usuario?.rol || 'Consulta';
  const droneDisponible = !(plan?.plan?.codigo === 'ESENCIAL' && plan?.plan?.especiePlan === 'Porcino');
  const items = [...itemsBase, 'Mis tareas', 'Usuarios']
    .filter((item) => item !== 'Drone' || droneDisponible)
    .filter((item) => puedeAccederModulo(rol, item));
  const esItemActivo = (item) => item === vistaActiva || (item === 'Mis tareas' && vistaActiva === 'Dashboard');
  const etiquetaItem = (item) => (item === 'Dashboard' ? 'Db' : item);

  useEffect(() => {
    navegacionRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }, [vistaActiva]);

  useEffect(() => {
    const navegacion = navegacionRef.current;
    if (!navegacion) return undefined;
    const actualizar = () => setDesplazamiento({
      izquierda: navegacion.scrollLeft > 2,
      derecha: navegacion.scrollLeft + navegacion.clientWidth < navegacion.scrollWidth - 2
    });
    actualizar();
    navegacion.addEventListener('scroll', actualizar, { passive: true });
    window.addEventListener('resize', actualizar);
    return () => {
      navegacion.removeEventListener('scroll', actualizar);
      window.removeEventListener('resize', actualizar);
    };
  }, [items.length]);

  const desplazarMenu = (direccion) => {
    navegacionRef.current?.scrollBy({ left: direccion * 360, behavior: 'smooth' });
  };

  return (
    <header className="app-header">
      <div className="app-brand">
        <span className="brand-icon">GR</span>
      </div>

      <div className="app-nav-shell">
        <button className="app-nav-scroll" type="button" title="Módulos anteriores" aria-label="Módulos anteriores" disabled={!desplazamiento.izquierda} onClick={() => desplazarMenu(-1)}>‹</button>
        <nav ref={navegacionRef} className="app-nav" aria-label="Navegacion principal">
          {items.map((item) => (
            <button
              key={item}
              className={esItemActivo(item) ? 'nav-item activo' : 'nav-item'}
              type="button"
              aria-current={esItemActivo(item) ? 'page' : undefined}
              onClick={() => onCambiarVista?.(item)}
            >
              {etiquetaItem(item)}
            </button>
          ))}
        </nav>
        <button className="app-nav-scroll" type="button" title="Módulos siguientes" aria-label="Módulos siguientes" disabled={!desplazamiento.derecha} onClick={() => desplazarMenu(1)}>›</button>
      </div>
      <EstadoSincronizacion
        estado={estadoConexion}
        onSincronizar={onSincronizar}
        onReintentar={onReintentarCambio}
        onDescartar={onDescartarCambio}
      />
      <CampanaNotificaciones onAbrirCentro={onAbrirNotificaciones} onNavegar={onNavegarNotificacion} />
    </header>
  );
};

export default Navegacion;
