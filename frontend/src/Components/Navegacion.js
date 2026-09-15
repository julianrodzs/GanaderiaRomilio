import React from 'react';
import { puedeAccederModulo } from '../constants/permisosRoles';

const Navegacion = ({ vistaActiva = 'Dashboard', onCambiarVista, onLogout, usuario }) => {
  const itemsBase = ['Dashboard', 'Tareas', 'Importar', 'Inventario', 'Pesajes', 'Potreros', 'Sanidad', 'Reproduccion', 'Compras', 'Ventas', 'Finanzas', 'Reportes', 'Drone'];
  const rol = usuario?.rol || 'Consulta';
  const items = [...itemsBase, 'Mis tareas', 'Usuarios'].filter((item) => puedeAccederModulo(rol, item));
  const esItemActivo = (item) => item === vistaActiva || (item === 'Mis tareas' && vistaActiva === 'Dashboard');
  const etiquetaItem = (item) => (item === 'Dashboard' ? 'Db' : item);

  return (
    <header className="app-header">
      <div className="app-brand">
        <span className="brand-icon">GR</span>
      </div>

      <nav className="app-nav" aria-label="Navegacion principal">
        {items.map((item) => (
          <button
            key={item}
            className={esItemActivo(item) ? 'nav-item activo' : 'nav-item'}
            type="button"
            onClick={() => onCambiarVista?.(item)}
          >
            {etiquetaItem(item)}
          </button>
        ))}
      </nav>
    </header>
  );
};

export default Navegacion;
