import React from 'react';
import { useEffect, useState } from 'react';
import Animales from './Animales';
import ConteoDrone from './ConteoDrone';
import Finanzas from './Finanzas';
import ImportarExcel from './ImportarExcel';
import Navegacion from './Navegacion';
import Pesajes from './Pesajes';
import PlanSanitario from './PlanSanitario';
import Potreros from './Potreros';
import Reproduccion from './Reproduccion';
import Reportes from './Reportes';
import Usuarios from '../pages/Usuarios';
import Tareas from '../pages/Tareas';
import {
  obtenerAnimales,
  obtenerPlanesSanitarios,
  obtenerPotreros,
  obtenerProductividadCria,
  obtenerRegistrosReproductivos,
  obtenerResumenFinanciero
} from '../services/api';
import { obtenerCambiosPendientes } from '../services/offlineStorage';

const obtenerRangoAnioActual = () => {
  const anio = new Date().getFullYear();
  return {
    fechaInicio: `${anio}-01-01`,
    fechaFin: `${anio}-12-31`
  };
};

const obtenerNivelIpg = (ipg) => {
  if (ipg >= 95) return 'excelente';
  if (ipg >= 85) return 'muy-bueno';
  if (ipg >= 75) return 'bueno';
  if (ipg >= 60) return 'regular';
  return 'deficiente';
};

