import React from 'react';
import { useEffect, useState } from 'react';
import Animales from './Animales';
import ConteoDrone from './ConteoDrone';
import Finanzas from './Finanzas';
import ImportarExcel from './ImportarExcel';
import Navegacion from './Navegacion';
import PlanSanitario from './PlanSanitario';
import Potreros from './Potreros';
import Reproduccion from './Reproduccion';
import Reportes from './Reportes';
import Usuarios from '../pages/Usuarios';
import {
  obtenerAnimales,
  obtenerPlanesSanitarios,
  obtenerPotreros,
  obtenerRegistrosReproductivos,
  obtenerResumenFinanciero
} from '../services/api';

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
    listasMonta: 0
  });

  useEffect(() => {
    if (usuario?.rol !== 'Administrador') {
      setCargando(false);
      return;
    }

    const cargarMetricas = async () => {
      try {
        const [animales, potreros, planes, reproduccion, resumenFinanciero] = await Promise.all([
          obtenerAnimales(),
          obtenerPotreros(),
          obtenerPlanesSanitarios(),
          obtenerRegistrosReproductivos(),
          obtenerResumenFinanciero()
        ]);

        setMetricas({
          animales: animales.length,
          potreros: potreros.length,
          alertasSanidad: planes.filter((plan) => ['Vencido', 'Próximo'].includes(plan.estado)).length,
          alertasReproduccion: reproduccion.filter((registro) => [
            'Próxima a parto',
            'Lista para monta',
            'Destete próximo'
          ].includes(registro.estado)).length,
          hembras: animales.filter((animal) => animal.sexo === 'Hembra').length,
          machos: animales.filter((animal) => animal.sexo === 'Macho').length,
          gastosMes: resumenFinanciero?.totalEgresos || 0,
          potrerosDescanso: potreros.filter((potrero) => potrero.estado === 'Descanso').length,
          proximasSanidad: planes.filter((plan) => plan.estado === 'Próximo').length,
          vencidasSanidad: planes.filter((plan) => plan.estado === 'Vencido').length,
          listasMonta: reproduccion.filter((registro) => registro.estado === 'Lista para monta').length
        });
      } catch (error) {
        console.error('Error cargando metricas del dashboard', error);
      }
    };

    cargarMetricas();
  }, [usuario?.rol]);

  const navegacion = <Navegacion vistaActiva={vistaActiva} onCambiarVista={setVistaActiva} onLogout={onLogout} usuario={usuario} />;

  if (usuario?.rol !== 'Administrador') {
    return (
      <main className="dashboard-shell">
        {navegacion}
        <section className="dashboard-hero">
          <div>
            <p className="eyebrow">Acceso restringido</p>
            <h1>Sin permisos administrativos</h1>
          </div>
        </section>
        <article className="panel-alerta">
          <p className="eyebrow">Seguridad</p>
          <h2>Cuenta sin permisos</h2>
          <p>Por ahora la aplicacion requiere rol Administrador para acceder a los modulos operativos.</p>
        </article>
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

  return (
    <main className="dashboard-shell">
      {navegacion}

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Vision general de la hacienda</p>
          <h1>Buenos dias, {usuario?.nombre || 'Administrador'}</h1>
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
          <small>{metricas.listasMonta} listas para monta</small>
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
            Revisar sanidad próxima o vencida, vacas listas para monta,
            partos estimados y destetes próximos antes de cerrar la jornada.
          </p>
        </article>
      </section>
    </main>
  );
};

export default ListaUsuario;
