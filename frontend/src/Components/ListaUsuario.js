import React from 'react';
import { useEffect, useState } from 'react';
import Animales from './Animales';
import ConteoDrone from './ConteoDrone';
import ImportarExcel from './ImportarExcel';
import Navegacion from './Navegacion';
import PlanSanitario from './PlanSanitario';
import Potreros from './Potreros';
import { obtenerAnimales, obtenerPlanesSanitarios, obtenerPotreros } from '../services/api';

const ListaUsuario = ({ usuario, onLogout }) => {
  const [vistaActiva, setVistaActiva] = useState('Dashboard');
  const [metricas, setMetricas] = useState({
    animales: 0,
    potreros: 0,
    alertasSanidad: 0,
    hembras: 0,
    machos: 0
  });

  useEffect(() => {
    const cargarMetricas = async () => {
      try {
        const [animales, potreros, planes] = await Promise.all([
          obtenerAnimales(),
          obtenerPotreros(),
          obtenerPlanesSanitarios()
        ]);

        setMetricas({
          animales: animales.length,
          potreros: potreros.length,
          alertasSanidad: planes.filter((plan) => ['Vencido', 'Próximo'].includes(plan.estado)).length,
          hembras: animales.filter((animal) => animal.sexo === 'Hembra').length,
          machos: animales.filter((animal) => animal.sexo === 'Macho').length
        });
      } catch (error) {
        console.error('Error cargando metricas del dashboard', error);
      }
    };

    cargarMetricas();
  }, []);

  if (vistaActiva === 'Importar') {
    return (
      <main className="dashboard-shell">
        <Navegacion vistaActiva={vistaActiva} onCambiarVista={setVistaActiva} onLogout={onLogout} />
        <ImportarExcel />
      </main>
    );
  }

  if (vistaActiva === 'Inventario') {
    return (
      <main className="dashboard-shell">
        <Navegacion vistaActiva={vistaActiva} onCambiarVista={setVistaActiva} onLogout={onLogout} />
        <Animales />
      </main>
    );
  }

  if (vistaActiva === 'Potreros') {
    return (
      <main className="dashboard-shell">
        <Navegacion vistaActiva={vistaActiva} onCambiarVista={setVistaActiva} onLogout={onLogout} />
        <Potreros />
      </main>
    );
  }

  if (vistaActiva === 'Sanidad') {
    return (
      <main className="dashboard-shell">
        <Navegacion vistaActiva={vistaActiva} onCambiarVista={setVistaActiva} onLogout={onLogout} />
        <PlanSanitario />
      </main>
    );
  }

  if (vistaActiva === 'Drone') {
    return (
      <main className="dashboard-shell">
        <Navegacion vistaActiva={vistaActiva} onCambiarVista={setVistaActiva} onLogout={onLogout} />
        <ConteoDrone />
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <Navegacion vistaActiva={vistaActiva} onCambiarVista={setVistaActiva} onLogout={onLogout} />

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
          <strong>{metricas.animales}</strong>
          <small>{metricas.hembras} hembras / {metricas.machos} machos</small>
        </article>
        <article className="metric-card">
          <span>Potreros activos</span>
          <strong>{metricas.potreros}</strong>
          <small>Potreros registrados en sistema</small>
        </article>
        <article className="metric-card">
          <span>Gastos del mes</span>
          <strong>$0.00</strong>
          <small>Modulo de costos disponible</small>
        </article>
        <article className="metric-card">
          <span>Alertas sanidad</span>
          <strong>{metricas.alertasSanidad}</strong>
          <small>Planes vencidos o proximos</small>
        </article>
      </section>

      <section className="dashboard-content">
        <article className="panel-mapa">
          <div className="panel-title">
            <h2>Ubicacion de lotes</h2>
            <span>Mapa real</span>
          </div>
          <img className="dashboard-mapa-potreros" src="/assests/mapa-potreros.png" alt="Mapa de potreros de la finca" />
        </article>

        <article className="panel-alerta">
          <p className="eyebrow">Siguiente paso</p>
          <h2>Datos operativos</h2>
          <p>
            El dashboard ya refleja inventario, potreros y alertas sanitarias
            registradas en la base de datos.
          </p>
        </article>
      </section>
    </main>
  );
};

export default ListaUsuario;