const ListaUsuario = ({ usuario, onLogout }) => {
  const [vistaActiva, setVistaActiva] = useState('Dashboard');
  const [metricas, setMetricas] = useState({
    animales: 0,
    potreros: 0,
    alertasSanidad: 0,
    alertasReproduccion: 0,
    hembras: 0,
    machos: 0,
    gastosMes: 0,
    potrerosDescanso: 0,
    proximasSanidad: 0,
    vencidasSanidad: 0,
    proximosCelos: 0,
    ipg: 0,
    clasificacionIpg: 'Deficiente'
  });
  const [estadoConexion, setEstadoConexion] = useState({
    online: navigator.onLine,
    pendientes: 0
  });

  useEffect(() => {
    if (usuario?.rol !== 'Administrador') {
      return;
    }

    const cargarMetricas = async () => {
      try {
        const [animales, potreros, planes, reproduccion, resumenFinanciero, productividad] = await Promise.all([
          obtenerAnimales(),
          obtenerPotreros(),
          obtenerPlanesSanitarios(),
          obtenerRegistrosReproductivos(),
          obtenerResumenFinanciero(),
          obtenerProductividadCria(obtenerRangoAnioActual())
        ]);

        setMetricas({
          animales: animales.length,
          potreros: potreros.length,
          alertasSanidad: planes.filter((plan) => ['Vencido', 'Próximo'].includes(plan.estado)).length,
          alertasReproduccion: reproduccion.filter((registro) => [
            'Próxima a parto',
            'Próximo celo estimado',
            'Destete próximo'
          ].includes(registro.estado)).length,
          hembras: animales.filter((animal) => animal.sexo === 'Hembra').length,
          machos: animales.filter((animal) => animal.sexo === 'Macho').length,
          gastosMes: resumenFinanciero?.totalEgresos || 0,
          potrerosDescanso: potreros.filter((potrero) => potrero.estado === 'Descanso').length,
          proximasSanidad: planes.filter((plan) => plan.estado === 'Próximo').length,
          vencidasSanidad: planes.filter((plan) => plan.estado === 'Vencido').length,
          proximosCelos: reproduccion.filter((registro) => registro.estado === 'Próximo celo estimado').length,
          ipg: productividad?.ipg || 0,
          clasificacionIpg: productividad?.clasificacion || 'Deficiente'
        });
      } catch (error) {
        console.error('Error cargando metricas del dashboard', error);
      }
    };

    cargarMetricas();
  }, [usuario?.rol]);

  useEffect(() => {
    const actualizarEstadoConexion = async () => {
      const cambios = await obtenerCambiosPendientes().catch(() => []);
      setEstadoConexion({
        online: navigator.onLine,
        pendientes: cambios.length
      });
    };

    window.addEventListener('online', actualizarEstadoConexion);
    window.addEventListener('offline', actualizarEstadoConexion);
    window.addEventListener('ganaderiaOfflineCambios', actualizarEstadoConexion);
    actualizarEstadoConexion();

    return () => {
      window.removeEventListener('online', actualizarEstadoConexion);
      window.removeEventListener('offline', actualizarEstadoConexion);
      window.removeEventListener('ganaderiaOfflineCambios', actualizarEstadoConexion);
    };
  }, []);

  const navegacion = <Navegacion vistaActiva={vistaActiva} onCambiarVista={setVistaActiva} onLogout={onLogout} usuario={usuario} />;

  if (usuario?.rol !== 'Administrador') {
    if (vistaActiva === 'Inventario') {
      return (
        <main className="dashboard-shell">
          {navegacion}
          <Animales soloLectura />
        </main>
      );
    }

    if (vistaActiva === 'Potreros') {
      return (
        <main className="dashboard-shell">
          {navegacion}
          <Potreros soloLectura />
        </main>
      );
    }

    if (vistaActiva === 'Gestación' || vistaActiva === 'Reproduccion') {
      return (
        <main className="dashboard-shell">
          {navegacion}
          <Reproduccion soloLectura />
        </main>
      );
    }

    return (
      <main className="dashboard-shell">
        {navegacion}
        <Tareas usuario={usuario} />
      </main>
    );
  }

  if (vistaActiva === 'Importar') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <ImportarExcel />
      </main>
    );
  }

  if (vistaActiva === 'Inventario') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Animales />
      </main>
    );
  }

  if (vistaActiva === 'Potreros') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Potreros />
      </main>
    );
  }

  if (vistaActiva === 'Pesajes') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Pesajes />
      </main>
    );
  }

  if (vistaActiva === 'Sanidad') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <PlanSanitario />
      </main>
    );
  }

  if (vistaActiva === 'Reproduccion') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Reproduccion />
      </main>
    );
  }

  if (vistaActiva === 'Finanzas' || vistaActiva === 'Costos') {
    return (
      <main className="dashboard-shell">
        <Navegacion vistaActiva="Finanzas" onCambiarVista={setVistaActiva} onLogout={onLogout} usuario={usuario} />
        <Finanzas />
      </main>
    );
  }

  if (vistaActiva === 'Reportes') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Reportes />
      </main>
    );
  }

  if (vistaActiva === 'Drone') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <ConteoDrone />
      </main>
    );
  }

  if (vistaActiva === 'Usuarios') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Usuarios usuarioActual={usuario} />
      </main>
    );
  }

  if (vistaActiva === 'Tareas') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <Tareas usuario={usuario} />
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      {navegacion}

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Vision general de la hacienda</p>
          <div className="dashboard-saludo-linea">
            <h1>Buenos dias, {usuario?.nombre || 'Administrador'}</h1>
            <div className="app-status">
              <span className={estadoConexion.online ? 'status-pill online' : 'status-pill offline'}>
                {estadoConexion.online ? 'Online' : 'Offline'}
              </span>
              {estadoConexion.pendientes > 0 && <span className="status-pill pending">{estadoConexion.pendientes} pendientes</span>}
            </div>
          </div>
        </div>
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
          <small>{metricas.potrerosDescanso} en descanso</small>
        </article>
        <article className="metric-card">
          <span>Egresos registrados</span>
          <strong>{new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(metricas.gastosMes)}</strong>
          <small>Modulo de finanzas activo</small>
        </article>
        <article className="metric-card">
          <span>Alertas sanidad</span>
          <strong>{metricas.alertasSanidad}</strong>
          <small>{metricas.vencidasSanidad} vencidas / {metricas.proximasSanidad} proximas</small>
        </article>
        <article className="metric-card">
          <span>Alertas reproduccion</span>
          <strong>{metricas.alertasReproduccion}</strong>
          <small>{metricas.proximosCelos} próximos celos estimados</small>
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
          <p className="eyebrow">Alertas operativas</p>
          <h2>Seguimiento diario</h2>
          <p>
            Revisar sanidad próxima o vencida, próximos celos estimados,
            partos estimados y destetes próximos antes de cerrar la jornada.
          </p>
          <div className={`dashboard-ipg-card ipg-fondo-${obtenerNivelIpg(metricas.ipg)}`}>
            <span>IPG</span>
            <strong>{metricas.ipg}</strong>
            <small>{metricas.clasificacionIpg}</small>
          </div>
          <div className="dashboard-logout-row">
            <button className="logout-dashboard-button" type="button" onClick={onLogout}>
              Salir
            </button>
          </div>
        </article>
      </section>
    </main>
  );
};

export default ListaUsuario;
