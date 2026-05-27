import React from 'react';
import Navegacion from './Navegacion';

const ListaUsuario = ({ usuario, onLogout }) => {
  return (
    <main className="dashboard-shell">
      <Navegacion onLogout={onLogout} />

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Vision general de la hacienda</p>
          <h1>Buenos dias, {usuario?.nombre || 'Administrador'}</h1>
        </div>
        <button className="boton-primario compacto" type="button">Nuevo registro</button>
      </section>

      <section className="metricas-grid">
        <article className="metric-card">
          <span>Total cabezas</span>
          <strong>0</strong>
          <small>Inventario listo para conectar</small>
        </article>
        <article className="metric-card">
          <span>Potreros activos</span>
          <strong>0</strong>
          <small>Rotaciones pendientes</small>
        </article>
        <article className="metric-card">
          <span>Gastos del mes</span>
          <strong>$0.00</strong>
          <small>Modulo de costos disponible</small>
        </article>
        <article className="metric-card">
          <span>Estado de salud</span>
          <strong>Optimo</strong>
          <small>Sin alertas registradas</small>
        </article>
      </section>

      <section className="dashboard-content">
        <article className="panel-mapa">
          <div className="panel-title">
            <h2>Ubicacion de lotes</h2>
            <span>Vista inicial</span>
          </div>
          <div className="campo-visual">
            <span className="lote lote-a">Lote 08</span>
            <span className="lote lote-b">Lote 12</span>
            <span className="lote lote-c">Lote 05</span>
          </div>
        </article>

        <article className="panel-alerta">
          <p className="eyebrow">Siguiente paso</p>
          <h2>Conectar datos reales</h2>
          <p>
            El login ya queda operativo. Desde aqui podemos traer animales,
            potreros y costos desde la API.
          </p>
        </article>
      </section>
    </main>
  );
};

export default ListaUsuario;
