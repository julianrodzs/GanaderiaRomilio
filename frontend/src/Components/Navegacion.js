import React, { useEffect, useRef, useState } from 'react';
import { puedeAccederModulo } from '../constants/permisosRoles';
import CampanaNotificaciones from './CampanaNotificaciones';
import EstadoSincronizacion from './EstadoSincronizacion';
import { usePlan } from '../context/PlanContext';
import { useApariencia } from '../context/AparienciaContext';

const Navegacion = ({
  vistaActiva = 'Dashboard',
  onCambiarVista,
  usuario,
  fincas = [],
  fincaActiva,
  onCambiarFinca,
  organizaciones = [],
  organizacionActiva,
  onCambiarOrganizacion,
  onAbrirNotificaciones,
  onNavegarNotificacion,
  estadoConexion,
  onSincronizar,
  onReintentarCambio,
  onDescartarCambio
}) => {
  const { plan } = usePlan();
  const { logo } = useApariencia();
  const navegacionRef = useRef(null);
  const [desplazamiento, setDesplazamiento] = useState({ izquierda: false, derecha: false });
  const itemsBase = ['Dashboard', 'Tareas', 'Importar', 'Inventario', 'Pesajes', 'Potreros', 'Alimentacion', 'Sanidad', 'Reproduccion', 'Compras', 'Ventas', 'Finanzas', 'Reportes', 'Drone'];
  const rol = usuario?.rol || 'Consulta';
  const droneDisponible = !(plan?.plan?.codigo === 'ESENCIAL' && plan?.plan?.especiePlan === 'Porcino');
  const items = [...itemsBase, 'Mis tareas', 'Usuarios', 'Configuración']
    .filter((item) => item !== 'Drone' || droneDisponible)
    .filter((item) => item === 'Configuración' || puedeAccederModulo(rol, item));
  const esItemActivo = (item) => item === vistaActiva || (item === 'Mis tareas' && vistaActiva === 'Dashboard');
  const etiquetaItem = (item) => item === 'Dashboard' ? 'Db' : item === 'Alimentacion' ? 'Alimentación' : item;

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
        <img className="brand-logo" src={logo} alt="Logo de la organización" onError={(evento) => { evento.currentTarget.onerror = null; evento.currentTarget.src = '/assests/logo-romilio.png'; }} />
        {organizaciones.length > 1 && (
          <label className="selector-finca-header selector-organizacion-header">
            <span>Organización</span>
            <select
              value={organizacionActiva?._id || ''}
              onChange={(evento) => onCambiarOrganizacion?.(evento.target.value)}
              aria-label="Organización activa"
            >
              {organizaciones.map((organizacion) => (
                <option key={organizacion.id} value={organizacion.id}>{organizacion.nombre} · {organizacion.rol}</option>
              ))}
            </select>
          </label>
        )}
        <label className="selector-finca-header">
          <span>Finca</span>
          <select
            value={fincaActiva?._id || ''}
            onChange={(evento) => onCambiarFinca?.(evento.target.value)}
            disabled={fincas.length <= 1}
            aria-label="Finca activa"
          >
            {!fincas.length && fincaActiva && <option value={fincaActiva._id}>{fincaActiva.codigo} · {fincaActiva.nombre}</option>}
            {fincas.filter((finca) => finca.estado === 'Activa').map((finca) => (
              <option key={finca._id} value={finca._id}>{finca.codigo} · {finca.nombre}</option>
            ))}
          </select>
        </label>
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
