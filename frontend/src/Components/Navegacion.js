import React from 'react';

const Navegacion = ({ vistaActiva = 'Dashboard', onCambiarVista, onLogout, usuario }) => {
  const itemsBase = ['Dashboard', 'Tareas', 'Importar', 'Inventario', 'Potreros', 'Sanidad', 'Reproduccion', 'Finanzas', 'Reportes', 'Drone'];
  const items = usuario?.rol === 'Administrador' ? [...itemsBase, 'Usuarios'] : ['Mis tareas', 'Inventario', 'Potreros', 'Gestación'];
  const esItemActivo = (item) => item === vistaActiva || (usuario?.rol !== 'Administrador' && item === 'Mis tareas' && vistaActiva === 'Dashboard');

  return (
    <header className="app-header">
      <div className="app-brand">
        <span className="brand-icon">GR</span>
        <strong>GanaderiaRomilio</strong>
      </div>

      <nav className="app-nav" aria-label="Navegacion principal">
        {items.map((item) => (
          <button
            key={item}
            className={esItemActivo(item) ? 'nav-item activo' : 'nav-item'}
            type="button"
            onClick={() => onCambiarVista?.(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <button className="icon-button" type="button" onClick={onLogout} title="Cerrar sesion">
        Salir
      </button>
    </header>
  );
};

export default Navegacion;
